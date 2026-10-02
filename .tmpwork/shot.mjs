import { writeFileSync } from "node:fs";

const CDP = "http://localhost:9223";
const url = process.argv[2] || "http://localhost:3002/";
const out = process.argv[3] || ".tmpwork/shot.png";
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);
const light = process.argv[6] === "light";
const fullPage = process.argv[7] === "full";

const target = await (await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = [];

function send(method, params = {}, sessionId) {
  const messageId = ++id;
  ws.send(JSON.stringify({ id: messageId, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => pending.set(messageId, { resolve, reject }));
}

const loaded = new Promise((resolve) => events.push({ name: "Page.loadEventFired", resolve }));

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? "")})`));
    else resolve(msg.result);
    return;
  }
  for (const watcher of events) {
    if (msg.method === watcher.name) {
      events.splice(events.indexOf(watcher), 1);
      watcher.resolve(msg.params);
    }
  }
});

await new Promise((resolve) => ws.addEventListener("open", resolve));
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url });
await Promise.race([loaded, new Promise((r) => setTimeout(r, 30000))]);
await new Promise((r) => setTimeout(r, 4000));

if (light) {
  await send("Runtime.evaluate", {
    expression: `document.documentElement.classList.add('light');
      document.cookie='isobash_theme=light; path=/; max-age=31536000; samesite=lax';`,
  });
  await new Promise((r) => setTimeout(r, 1500));
}

// Freeze the slideshow so every capture is the same frame unless a slide is asked for.
const slide = process.env.SLIDE;
if (slide !== undefined) {
  await send("Runtime.evaluate", {
    expression: `(function(){
      const buttons = Array.from(document.querySelectorAll('button[aria-label*="background image"]'));
      const next = buttons.find(b => b.getAttribute('aria-label').startsWith('Next'));
      for (let i = 0; i < ${Number(slide)}; i++) next.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1600));
}

const params = { format: "png" };
if (fullPage) {
  const metrics = await send("Page.getLayoutMetrics");
  params.clip = {
    x: 0,
    y: 0,
    width,
    height: Math.min(Math.ceil(metrics.cssContentSize.height), 12000),
    scale: 1,
  };
  params.captureBeyondViewport = true;
}
const shot = await send("Page.captureScreenshot", params);
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(`wrote ${out}`);

const metrics = await send("Runtime.evaluate", {
  expression: `JSON.stringify({
    theme: document.documentElement.className,
    heroH: document.querySelector('section.min-h-\\\\[85vh\\\\]')?.getBoundingClientRect().height ?? null,
    h1: (() => { const el = document.querySelector('h1'); if (!el) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { top: r.top, left: r.left, w: r.width, h: r.height, color: s.color, size: s.fontSize, lh: s.lineHeight }; })(),
    para: (() => { const el = document.querySelector('h1 ~ p, section.min-h-\\\\[85vh\\\\] p'); if (!el) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { top: r.top, left: r.left, w: r.width, h: r.height, color: s.color, size: s.fontSize }; })(),
    scrim: (() => { const els = Array.from(document.querySelectorAll('section.min-h-\\\\[85vh\\\\] [aria-hidden="true"]')); return els.map(e => { const r = e.getBoundingClientRect(); return { cls: e.className.slice(0, 60), top: r.top, left: r.left, w: Math.round(r.width), h: Math.round(r.height), bg: getComputedStyle(e).backgroundImage.slice(0, 80) }; }); })(),
    vw: innerWidth, vh: innerHeight,
  })`,
  returnByValue: true,
});
console.log(metrics.result.value);

ws.close();
await fetch(`${CDP}/json/close/${target.id}`);
process.exit(0);
