import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const url = process.argv[2] || "http://localhost:3002/";
const port = 9335;
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = mkdtempSync(join(tmpdir(), "probe2-"));
const proc = spawn(chrome, ["--headless=new","--no-sandbox","--disable-gpu","--no-first-run","--disable-extensions",`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,"--hide-scrollbars","about:blank"], { stdio: "ignore" });

let version;
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) { version = await r.json(); break; } } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
const ws = new WebSocket(version.webSocketDebuggerUrl);
let nextId = 0; const pending = new Map(); const watchers = [];
const send = (method, params = {}, sessionId) => { const id = ++nextId; ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; } const i = watchers.findIndex((w) => w.method === m.method); if (i >= 0) watchers.splice(i, 1)[0].res(m.params); });
await new Promise((r) => ws.addEventListener("open", r));
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
const loaded = new Promise((r) => watchers.push({ method: "Page.loadEventFired", res: r }));
await send("Page.navigate", { url }, sessionId);
await Promise.race([loaded, new Promise((r) => setTimeout(r, 30000))]);
await new Promise((r) => setTimeout(r, 4000));
const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;

console.log(await ev(`(function(){
  var c = document.createElement('canvas').getContext('2d');
  var out = {};
  ['oklab(0.9496 0.000185341 -0.0237682 / 0.8)','rgb(232,238,255)','color-mix(in oklab, #e8eeff 80%, transparent)','oklab(0.5 0.1 -0.1 / 0.5)'].forEach(function(v){
    c.fillStyle = '#000'; c.fillStyle = v; out[v] = c.fillStyle;
  });
  return JSON.stringify(out, null, 1);
})()`));
ws.close(); proc.kill(); process.exit(0);
