#!/usr/bin/env bash
# Static privacy checks, then serve the folder and run index.html#selftest in headless Chrome.
# Browser: $CHROME if set, else chromium/chrome on PATH, else Playwright's cached headless shell.
set -uo pipefail
cd "$(dirname "$0")"

# The page must keep forbidding network sends, and the code must not reach other hosts.
csp=$(grep -o 'http-equiv="Content-Security-Policy" content="[^"]*"' index.html)
for need in "default-src 'none'" "connect-src 'self';"; do
  case "$csp" in *"$need"*) ;; *) echo "SELFTEST FAIL: index.html CSP lacks $need"; exit 1 ;; esac
done
if grep -nE "(fetch|XMLHttpRequest|sendBeacon|WebSocket)\(?[^)]*https?://" app.js; then
  echo "SELFTEST FAIL: app.js sends something to another host"; exit 1
fi

find_browser() {
  [ -n "${CHROME:-}" ] && { echo "$CHROME"; return; }
  for b in chromium chromium-browser google-chrome google-chrome-stable; do
    command -v "$b" >/dev/null && { command -v "$b"; return; }
  done
  ls -d "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | sort -V | tail -1
}
browser=$(find_browser)
[ -n "$browser" ] || { echo "SELFTEST FAIL: no headless browser (set CHROME=/path/to/chrome)"; exit 1; }
port=$(python3 -I -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
python3 -I -m http.server "$port" --bind 127.0.0.1 >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null' EXIT
sleep 0.5
# Real-time runner: model inference outlasts --dump-dom's virtual clock (see tests/run-selftest.mjs).
node tests/run-selftest.mjs "$browser" "http://127.0.0.1:$port/index.html#selftest"
