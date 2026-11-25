"use strict";
// Tapacaras: find faces in a photo and cover them, entirely in this browser tab.
// Kept out of index.html so the Content-Security-Policy can forbid inline scripts.

// ---- Settings someone will be tempted to change ----

// YuNet score cut-off. Measured on a 49-frame test set (docs/DECISIONS.md): 0.5 found 39/48 clear faces
// with 11 stray boxes; 0.3 found 47/48 but with 82 strays. Strays cost a tap; misses are why the
// "drag to cover" tool exists.
const SCORE_THRESHOLD = 0.5;
// YuNet sees faces of roughly 10–300 px, so each photo is scanned small (close-ups) and large
// (faces across the room). 1920 keeps the slow pass to ~1–2 s on a phone.
const SCAN_SIDES = [640, 1920];
// iOS Safari refuses canvases above ~16.7 M pixels; bigger photos are scaled down to fit.
const MAX_PIXELS = 16_000_000;
// Covers reach past the detector's box so hair, ears and chins are hidden too.
const COVER_PAD = 0.3;
// GoatCounter site code; empty means no visit counting at all. Counting runs only on the real host,
// and the CSP in index.html must list the same host or the browser blocks the pixel.
const GOATCOUNTER_CODE = "";
const COUNT_HOST = "marcelloavila.com";

// ---- Pure logic: no DOM, no storage. Covered by the self-test. ----

function fitScale(w, h, maxPixels = MAX_PIXELS) {
  return w * h <= maxPixels ? 1 : Math.sqrt(maxPixels / (w * h));
}

// Size of the detector input for one scan: scaled so the long side is `side` (never enlarged),
// then padded up to a multiple of 32 as YuNet's strides require.
function scanPlan(w, h, side) {
  const k = Math.min(1, side / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * k)), sh = Math.max(1, Math.round(h * k));
  return { k, sw, sh, pw: Math.ceil(sw / 32) * 32, ph: Math.ceil(sh / 32) * 32 };
}

// Same decoding as OpenCV's FaceDetectorYN. `out` maps output names to flat arrays.
function decodeYunet(out, pw, ph, k, thresh = SCORE_THRESHOLD) {
  const faces = [];
  for (const s of [8, 16, 32]) {
    const cols = pw / s, n = cols * (ph / s);
    const cls = out[`cls_${s}`], obj = out[`obj_${s}`], b = out[`bbox_${s}`];
    for (let i = 0; i < n; i++) {
      const score = Math.sqrt(clamp01(cls[i]) * clamp01(obj[i]));
      if (score < thresh) continue;
      const c = i % cols, r = Math.floor(i / cols);
      const cx = (c + b[4 * i]) * s, cy = (r + b[4 * i + 1]) * s;
      const w = Math.exp(b[4 * i + 2]) * s, h = Math.exp(b[4 * i + 3]) * s;
      faces.push({ x: (cx - w / 2) / k, y: (cy - h / 2) / k, w: w / k, h: h / k, score });
    }
  }
  return faces;
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function iou(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

function nms(faces, limit = 0.3) {
  const keep = [];
  for (const f of [...faces].sort((a, b) => b.score - a.score)) {
    if (keep.every((k) => iou(f, k) <= limit)) keep.push(f);
  }
  return keep;
}

function padBox(f, pad, W, H) {
  const x = Math.max(0, f.x - f.w * pad), y = Math.max(0, f.y - f.h * pad);
  const x2 = Math.min(W, f.x + f.w * (1 + pad)), y2 = Math.min(H, f.y + f.h * (1 + pad));
  return { x, y, w: Math.max(1, x2 - x), h: Math.max(1, y2 - y) };
}

// The smallest face whose (padded) box contains the point, so nested boxes stay reachable.
function hitTest(faces, px, py, W, H) {
  let best = -1, bestArea = Infinity;
  faces.forEach((f, i) => {
    const b = padBox(f, COVER_PAD, W, H);
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h && b.w * b.h < bestArea) {
      best = i; bestArea = b.w * b.h;
    }
  });
  return best;
}

// A box dragged by hand, in either direction. Too small means it was a tap, not a drag.
function rectFromDrag(x1, y1, x2, y2, minSide) {
  const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  if (w < minSide || h < minSide) return null;
  // Stored un-padded so a hand-drawn box covers exactly what was dragged.
  const p = 1 + 2 * COVER_PAD;
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  return { x: cx - w / p / 2, y: cy - h / p / 2, w: w / p, h: h / p, score: 1, manual: true };
}

function outName(name) {
  const base = (name || "foto").replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 60) || "foto";
  return `${base}-tapada.jpg`;
}

function statusText(n) {
  if (n === 0) return "No encontramos caras. Si hay alguna, arrastrá sobre ella para taparla.";
  if (n === 1) return "Te tapamos 1 cara. ¡Podés tocarla para deshacerlo o arrastrar si faltó alguna!";
  return `Te tapamos ${n} caras. ¡Podés tocar cada una para deshacerlo o arrastrar si faltó alguna!`;
}

// ---- Detection (ONNX Runtime Web, WebAssembly, single thread: GitHub Pages can't enable threads) ----

let sessionPromise = null;
function loadModel() {
  if (!sessionPromise) {
    ort.env.wasm.wasmPaths = new URL("vendor/", location.href).href; // must be absolute: ORT imports from it
    ort.env.wasm.numThreads = 1;
    sessionPromise = ort.InferenceSession.create("models/yunet-2026may.onnx", { executionProviders: ["wasm"] });
  }
  return sessionPromise;
}

async function detectFaces(source, W, H) {
  const session = await loadModel();
  let faces = [];
  for (const side of SCAN_SIDES) {
    const p = scanPlan(W, H, side);
    if (side !== SCAN_SIDES[0] && p.k === scanPlan(W, H, SCAN_SIDES[0]).k) continue; // small photo: one scan is enough
    const c = new OffscreenCanvas(p.pw, p.ph), cx = c.getContext("2d", { willReadFrequently: true });
    cx.fillStyle = "#000"; cx.fillRect(0, 0, p.pw, p.ph);
    cx.drawImage(source, 0, 0, p.sw, p.sh);
    const px = cx.getImageData(0, 0, p.pw, p.ph).data, plane = p.pw * p.ph;
    const data = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) { // YuNet wants BGR, 0–255, planar
      data[i] = px[4 * i + 2]; data[plane + i] = px[4 * i + 1]; data[2 * plane + i] = px[4 * i];
    }
    const res = await session.run({ input: new ort.Tensor("float32", data, [1, 3, p.ph, p.pw]) });
    const out = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.data]));
    faces = faces.concat(decodeYunet(out, p.pw, p.ph, p.k));
  }
  return nms(faces).map((f) => ({ ...f, covered: true, manual: false }));
}

// ---- Drawing ----

function drawCover(ctx, src, b, style) {
  const { x, y, w, h } = b;
  if (style === "emoji") {
    const size = Math.max(w, h) * 1.15;
    ctx.save();
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🙂", x + w / 2, y + h / 2 + size * 0.06);
    ctx.restore();
    return;
  }
  const blocks = style === "pixel" ? 9 : 5; // fewer blocks = stronger blur
  const sw = Math.max(2, Math.round((w / Math.max(w, h)) * blocks)), sh = Math.max(2, Math.round((h / Math.max(w, h)) * blocks));
  const small = new OffscreenCanvas(sw, sh), sc = small.getContext("2d");
  sc.imageSmoothingQuality = "high";
  sc.drawImage(src, x, y, w, h, 0, 0, sw, sh);
  ctx.save();
  ctx.beginPath();
  if (style === "pixel") ctx.rect(x, y, w, h);
  else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.imageSmoothingEnabled = style !== "pixel";
  ctx.drawImage(small, 0, 0, sw, sh, x, y, w, h);
  ctx.restore();
}

function render(ctx, src, faces, style, guides, drag) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.drawImage(src, 0, 0, W, H);
  for (const f of faces) {
    const b = padBox(f, COVER_PAD, W, H);
    if (f.covered) drawCover(ctx, src, b, style);
    else if (guides) { // uncovered faces keep a dashed outline so they can be found and tapped again
      ctx.save();
      ctx.lineWidth = Math.max(2, W / 400);
      ctx.setLineDash([ctx.lineWidth * 3, ctx.lineWidth * 2]);
      ctx.strokeStyle = "#ffd23f";
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.restore();
    }
  }
  if (drag) {
    ctx.save();
    ctx.lineWidth = Math.max(2, W / 400);
    ctx.strokeStyle = "#ff5c5c";
    ctx.strokeRect(Math.min(drag.x1, drag.x2), Math.min(drag.y1, drag.y2), Math.abs(drag.x2 - drag.x1), Math.abs(drag.y2 - drag.y1));
    ctx.restore();
  }
}

// ---- Feature check ----

function supported() {
  return typeof WebAssembly === "object" && typeof createImageBitmap === "function" &&
    typeof OffscreenCanvas === "function" && typeof ort === "object";
}

// ---- UI ----

function createApp(el) {
  const state = { src: null, faces: [], style: "blur", name: "", busy: false };
  const ctx = el.canvas.getContext("2d");
  const draw = (drag) => state.src && render(ctx, state.src, state.faces, state.style, true, drag);
  const say = (t) => { el.status.textContent = t; };

  async function open(file) {
    if (!file || state.busy) return;
    state.busy = true; el.download.disabled = true;
    say("Abriendo la foto…");
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const k = fitScale(bmp.width, bmp.height);
      const W = Math.round(bmp.width * k), H = Math.round(bmp.height * k);
      el.canvas.width = W; el.canvas.height = H;
      state.src = k === 1 ? bmp : await createImageBitmap(bmp, { resizeWidth: W, resizeHeight: H, resizeQuality: "high" });
      state.name = file.name; state.faces = [];
      el.editor.hidden = false; el.sample.hidden = true; draw();
      say("Buscando caras… (la primera vez tarda un poco más)");
      state.faces = await detectFaces(state.src, W, H);
      draw(); say(statusText(state.faces.length));
      el.download.disabled = false;
    } catch (e) {
      console.error(e);
      say("No pudimos abrir esa imagen. Probá con una foto JPG o PNG.");
    } finally { state.busy = false; }
  }

  function toCanvas(e) {
    const r = el.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * el.canvas.width / r.width, y: (e.clientY - r.top) * el.canvas.height / r.height, perPx: el.canvas.width / r.width };
  }
  let drag = null;
  const fingers = new Set();
  el.canvas.addEventListener("pointerdown", (e) => {
    fingers.add(e.pointerId);
    if (fingers.size > 1) { if (drag) { drag = null; draw(); } return; }
    if (!state.src || state.busy) return;
    const p = toCanvas(e); drag = { id: e.pointerId, x1: p.x, y1: p.y, x2: p.x, y2: p.y, perPx: p.perPx, moved: false };
    el.canvas.setPointerCapture(e.pointerId);
  });
  el.canvas.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = toCanvas(e); drag.x2 = p.x; drag.y2 = p.y;
    if (Math.hypot(drag.x2 - drag.x1, drag.y2 - drag.y1) > 12 * drag.perPx) drag.moved = true;
    if (drag.moved) draw(drag);
  });
  el.canvas.addEventListener("pointerup", (e) => {
    fingers.delete(e.pointerId);
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    const W = el.canvas.width, H = el.canvas.height;
    const box = d.moved && rectFromDrag(d.x1, d.y1, d.x2, d.y2, 12 * d.perPx);
    if (box) state.faces.push({ ...box, covered: true });
    else {
      const i = hitTest(state.faces, d.x1, d.y1, W, H);
      if (i >= 0) state.faces[i].covered = !state.faces[i].covered;
    }
    draw();
  });
  el.canvas.addEventListener("pointercancel", (e) => { fingers.delete(e.pointerId); drag = null; draw(); });

  el.file.addEventListener("change", () => open(el.file.files[0]));
  for (const r of el.styles) r.addEventListener("change", () => { state.style = r.value; draw(); });
  el.download.addEventListener("click", () => {
    render(ctx, state.src, state.faces, state.style, false); // no guides in the saved photo
    // A canvas export is a fresh file: no GPS, camera or date metadata from the original.
    el.canvas.toBlob((blob) => {
      draw();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = outName(state.name);
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    }, "image/jpeg", 0.92);
  });
  return { open, state };
}

function countVisit() {
  // Counts only that the page was opened: no photo data, no cookies (GoatCounter pixel, no JavaScript sent).
  if (!GOATCOUNTER_CODE || location.hostname !== COUNT_HOST) return;
  new Image().src = `https://${GOATCOUNTER_CODE}.goatcounter.com/count?p=/`;
}

// ---- Self-test: open with #selftest. Uses generated data, never a visitor's photo. ----

const tests = {
  "fitScale leaves normal photos alone and shrinks huge ones"() {
    eq(fitScale(4000, 3000), 1);
    const k = fitScale(8000, 6000);
    ok(8000 * k * 6000 * k <= MAX_PIXELS + 1, "still too big");
  },
  "scanPlan pads to multiples of 32 and never enlarges"() {
    const p = scanPlan(4000, 3000, 640);
    eq(p.sw, 640); eq(p.sh, 480); eq(p.pw % 32, 0); eq(p.ph % 32, 0);
    eq(scanPlan(300, 200, 1920).k, 1);
    eq(scanPlan(300, 200, 1920).pw, 320);
  },
  "decodeYunet places one confident anchor where OpenCV would"() {
    const pw = 64, ph = 64, out = {};
    for (const s of [8, 16, 32]) {
      const n = (pw / s) * (ph / s);
      out[`cls_${s}`] = new Float32Array(n); out[`obj_${s}`] = new Float32Array(n); out[`bbox_${s}`] = new Float32Array(4 * n);
    }
    // stride 8, row 2, col 3 → anchor index 2*8+3 = 19; offsets 0.5,0.5; size exp(0)*8 = 8
    out.cls_8[19] = 0.9; out.obj_8[19] = 0.9; out.bbox_8[76] = 0.5; out.bbox_8[77] = 0.5;
    const f = decodeYunet(out, pw, ph, 0.5);
    eq(f.length, 1);
    near(f[0].score, 0.9); near(f[0].x, ((3.5 * 8) - 4) / 0.5); near(f[0].y, ((2.5 * 8) - 4) / 0.5); near(f[0].w, 16);
  },
  "decodeYunet drops anchors under the threshold"() {
    const out = {};
    for (const s of [8, 16, 32]) {
      const n = (32 / s) * (32 / s);
      out[`cls_${s}`] = new Float32Array(n).fill(0.4); out[`obj_${s}`] = new Float32Array(n).fill(0.4); out[`bbox_${s}`] = new Float32Array(4 * n);
    }
    eq(decodeYunet(out, 32, 32, 1).length, 0);
  },
  "nms keeps the best of overlapping boxes and separate faces"() {
    const r = nms([{ x: 0, y: 0, w: 10, h: 10, score: 0.6 }, { x: 1, y: 1, w: 10, h: 10, score: 0.9 }, { x: 50, y: 50, w: 10, h: 10, score: 0.7 }]);
    eq(r.length, 2); eq(r[0].score, 0.9);
  },
  "padBox grows the box but stays inside the photo"() {
    const b = padBox({ x: 0, y: 0, w: 10, h: 10 }, 0.3, 12, 12);
    eq(b.x, 0); eq(b.y, 0); eq(b.w, 12); eq(b.h, 12);
  },
  "hitTest picks the smallest face under the finger"() {
    const faces = [{ x: 0, y: 0, w: 100, h: 100 }, { x: 40, y: 40, w: 10, h: 10 }];
    eq(hitTest(faces, 45, 45, 1000, 1000), 1);
    eq(hitTest(faces, 5, 90, 1000, 1000), 0);
    eq(hitTest(faces, 900, 900, 1000, 1000), -1);
  },
  "a drag becomes a box that covers what was dragged; a tap does not"() {
    eq(rectFromDrag(10, 10, 12, 12, 12), null);
    const f = rectFromDrag(200, 100, 100, 200, 12);
    const b = padBox(f, COVER_PAD, 1000, 1000);
    near(b.x, 100); near(b.y, 100); near(b.w, 100); near(b.h, 100);
  },
  "download names are safe and Spanish"() {
    eq(outName("IMG_1234.JPG"), "IMG_1234-tapada.jpg");
    eq(outName("cumple de Ana (1).png"), "cumple-de-Ana-1--tapada.jpg");
    eq(outName(""), "foto-tapada.jpg");
  },
  "status wording"() {
    ok(statusText(0).startsWith("No encontramos caras"));
    eq(statusText(1), "Te tapamos 1 cara. ¡Podés tocarla para deshacerlo o arrastrar si faltó alguna!");
    eq(statusText(3), "Te tapamos 3 caras. ¡Podés tocar cada una para deshacerlo o arrastrar si faltó alguna!");
  },
  "every cover style paints over the face"() {
    const src = new OffscreenCanvas(200, 200), s = src.getContext("2d");
    for (let y = 0; y < 200; y += 10) for (let x = 0; x < 200; x += 10) { // checkerboard: blur must change it
      s.fillStyle = (x + y) % 20 ? "#000" : "#fff"; s.fillRect(x, y, 10, 10);
    }
    for (const style of ["blur", "pixel", "emoji"]) {
      const c = new OffscreenCanvas(200, 200), cx = c.getContext("2d");
      render(cx, src, [{ x: 70, y: 70, w: 60, h: 60, covered: true }], style, false);
      const before = s.getImageData(95, 95, 10, 10).data, after = cx.getImageData(95, 95, 10, 10).data;
      ok(after.some((v, i) => v !== before[i]), `${style} left the face unchanged`);
      const corner = cx.getImageData(0, 0, 10, 10).data, orig = s.getImageData(0, 0, 10, 10).data;
      ok(corner.every((v, i) => v === orig[i]), `${style} touched pixels away from the face`);
    }
  },
  async "the model loads and finds nothing in a blank image"() {
    const c = new OffscreenCanvas(640, 480), cx = c.getContext("2d");
    cx.fillStyle = "#888"; cx.fillRect(0, 0, 640, 480);
    eq((await detectFaces(c, 640, 480)).length, 0);
  },
  async "the model finds a face in the local test photo (skipped if absent)"() {
    // tests/local/ is git-ignored: real photos of people never go into the repository.
    const r = await fetch("tests/local/face.jpg").catch(() => null);
    if (!r || !r.ok) return;
    const bmp = await createImageBitmap(await r.blob());
    ok((await detectFaces(bmp, bmp.width, bmp.height)).length >= 1, "no face found in tests/local/face.jpg");
  },
};

function eq(actual, expected) {
  if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function near(actual, expected, tol = 1e-3) {
  if (Math.abs(actual - expected) > tol) throw new Error(`expected ≈${expected}, got ${actual}`);
}
function ok(cond, msg = "expected true") { if (!cond) throw new Error(msg); }

async function runSelftest(out) {
  const failures = [];
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); } catch (e) { failures.push(`${name}: ${e.message}`); }
  }
  out.hidden = false;
  out.className = failures.length ? "fail" : "pass";
  out.textContent = failures.length
    ? `SELFTEST FAIL\n${failures.join("\n")}`
    : `SELFTEST PASS (${Object.keys(tests).length} tests)`;
}

// ---- Start ----

if (location.hash === "#selftest") {
  runSelftest(document.getElementById("selftest"));
} else if (!supported()) {
  document.getElementById("unsupported").hidden = false;
} else {
  const $ = (id) => document.getElementById(id);
  // Exposed only so tests/screenshot.mjs can check what taps and drags did; holds nothing secret.
  window.tapacaras = createApp({
    file: $("file"), sample: $("sample"), canvas: $("canvas"), status: $("status"), editor: $("editor"),
    download: $("download"), styles: document.querySelectorAll("input[name=style]"),
  });
  countVisit();
  loadModel().catch((e) => console.error(e)); // warm up while the visitor picks a photo
}
