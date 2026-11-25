// Open <url> in headless Chrome and wait for the page's #selftest result, for real (not virtual) time.
// --dump-dom can't do this: it returns as soon as the virtual clock is idle, before model inference ends.
// Usage: node tests/run-selftest.mjs <chrome> <url> [timeout_s]. No dependencies: Node's own WebSocket.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [chrome, url, timeoutS = "180"] = process.argv.slice(2);
const profile = mkdtempSync(join(tmpdir(), "tapacaras-chrome-"));
const proc = spawn(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
let finished = false;
const done = (code, text) => {
  if (finished) return; finished = true;
  console.log(text);
  proc.once("exit", () => { rmSync(profile, { recursive: true, force: true }); process.exit(code); }); // Chrome writes until it exits
  proc.kill();
};
setTimeout(() => done(1, `SELFTEST FAIL: no result within ${timeoutS} s`), timeoutS * 1000);

// Chrome prints "DevTools listening on ws://..." to stderr once it is ready.
const wsUrl = await new Promise((resolve) => {
  let buf = "";
  proc.stderr.on("data", (d) => { buf += d; const m = buf.match(/ws:\/\/\S+/); if (m) resolve(m[0]); });
});
const port = new URL(wsUrl).port;
const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); });
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });

await send("Page.navigate", { url });
for (;;) {
  await new Promise((r) => setTimeout(r, 250));
  const res = await send("Runtime.evaluate", { expression: "(document.getElementById('selftest')||{}).textContent||''", returnByValue: true });
  const text = res.result?.result?.value || "";
  if (text.startsWith("SELFTEST")) done(text.startsWith("SELFTEST PASS") ? 0 : 1, text);
}
