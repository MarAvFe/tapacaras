# Developing tapacaras

- `index.html`: markup, CSS and the Content-Security-Policy. No inline script, because the CSP forbids it.
- `app.js`: settings at the top, then pure logic (YuNet decoding, NMS, boxes, hit-testing, names), detection
  with ONNX Runtime Web, drawing, UI, and the self-test. Keep logic free of DOM so the self-test covers it.
- `vendor/`: ONNX Runtime Web 1.31.1, WebAssembly-only build, unmodified (about 15 MB, mostly the `.wasm`).
- `models/`: YuNet `2026may` (dynamic input size), unmodified.

## How detection works

Each photo is scanned twice, at long side 640 (close-ups) and 1920 (faces across the room), because YuNet
finds faces of about 10–300 px. Boxes from both scans are merged with NMS at IoU 0.3, then padded 30% when
covered. Threshold 0.5. Why those numbers: `docs/DECISIONS.md`.

ONNX Runtime runs single-threaded. Threads need cross-origin isolation headers, which GitHub Pages can't set.

## Self-test

```
./selftest.sh
```

1. Static checks: the CSP still has `default-src 'none'` and `connect-src 'self'`, and `app.js` has no
   network call to another host.
2. `tests/run-selftest.mjs` opens `index.html#selftest` in headless Chrome over the DevTools protocol and
   waits for the result in real time. `--dump-dom` can't be used: it returns when the virtual clock idles,
   before inference ends. It uses Node's built-in WebSocket (Node 22+); there are no npm dependencies.

The tests include the real model on a blank image. `tests/local/face.jpg`, if present, must contain a face.
`tests/local/` is git-ignored, so photos of people stay out of the repo.

## Driving the real page

```
python3 -m http.server 8766 &
node tests/screenshot.mjs <chrome> http://127.0.0.1:8766/index.html <photo.jpg> tests/local/shots/x [width height]
```

This picks the photo through the real file input, then screenshots each style. It taps the first face and
drags a new box with real mouse events, downloads the result to a temp folder, and lists any console errors,
which would include CSP blocks. Set `OFFLINE=1` to cut the network after the page loads.

## Visit counting

Set `GOATCOUNTER_CODE` in `app.js`. Add `https://<code>.goatcounter.com` to `img-src` in the CSP, or the
browser blocks the pixel. Counting runs only on `marcelloavila.com` and never on `#selftest`.

## Release

Batch changes under `[Unreleased]` in `CHANGELOG.md`; cut a version with the `release` skill. Every push to
`main` redeploys GitHub Pages once the repository is published.
