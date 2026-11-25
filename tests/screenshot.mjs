// Drive the real page like a visitor: pick <photo>, wait for detection, screenshot each cover style,
// tap the first face, and report console errors (e.g. anything the CSP blocked).
// Usage: node tests/screenshot.mjs <chrome> <base_url> <photo> <out_prefix> [width] [height]
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [chrome, base, photo, out, width = "1280", height = "1400"] = process.argv.slice(2);
const profile = mkdtempSync(join(tmpdir(), "tapacaras-chrome-"));
const proc = spawn(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((r) => { let b = ""; proc.stderr.on("data", (d) => { b += d; const m = b.match(/ws:\/\/\S+/); if (m) r(m[0]); }); });
const port = new URL(wsUrl).port;
const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map(); const logs = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") logs.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
  if (m.method === "Runtime.exceptionThrown") logs.push(m.params.exceptionDetails.exception?.description);
  if (m.method === "Log.entryAdded" && ["error", "warning"].includes(m.params.entry.level)) logs.push(m.params.entry.text);
  pending.get(m.id)?.(m); pending.delete(m.id);
});
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 80, captureBeyondViewport: true });
  writeFileSync(`${out}-${name}.jpg`, Buffer.from(r.result.data, "base64"));
};

await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable"); await send("DOM.enable");
await send("Emulation.setDeviceMetricsOverride", { width: +width, height: +height, deviceScaleFactor: 1, mobile: +width < 600 });
await send("Page.navigate", { url: base });
await sleep(1500);
if (process.env.OFFLINE) { // the page promises it keeps working with the network off once loaded
  await send("Network.enable");
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  console.log("network: offline");
}
const doc = await send("DOM.getDocument");
const input = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: "#file" });
const t0 = Date.now();
await send("DOM.setFileInputFiles", { nodeId: input.result.nodeId, files: [resolve(photo)] });
let status = "";
for (let i = 0; i < 240 && !/^(Encontramos|No encontramos|No pudimos)/.test(status); i++) { await sleep(250); status = await evalJs("document.getElementById('status').textContent"); }
console.log(`status after ${((Date.now() - t0) / 1000).toFixed(1)} s: ${status}`);
await shot("blur");
for (const style of ["pixel", "emoji"]) {
  await evalJs(`(() => { const r = document.querySelector('input[value=${style}]'); r.checked = true; r.dispatchEvent(new Event('change')); })()`);
  await sleep(300); await shot(style);
}
// Tap the first face (real mouse events), then drag a new box, then download.
const mouse = async (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
const geo = await evalJs(`(() => { const c = document.getElementById('canvas'), r = c.getBoundingClientRect(), f = window.tapacaras.state.faces[0];
  return { left: r.left, top: r.top, k: r.width / c.width, f, n: window.tapacaras.state.faces.length }; })()`);
await evalJs("document.getElementById('canvas').scrollIntoView()");
const g2 = await evalJs("(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return { left: r.left, top: r.top }; })()");
const fx = g2.left + (geo.f.x + geo.f.w / 2) * geo.k, fy = g2.top + (geo.f.y + geo.f.h / 2) * geo.k;
await mouse("mousePressed", fx, fy); await mouse("mouseReleased", fx, fy); await sleep(200);
console.log("tap face 0 -> covered =", await evalJs("window.tapacaras.state.faces[0].covered"), "(expect false)");
await shot("tapped");
const dx = g2.left + 20, dy = g2.top + 20;
await mouse("mousePressed", dx, dy);
for (let i = 1; i <= 5; i++) await mouse("mouseMoved", dx + i * 20, dy + i * 20);
await mouse("mouseReleased", dx + 100, dy + 100); await sleep(200);
console.log("faces after drag:", await evalJs("window.tapacaras.state.faces.length"), `(expect ${geo.n + 1})`);
const dl = mkdtempSync(join(tmpdir(), "tapacaras-dl-"));
await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dl });
await evalJs("document.getElementById('download').click()"); await sleep(2000);
console.log("downloaded:", JSON.stringify(readdirSync(dl).map((f) => [f, statSync(join(dl, f)).size])), "into", dl);
const tap = await evalJs(`(() => {
  const c = document.getElementById('canvas'), r = c.getBoundingClientRect();
  return { x: r.left, y: r.top, k: r.width / c.width };
})()`);
console.log("canvas at", JSON.stringify(tap));
writeFileSync(`${out}-meta.json`, JSON.stringify({ tap }));
console.log(logs.length ? "CONSOLE:\n" + logs.join("\n") : "console: no errors or warnings");
proc.once("exit", () => { rmSync(profile, { recursive: true, force: true }); process.exit(0); });
proc.kill();
