# Decisions

Format: reading taken — reason — how to change.

## Setup (2026-11-25)

- **Template:** `single-file-web-tool` from the `new-project` skill, with the script moved to `app.js` and
  the runtime and model added next to it. — Closest fit: a static page with a headless self-test. The CSP
  forbids inline scripts, and the model can't be inlined sensibly. — Inline the script and allow it by CSP
  hash if a single file matters again.
- **Name and URL: Tapacaras, served at `marcelloavila.com/tapacaras` from its own repository
  `MarAvFe/tapacaras`.** — `maravfe.github.io` is the user site behind marcelloavila.com. A project repo
  publishes under the same domain, like Ubicatex, and keeps the site repo clean. — Copy the folder into
  `maravfe.github.io/tapacaras/` instead; the URL stays the same.
- **Third cover style: Pixelado.** — The request asked for 3 options but named two (plain blur, smiley
  emoji); pixelation is the usual third. — Change the radio buttons in `index.html` and the `style`
  branches in `drawCover`.
- **Spanish uses "vos" (Costa Rican voseo), in the user's own wording.** — The user rewrote the texts on
  2026-11-25 ("¡Tapá las caras en tu foto!"). The first draft used "usted", like Ubicatex. I added the
  opening ¡ ¿, fixed "confirmat" and "como" (to "confirmar", "cómo"), and dropped a comma between subject and
  verb. — Edit the strings in `index.html` and `statusText` / `say(...)` in `app.js`.
- **The safety explanation is a collapsed "¿Esto es seguro?" box, and nothing sits under the photo except
  the credits.** — The user's layout. The "check before sharing" warning under the photo was removed with it;
  the status line still says to drag over any face that was missed. — `<details class="privacy">` in
  `index.html`.

- **The placeholder picture is an original SVG drawing of three made-up people, one per cover style, and
  tapping it opens the file picker.** — "Add a placeholder picture" (2026-11-25). A drawing keeps real people
  out of a public repo and previews the styles; the smiley is drawn, not an emoji glyph, so it looks the same
  everywhere. — Replace `assets/ejemplo.svg`. A photo of AI-generated people (local ComfyUI) would let
  visitors try the detector without their own photo.

- **English too, picked by the phone's first language: any Spanish (`es`, `es-CR`, `es-MX`…) gets Spanish,
  everything else gets English.** — "translate to english so the site can react according to the phone"
  (2026-11-25). Only the first language counts, so someone whose phone is in English but lists Spanish second
  sees English, as their phone does. — `pickLang` in `app.js`.
- **The HTML stays in Spanish, and English is swapped in by script from `TEXT.en`.** — No build step, and
  link previews and search engines keep the Spanish page. English visitors may see Spanish for a moment
  while the scripts load. The self-test checks that `TEXT.es` matches the HTML word for word. — Move the
  swap earlier (a small script in `<head>` loaded with a hash in the CSP) if the flash bothers anyone.
- **English sample drawing is a copy with English labels (`assets/example-en.svg`).** — SVG text can't be
  translated from the page. — Keep the two files in step when the drawing changes.

- **Published 2026-11-25: public repo github.com/MarAvFe/tapacaras, GitHub Pages from `main` /, served at
  marcelloavila.com/tapacaras. Visit counting is off because no GoatCounter code has been given yet.** — The
  user said "push this thing". Every push to `main` redeploys. — Make the repo private or disable Pages
  in its settings to take it down.

## Detection

- **YuNet (OpenCV Zoo, MIT) on ONNX Runtime Web (MIT), both self-hosted.** — Licence read at the source:
  `opencv_zoo/models/face_detection_yunet/LICENSE` is MIT. InsightFace models are non-commercial only, and
  many YOLO-face models are AGPL. MediaPipe was not tested. — Swap `models/` and `decodeYunet`.
- **Threshold 0.5, scans at 640 and 1920, NMS IoU 0.3, 30% padding.** — Measured on 49 GoPro frames against
  InsightFace's clear faces (score ≥ 0.6): 0.5 matched 39/48 with 11 stray boxes; 0.3 matched 47/48 with
  82 strays (wall climbing holds, knees). Profiles and upside-down faces are missed at both, so a drag tool
  is required. — `SCORE_THRESHOLD`, `SCAN_SIDES` and `COVER_PAD` at the top of `app.js`.
- **Photos above 16 M pixels are scaled down.** — iOS Safari refuses larger canvases. — `MAX_PIXELS`.
- **Single-threaded WebAssembly.** — Threads need COOP/COEP headers, which GitHub Pages can't send. On a
  desktop a 4000×3000 photo takes about 0.6 s; phones are untested. — Host elsewhere with those headers and
  raise `numThreads`.

## Privacy

- **The CSP is the privacy guarantee, and the self-test checks it.** — A promise the browser enforces beats
  one the code makes. — Edit the `<meta http-equiv="Content-Security-Policy">` line; `selftest.sh` will
  complain if it stops forbidding sends.
- **Counting visits is analytics, so it's limited to page opens via a GoatCounter pixel, off until the user
  sets a code.** — The user asked for root visits only, no private data, and dropped photo size. GoatCounter
  (read 2026-11-25 at goatcounter.com/help/privacy and /help/gdpr) sets no cookies, doesn't store IP
  addresses, and says a consent notice is "probably" not needed. — Set `GOATCOUNTER_CODE` in `app.js` and
  add its host to `img-src`; empty it to stop counting.
- **Blur and pixelate are done by downscaling to a few blocks, not with `ctx.filter`.** — Canvas filters
  aren't available in every Safari. Five blocks across a face leave nothing recognisable. — `drawCover`.
- **The downloaded JPEG is a fresh canvas export.** — It carries no EXIF (GPS, camera, date). Tested with an
  original GoPro photo that had EXIF. — Nothing to change; keep `toBlob`.
