/**
 * WCAG contrast audit of the landing hero, measured from real rendered pixels.
 *
 * Two things this gets right that a naive check does not:
 *
 *  1. Colour parsing. `text-foreground/80` compiles to `color-mix(in oklab, ...)`,
 *     which Chrome serialises as `oklab(L a b / alpha)`. Reading three numbers off
 *     that string and treating them as R,G,B reports near-black text on a near-black
 *     hero and every heading "fails". Colours here are rasterised onto a canvas and
 *     read back, so any syntax the browser understands is measured exactly.
 *
 *  2. The background. Measured from a second screenshot taken with the copy hidden
 *     (`visibility`, so layout is unchanged). A normal screenshot contains the glyphs
 *     inside the very box being measured, which makes the worst pixel the text's own
 *     colour and every opaque heading report 1:1 against itself. The worst pixel is
 *     the brightest one in dark mode and the darkest in light mode, so a scrim that
 *     is fine on one side and too weak on the other still fails.
 *
 * Usage: node hero-contrast.mjs [url] [width] [height]
 *   SLIDES=4  number of slideshow frames to step through
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const url = process.argv[2] || "http://localhost:3002/";
const width = Number(process.argv[3] || 1440);
const height = Number(process.argv[4] || 900);
const slideCount = Number(process.env.SLIDES || 4);
const shots = process.env.SHOTS !== "0";
const port = 9336;
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = mkdtempSync(join(tmpdir(), "hero-"));

const proc = spawn(
  chrome,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--force-device-scale-factor=1",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let version;
for (let i = 0; i < 60; i += 1) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (res.ok) {
      version = await res.json();
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
if (!version) throw new Error("Chrome DevTools endpoint never came up");

const ws = new WebSocket(version.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
const watchers = [];

function send(method, params = {}, sessionId) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
    return;
  }
  const index = watchers.findIndex((w) => w.method === msg.method);
  if (index >= 0) watchers.splice(index, 1)[0].resolve(msg.params);
});

await new Promise((resolve) => ws.addEventListener("open", resolve));
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);

const evaluate = async (expression) => {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (res.exceptionDetails) {
    throw new Error(`${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description ?? ""}`);
  }
  return res.result.value;
};

const HELPERS = `
  window.__hero = (function(){
    var probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    var pctx = probe.getContext('2d', { willReadFrequently: true });

    /** Rasterise a CSS colour and read the pixel, so oklab/color-mix parse exactly. */
    function resolveColor(value){
      pctx.clearRect(0, 0, 1, 1);
      pctx.fillStyle = '#000';
      pctx.fillStyle = value;
      pctx.fillRect(0, 0, 1, 1);
      var d = pctx.getImageData(0, 0, 1, 1).data;
      return { rgb: [d[0], d[1], d[2]], alpha: d[3] / 255 };
    }

    function lum(rgb){
      var parts = rgb.map(function(c){
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
    }

    function over(fg, bg){
      return fg.map(function(c, i){ return Math.round(fg.a * c + (1 - fg.a) * bg[i]); });
    }

    function ratio(a, b){
      var la = lum(a), lb = lum(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }

    function box(el){
      var r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }

    function nodes(){
      var hero = document.querySelector('section.min-h-\\\\[85vh\\\\]');
      if (!hero) return null;
      var h1 = hero.querySelector('h1');
      var sub = h1 ? h1.querySelector('span.block + span.block') : null;
      var p = Array.from(hero.querySelectorAll('p')).filter(function(el){
        return el.textContent.indexOf('ISOBASH brings') >= 0;
      })[0];
      var li = hero.querySelector('ul li');
      var primary = Array.from(hero.querySelectorAll('a')).filter(function(el){
        return el.textContent.indexOf('Start creating') >= 0;
      })[0];
      var secondary = Array.from(hero.querySelectorAll('a')).filter(function(el){
        return el.textContent.indexOf('Open workspace') >= 0;
      })[0];
      return { hero: hero, rows: [
        ['headline', h1, true],
        ['sub-headline', sub, true],
        ['paragraph', p, true],
        ['trust row', li, true],
        ['primary CTA', primary, false],
        ['secondary CTA', secondary, false],
      ].filter(function(r){ return r[1]; }) };
    }

    /**
     * A filled control (third field false) has its own background between the hero
     * and the label, so that is what the label is judged against, composited over
     * whatever the hero shows through a translucent fill.
     */
    function audit(b64, mode){
      return new Promise(function(resolve){
        var img = new Image();
        img.onload = function(){
          var canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          var ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          var found = nodes();
          if (!found) return resolve({ error: 'no hero' });

          var out = found.rows.map(function(row){
            var el = row[1];
            var b = box(el);
            var x0 = Math.max(0, b.x), y0 = Math.max(0, b.y);
            var x1 = Math.min(canvas.width, b.x + b.w), y1 = Math.min(canvas.height, b.y + b.h);
            var style = getComputedStyle(el);
            var ink = resolveColor(style.color);
            var fill = resolveColor(style.backgroundColor);
            var own = row[2] === false && fill.alpha > 0;

            var best = null, sum = [0, 0, 0], n = 0, samples = [];
            for (var y = y0; y < y1; y++) {
              for (var x = x0; x < x1; x++) {
                var i = (y * canvas.width + x) * 4;
                var rgb = [data[i], data[i + 1], data[i + 2]];
                var l = lum(rgb);
                sum[0] += rgb[0]; sum[1] += rgb[1]; sum[2] += rgb[2]; n++;
                samples.push(l);
                if (best === null || (mode === 'dark' ? l > best.l : l < best.l)) {
                  best = { l: l, rgb: rgb, x: x, y: y };
                }
              }
            }
            samples.sort(function(a, c){ return a - c; });
            var bg = own ? over({ rgb: fill.rgb, a: fill.alpha }, best.rgb) : best.rgb;
            var fg = over({ rgb: ink.rgb, a: ink.alpha }, bg);
            return {
              name: row[0],
              box: b,
              declared: style.color,
              ink: 'rgb(' + ink.rgb.join(',') + ') a' + Math.round(ink.alpha * 100) / 100,
              fill: own ? 'rgb(' + fill.rgb.join(',') + ') a' + Math.round(fill.alpha * 100) / 100 : null,
              ratio: Number(ratio(fg, bg).toFixed(2)),
              text: 'rgb(' + fg.join(',') + ')',
              bg: 'rgb(' + bg.join(',') + ')',
              bgAt: best.x + ',' + best.y,
              bgMean: 'rgb(' + sum.map(function(v){ return Math.round(v / n); }).join(',') + ')',
              p05: Math.round(samples[Math.floor(samples.length * 0.05)] * 1000) / 1000,
              p95: Math.round(samples[Math.floor(samples.length * 0.95)] * 1000) / 1000,
            };
          });
          resolve({ viewport: { w: canvas.width, h: canvas.height }, heroHeight: Math.round(box(found.hero).h), results: out });
        };
        img.onerror = function(){ resolve({ error: 'decode failed' }); };
        img.src = 'data:image/png;base64,' + b64;
      });
    }

    function hideCopy(){
      var found = nodes();
      if (!found) return 0;
      var hidden = Array.prototype.slice.call(found.hero.querySelectorAll('h1, h1 *'));
      hidden = hidden.concat(Array.prototype.slice.call(found.hero.querySelectorAll('p')));
      hidden = hidden.concat(Array.prototype.slice.call(found.hero.querySelectorAll('ul, ul *')));
      found.rows.forEach(function(row){
        if (row[2] === false) {
          // A filled control keeps its own background; only its label is hidden.
          var range = document.createRange();
          range.selectNodeContents(row[1]);
          hidden = hidden.concat(Array.prototype.slice.call(range.cloneContents().querySelectorAll('*')));
        }
      });
      window.__hidden = [];
      Array.from(found.hero.querySelectorAll('h1, p, ul, a, button')).forEach(function(node){
        if (node.classList.contains('glass')) return;      // keep the frosted chip fill
        if (node.tagName === 'A' || node.tagName === 'BUTTON') {
          node.style.color = 'transparent';
        } else {
          node.style.visibility = 'hidden';
        }
        window.__hidden.push(node);
      });
      return window.__hidden.length;
    }

    function restore(){
      (window.__hidden || []).forEach(function(node){
        node.style.visibility = '';
        node.style.color = '';
      });
    }

    return { audit: audit, hideCopy: hideCopy, restore: restore };
  })();
`;

const loaded = new Promise((resolve) => watchers.push({ method: "Page.loadEventFired", resolve }));
await send("Page.navigate", { url }, sessionId);
await Promise.race([loaded, new Promise((r) => setTimeout(r, 30000))]);
await new Promise((r) => setTimeout(r, 4000));
await evaluate(HELPERS);

const report = [];
for (const theme of ["dark", "light"]) {
  for (let slide = 0; slide < slideCount; slide += 1) {
    await evaluate(
      `document.documentElement.classList.toggle('light', ${theme === "light"});
       (function(){
         var next = Array.from(document.querySelectorAll('button[aria-label^="Next"]'))[0];
         if (next) for (var i = 0; i < ${slide}; i++) next.click();
       })();`,
    );
    await new Promise((r) => setTimeout(r, 1800));

    if (shots) {
      const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
      writeFileSync(`.tmpwork/hero-${theme}-${slide}.png`, Buffer.from(shot.data, "base64"));
    }

    const hidden = await evaluate("window.__hero.hideCopy()");
    await new Promise((r) => setTimeout(r, 500));
    const bg = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    await evaluate("window.__hero.restore()");
    await new Promise((r) => setTimeout(r, 300));

    const audit = JSON.parse(
      await evaluate(`window.__hero.audit(${JSON.stringify(bg.data)}, ${JSON.stringify(theme)}).then(JSON.stringify)`),
    );
    if (audit.error || !Array.isArray(audit.results)) {
      console.error(theme, slide, "audit returned", JSON.stringify(audit).slice(0, 400));
      continue;
    }
    for (const row of audit.results) {
      report.push({ theme, slide, ...row });
    }
    if (slide === 0) {
      report.heroHeight = audit.heroHeight;
    }
  }
}

const label = Math.max(...report.map((r) => r.name.length));
for (const row of report) {
  console.log(
    [
      row.theme.padEnd(5),
      `s${row.slide}`.padEnd(3),
      row.name.padEnd(label),
      `${String(row.ratio).padStart(6)}:1`,
      row.ratio >= 4.5 ? "AA  " : "FAIL",
      row.ratio >= 7 ? "AAA " : "    ",
      `ink ${row.ink}`,
      row.fill ? `fill ${row.fill}` : "",
      `bg ${row.bg}`,
      `mean ${row.bgMean}`,
    ]
      .filter(Boolean)
      .join("  "),
  );
}

const failures = report.filter((r) => r.ratio < 4.5);
console.log(`\n${report.length} measurements at ${width}x${height} · ${failures.length} below AA (4.5:1)`);
if (failures.length) {
  console.log("failures:", failures.map((f) => `${f.theme}/s${f.slide}/${f.name}=${f.ratio}`).join(", "));
}
console.log(`worst overall: ${Math.min(...report.map((r) => r.ratio))}:1 · hero height ${report.heroHeight}px`);

ws.close();
try {
  await send("Target.closeTarget", { targetId });
} catch {}
proc.kill();
process.exit(0);
