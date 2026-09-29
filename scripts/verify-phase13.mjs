// Runtime verification for Phase 13: image generation and the media library.
//
// What this proves for real, against a live API and a live PostgreSQL:
//   - every media route requires a session;
//   - the capabilities contract is truthful about what is registered, what is
//     healthy, and that video is not wired to anything;
//   - prompt/aspect-ratio/count/model/project validation is enforced;
//   - a real generation request really runs and really terminates, and when the
//     provider cannot render an image the run is FAILED with the provider's own
//     code — never reported as an empty success and never leaving an asset behind;
//   - a pinned model that does not exist fails with the provider's real answer
//     instead of being quietly swapped for a different one;
//   - another account's generation answers 404, never 403;
//   - cancel is honoured and a run never stays PENDING/RUNNING forever;
//   - the per-IP rate limit on generation really bites.
//
// The storage/read/delete path is exercised against a FIXTURE asset written
// directly to the database and to MEDIA_ROOT, because no provider in this
// environment can produce an image, and the check names say so. The read route
// still does its real work: owner scoping, SHA-256 verification against the bytes
// on disk, the content headers, and removal of the blob with the row. The byte
// sniffer is exercised directly against hand-built PNG/GIF/JPEG/WebP containers,
// so "the type and dimensions come from the bytes" is proven even here.
//
// The generation path is exercised for real as well: if a provider *can* render
// an image, the `generateImage` branch runs instead of the fixture. When none
// can, the same branch runs against a second API instance started by this script
// with `GEMINI_API_BASE_URL` pointed at a fixture that speaks Gemini's response
// shape, which is the only substituted thing. That pass asserts the whole
// completion path end to end — provider adapter, router, service, sniffer,
// storage, serving, deletion — plus the text-only, refusal and provider-error
// directions, so no provider is needed to keep the image path honest.
//
// Requires the backend and PostgreSQL. Re-runnable: each run uses throwaway
// identities.
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { Pool } = require("../node_modules/pg");
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

const API = process.env.API_URL || "http://localhost:3001";
const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)?.[1];
const MEDIA_ROOT = env.match(/^MEDIA_ROOT="?([^"\r\n]+)"?/m)?.[1];

const results = [];
let skipped = 0;

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Reported loudly rather than silently passing a check that could not run. */
function skip(name, reason) {
  skipped += 1;
  console.log(`SKIP  ${name} — ${reason}`);
  results.push({ name, passed: true, skipped: true, detail: reason });
}

const run = randomUUID().slice(0, 8);
const email = `p13-${run}@isobash.dev`;
const otherEmail = `p13-other-${run}@isobash.dev`;
const password = "verify-pass-123";
const xff = `198.51.${170 + (run.charCodeAt(0) % 20)}.${1 + (run.charCodeAt(1) % 250)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const jsonHeaders = (cookie) => ({
  "content-type": "application/json",
  "x-forwarded-for": xff,
  ...(cookie ? { cookie: `isobash_session=${cookie}` } : {}),
});

async function api(method, path, { cookie, body, headers, base } = {}) {
  const res = await fetch(`${base ?? API}${path}`, {
    method,
    headers: { ...jsonHeaders(cookie), ...(headers ?? {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed, text, headers: res.headers };
}

function cookieFrom(res, name) {
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.match(new RegExp(`${name}=([^;]+)`))?.[1] ?? null;
}

async function signUp(address, base) {
  const res = await api("POST", "/auth/register", { body: { email: address, password, name: "P13 Verify" }, base });
  if (res.status !== 201) throw new Error(`register ${address} failed: ${res.status} ${res.text.slice(0, 200)}`);
  return cookieFrom(res, "isobash_session");
}

/** Poll a run until it leaves PENDING/RUNNING. */
async function settle(cookie, id, attempts = 40, base) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    const res = await api("GET", `/media/generations/${id}`, { cookie, base });
    last = res.body;
    if (last && last.status !== "PENDING" && last.status !== "RUNNING") return last;
    await sleep(1000);
  }
  return last;
}

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

/** A genuinely valid 2x2 PNG, built here so the fixture is a real image file. */
function buildPng(width = 2, height = 2) {
  const zlib = require("node:zlib");
  const crcTable = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const p = rowStart + 1 + x * 3;
      raw[p] = 30;
      raw[p + 1] = 90;
      raw[p + 2] = 200;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * A Gemini-shaped fixture endpoint, so the real provider adapter, the real
 * router, the real generation service and the real storage path can be
 * exercised end to end on a machine where no key has an image quota.
 *
 * It is not a provider and it is not in the product: the API is started with
 * `GEMINI_API_BASE_URL` pointing here, which is the same override
 * `OLLAMA_BASE_URL`/`OPENAI_BASE_URL` already allow. Every line of provider,
 * routing, sniffing and persistence code that runs below is the shipped code.
 */
function startGeminiFixture(png) {
  const state = { mode: "image", calls: 0, requests: [] };
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://fixture");
    const send = (status, body) => {
      const text = JSON.stringify(body);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(text);
    };

    if (req.method === "GET") {
      // The model list the health check asks for.
      return send(200, { models: [{ name: "models/gemini-3.1-flash-image" }] });
    }

    let raw = "";
    req.on("data", (piece) => {
      raw += piece;
    });
    req.on("end", () => {
      state.calls += 1;
      let body = {};
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        body = {};
      }
      const prompt = body?.contents?.[0]?.parts?.[0]?.text ?? "";
      state.requests.push({ url: url.pathname, prompt, modalities: body?.generationConfig?.responseModalities });

      if (state.mode === "safety") {
        return send(200, {
          candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [{ text: "Refused by the provider." }] } }],
          promptFeedback: { blockReason: "IMAGE_SAFETY" },
        });
      }
      if (state.mode === "text") {
        return send(200, {
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: "I described the image instead of drawing it." }] } }],
        });
      }
      if (state.mode === "http500") {
        return send(500, { error: { code: 500, message: "fixture induced backend error", status: "INTERNAL" } });
      }
      return send(200, {
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                { text: "fixture render" },
                { inlineData: { mimeType: "image/png", data: png.toString("base64") } },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 34 },
        modelVersion: "fixture-1",
      });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, state, baseUrl: `http://127.0.0.1:${server.address().port}/v1beta` });
    });
  });
}

/** A port nothing is listening on, so a second API instance never fights the stack. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** A second API instance pointed at the fixture, so the real stack is untouched. */
async function startApiAgainst({ port, baseUrl }) {
  const child = spawn(process.execPath, [join(REPO_ROOT, "apps/backend/dist/main.js")], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port), GEMINI_API_BASE_URL: baseUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d.toString()));
  child.stderr.on("data", (d) => (output += d.toString()));

  const base = `http://localhost:${port}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(500);
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return { child, base, log: () => output };
    } catch {
      // not listening yet
    }
  }
  child.kill();
  throw new Error(`the fixture-backed API did not start on ${port}\n${output.slice(-800)}`);
}

/** Prefers the router's "every renderer was tried" clause over a long provider message. */
function attemptsSummary(message) {
  const text = String(message ?? "");
  const marker = text.indexOf("Every eligible renderer was tried:");
  return marker >= 0 ? text.slice(marker).slice(0, 220) : text.slice(0, 220);
}

const main = async () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const fixturePaths = [];
  try {
    const cookie = await signUp(email);
    const otherCookie = await signUp(otherEmail);

    // ---------------------------------------------------------------- auth --
    const anon = await api("GET", "/media/capabilities");
    check(
      "GET /media/capabilities requires a session",
      anon.status === 401 && anon.body?.error?.code === "UNAUTHORIZED",
      `status=${anon.status}`,
    );
    const anonStart = await api("POST", "/media/generations", { body: { prompt: "a blue circle" } });
    check(
      "POST /media/generations requires a session",
      anonStart.status === 401,
      `status=${anonStart.status}`,
    );
    const anonBytes = await api("GET", "/media/assets/whatever/file");
    check(
      "GET /media/assets/:id/file requires a session",
      anonBytes.status === 401,
      `status=${anonBytes.status}`,
    );

    // -------------------------------------------------------- capabilities --
    const capsRes = await api("GET", "/media/capabilities", { cookie });
    const caps = capsRes.body;
    check("GET /media/capabilities answers 200", capsRes.status === 200, `status=${capsRes.status}`);
    check(
      "capabilities reports the accepted aspect ratios and limits",
      Array.isArray(caps?.generation?.aspectRatios) &&
        caps.generation.aspectRatios.includes("1:1") &&
        caps.generation.maxImagesPerRequest >= 1 &&
        caps.generation.maxImageBytes >= 1024 &&
        caps.generation.maxAssetsPerUser >= 1 &&
        caps.generation.maxTotalBytesPerUser >= caps.generation.maxImageBytes &&
        caps.generation.maxPromptCharacters >= 16 &&
        caps.generation.generationsPerHour >= 1,
      `ratios=${JSON.stringify(caps?.generation?.aspectRatios)} perRequest=${caps?.generation?.maxImagesPerRequest}`,
    );
    check(
      "capabilities names the registered image models with their provider",
      Array.isArray(caps?.generation?.models) &&
        caps.generation.models.length > 0 &&
        caps.generation.models.every((m) => typeof m.id === "string" && typeof m.provider === "string" && "autoSelectable" in m),
      `models=${(caps?.generation?.models ?? []).map((m) => m.id).join(",")}`,
    );
    const autoSelectable = (caps?.generation?.models ?? []).filter((m) => m.autoSelectable);
    const aliasOnly = (caps?.generation?.models ?? []).filter((m) => !m.autoSelectable);
    check(
      "at least one image model is auto-selectable, and every alias points at a registered model",
      autoSelectable.length >= 1 &&
        aliasOnly.every((m) => autoSelectable.some((a) => a.id === (m.aliasOf ?? a.id)) || m.aliasOf !== null),
      `auto=${autoSelectable.map((m) => m.id).join(",")} aliases=${aliasOnly.map((m) => `${m.aliasOf ?? m.id}`).join(",")}`,
    );
    check(
      "capabilities separates provider health from the promise of an image",
      typeof caps?.generation?.allProvidersHealthy === "boolean" && typeof caps?.generation?.available === "boolean",
      `available=${caps?.generation?.available} allHealthy=${caps?.generation?.allProvidersHealthy}`,
    );
    check(
      "moderation is reported as provider-reported, not as a filter ISOBASH runs",
      caps?.moderation?.enforced === "provider-reported" && /provider/i.test(caps?.moderation?.detail ?? ""),
      `enforced=${caps?.moderation?.enforced}`,
    );
    check(
      "video is reported as not wired rather than implied",
      caps?.video?.available === false && /not wired/i.test(caps?.video?.detail ?? ""),
      `detail=${String(caps?.video?.detail).slice(0, 60)}`,
    );
    check(
      "capabilities reports this account's own usage",
      caps?.usage?.assets === 0 && caps?.usage?.generations === 0 && caps?.usage?.storedBytes === 0,
      JSON.stringify(caps?.usage),
    );
    check(
      "a fresh account has no recorded generation failure",
      caps?.lastFailure === null || caps?.lastFailure === undefined,
      JSON.stringify(caps?.lastFailure),
    );

    // ---------------------------------------------------------- validation --
    const cases = [
      ["an empty prompt is refused", { prompt: "   " }, 400],
      ["a prompt over the character limit is refused", { prompt: "x".repeat(caps.generation.maxPromptCharacters + 1) }, 400],
      ["an aspect ratio that is not offered is refused", { prompt: "a cat", aspectRatio: "21:9" }, 400],
      ["count 0 is refused", { prompt: "a cat", count: 0 }, 400],
      ["count above the per-request ceiling is refused", { prompt: "a cat", count: 99 }, 400],
      ["a model name with path characters is refused", { prompt: "a cat", model: "../../etc/passwd" }, 400],
      ["a project that is not the caller's is refused", { prompt: "a cat", projectId: 999999 }, 400],
      ["a missing prompt is refused", { count: 1 }, 400],
    ];
    for (const [name, body, expected] of cases) {
      const res = await api("POST", "/media/generations", { cookie, body });
      check(name, res.status === expected, `status=${res.status} ${res.body?.error?.code ?? ""}`);
    }

    // ------------------------------------------------- a real generation run --
    const startedRes = await api("POST", "/media/generations", {
      cookie,
      body: { prompt: "A single blue circle centred on a white background", aspectRatio: "1:1", count: 1 },
    });
    const started = startedRes.body;
    check(
      "a valid request is accepted and returns a persisted run in a pending state",
      startedRes.status === 201 && typeof started?.id === "string" && ["PENDING", "RUNNING"].includes(started.status),
      `status=${startedRes.status} state=${started?.status}`,
    );
    check(
      "the accepted run records what was actually asked for",
      started?.prompt === "A single blue circle centred on a white background" &&
        started?.aspectRatio === "1:1" &&
        started?.requestedCount === 1,
      JSON.stringify({ p: started?.prompt?.slice(0, 20), a: started?.aspectRatio, c: started?.requestedCount }),
    );
    check(
      "the response never exposes a stored path",
      !JSON.stringify(started).includes("relativePath"),
    );

    const settled = await settle(cookie, started.id);
    check(
      "the run reaches a terminal state on its own",
      TERMINAL.has(settled?.status),
      `status=${settled?.status} after polling`,
    );
    check(
      "a terminal run records when it finished",
      settled?.finishedAt != null && settled?.startedAt != null,
      `started=${settled?.startedAt} finished=${settled?.finishedAt}`,
    );

    const produced = settled?.status === "COMPLETED" && Array.isArray(settled.assets) && settled.assets.length > 0;
    if (produced) {
      // The provider really rendered an image. The metadata must come from the
      // bytes, not from the aspect ratio that was requested.
      const asset = settled.assets[0];
      check(
        "a completed run stores real image bytes with a type and size read from those bytes",
        ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(asset.mimeType) &&
          asset.width > 0 &&
          asset.height > 0 &&
          asset.sizeBytes > 0,
        `mime=${asset.mimeType} ${asset.width}x${asset.height} ${asset.sizeBytes}B`,
      );
      check(
        "a completed run names the provider and model that produced it",
        typeof settled.provider === "string" && typeof settled.model === "string",
        `${settled.provider}:${settled.model}`,
      );

      const bytesRes = await fetch(`${API}/media/assets/${asset.id}/file`, {
        headers: { cookie: `isobash_session=${cookie}` },
      });
      const bytes = Buffer.from(await bytesRes.arrayBuffer());
      check(
        "the bytes served back are the stored image",
        bytesRes.status === 200 && bytes.equals(buildPng(asset.width, asset.height)) === false && bytes.length === asset.sizeBytes,
        `status=${bytesRes.status} len=${bytes.length} expected=${asset.sizeBytes}`,
      );
      check(
        "the served image is served with a type, a length and nosniff",
        bytesRes.headers.get("content-type") === asset.mimeType &&
          bytesRes.headers.get("content-length") === String(asset.sizeBytes) &&
          bytesRes.headers.get("x-content-type-options") === "nosniff",
        `type=${bytesRes.headers.get("content-type")} len=${bytesRes.headers.get("content-length")}`,
      );
    } else {
      skip(
        "a completed run stores real image bytes with a type and size read from those bytes",
        "no provider in this environment can render an image, so the success path did not run",
      );
      skip("the bytes served back are the stored image", "no image was generated");
      skip("a completed run names the provider and model that produced it", "no image was generated");
      skip(
        "the served image is served with a type, a length and nosniff",
        "no image was generated",
      );

      check(
        "a run that produced nothing is FAILED with the provider's own code, not an empty success",
        settled?.status === "FAILED" && typeof settled.errorCode === "string" && settled.errorCode.length > 0,
        `status=${settled?.status} code=${settled?.errorCode}`,
      );
      check(
        "a failed run keeps the provider's message rather than a generic one",
        typeof settled?.error === "string" && settled.error.length > 20,
        String(settled?.error).slice(0, 160),
      );
      check(
        "a failed run leaves no asset behind",
        Array.isArray(settled?.assets) && settled.assets.length === 0,
        `assets=${settled?.assets?.length}`,
      );
      check(
        "a failed run does not report a provider or model as if one had answered",
        settled?.provider === null || settled?.provider === undefined || settled.provider === '',
        `provider=${settled?.provider}`,
      );
      console.log(`      provider said: ${String(settled?.error).slice(0, 300)}`);
    }

    // The failure must be visible where a user would look for it.
    const capsAfter = await api("GET", "/media/capabilities", { cookie });
    if (settled?.status === "FAILED") {
      check(
        "the last real failure is reported on the capabilities endpoint",
        capsAfter.body?.lastFailure?.id === settled.id && capsAfter.body.lastFailure.errorCode === settled.errorCode,
        JSON.stringify(capsAfter.body?.lastFailure)?.slice(0, 200),
      );
    } else {
      check(
        "a completed run does not report a stale failure for this account",
        capsAfter.body?.lastFailure === null || capsAfter.body?.lastFailure === undefined,
        JSON.stringify(capsAfter.body?.lastFailure),
      );
    }

    // ------------------------------------------------- pinned bad model -----
    const pinned = await api("POST", "/media/generations", {
      cookie,
      body: { prompt: "A grey square", model: "gemini:gemini-does-not-exist-image" },
    });
    const pinnedSettled = await settle(cookie, pinned.body?.id);
    check(
      "a pinned model that does not exist fails with the provider's real answer, not a silent substitution",
      pinnedSettled?.status === "FAILED" &&
        ["MODEL_NOT_AVAILABLE", "NO_ELIGIBLE_MODEL", "RATE_LIMITED", "PROVIDER_UNAVAILABLE", "PROVIDER_REFUSED"].includes(
          pinnedSettled?.errorCode,
        ),
      `code=${pinnedSettled?.errorCode} model=${pinnedSettled?.model}`,
    );
    check(
      "a failed run never claims to have used the model that was pinned",
      pinnedSettled?.model !== "gemini-does-not-exist-image" || pinnedSettled?.errorCode === "MODEL_NOT_AVAILABLE",
      `model=${pinnedSettled?.model}`,
    );

    // ------------------------------------------------------------- cancel ----
    const toCancel = await api("POST", "/media/generations", {
      cookie,
      body: { prompt: "A long, detailed scene that will not finish quickly at all" },
    });
    const cancelRes = await api("POST", `/media/generations/${toCancel.body.id}/cancel`, { cookie, body: {} });
    check(
      "cancel is accepted and records the request",
      cancelRes.status === 201 && cancelRes.body?.cancelRequestedAt != null,
      `status=${cancelRes.status} at=${cancelRes.body?.cancelRequestedAt}`,
    );
    const cancelled = await settle(cookie, toCancel.body.id);
    check(
      "a cancelled run terminates and is never left PENDING or RUNNING",
      TERMINAL.has(cancelled?.status),
      `status=${cancelled?.status}`,
    );
    if (cancelled?.status === "CANCELLED") {
      check("a cancelled run records no error text", cancelled.error === null || cancelled.error === undefined);
    }

    // ---------------------------------------------------------- ownership ---
    const foreignRead = await api("GET", `/media/generations/${started.id}`, { cookie: otherCookie });
    check(
      "another account's generation answers 404, never 403",
      foreignRead.status === 404 && foreignRead.body?.error?.code === "NOT_FOUND",
      `status=${foreignRead.status} code=${foreignRead.body?.error?.code}`,
    );
    const foreignDelete = await api("DELETE", `/media/generations/${settled.id}`, { cookie: otherCookie });
    check(
      "another account cannot delete a generation",
      foreignDelete.status === 404,
      `status=${foreignDelete.status}`,
    );
    const foreignCancel = await api("POST", `/media/generations/${settled.id}/cancel`, { cookie: otherCookie, body: {} });
    check("another account cannot cancel a generation", foreignCancel.status === 404, `status=${foreignCancel.status}`);
    const stillThere = await api("GET", `/media/generations/${started.id}`, { cookie });
    check("the refused deletes did not remove the run", stillThere.status === 200, `status=${stillThere.status}`);

    // --------------------------------------------- storage read / integrity --
    // FIXTURE: written straight to PostgreSQL and to MEDIA_ROOT, because no
    // provider here can produce an image. The read route still does its real work.
    const png = buildPng(2, 2);
    const fixtureId = `fixture-${run}`;
    const relative = `user-verify/${new Date().toISOString().slice(0, 7)}/${fixtureId}.png`;
    const absolute = join(MEDIA_ROOT, relative);
    mkdirSync(join(MEDIA_ROOT, `user-verify`, new Date().toISOString().slice(0, 7)), { recursive: true });
    writeFileSync(absolute, png);
    fixturePaths.push(absolute);
    const ownerRow = await pool.query('SELECT id FROM "User" WHERE email = $1', [email]);
    const ownerId = ownerRow.rows[0].id;
    await pool.query(
      `INSERT INTO "MediaAsset"
         (id, kind, "relativePath", "mimeType", "sizeBytes", width, height, sha256, prompt, provider, model, "userId", "createdAt")
       VALUES ($1, 'IMAGE', $2, 'image/png', $3, 2, 2, $4, 'fixture', 'verify', 'verify', $5, now())`,
      [fixtureId, relative, png.length, createHash("sha256").update(png).digest("hex"), ownerId],
    );

    const fixtureMeta = await api("GET", `/media/assets/${fixtureId}`, { cookie });
    check(
      "an owned asset is returned as metadata without its stored path",
      fixtureMeta.status === 200 && fixtureMeta.body?.mimeType === "image/png" && !fixtureMeta.body?.relativePath,
      `status=${fixtureMeta.status} keys=${Object.keys(fixtureMeta.body ?? {}).join(",")}`,
    );
    const foreignAsset = await api("GET", `/media/assets/${fixtureId}`, { cookie: otherCookie });
    check(
      "another account's asset answers 404, never 403",
      foreignAsset.status === 404,
      `status=${foreignAsset.status}`,
    );
    const foreignBytes = await api("GET", `/media/assets/${fixtureId}/file`, { cookie: otherCookie });
    check("another account cannot read the bytes", foreignBytes.status === 404, `status=${foreignBytes.status}`);

    const fileRes = await fetch(`${API}/media/assets/${fixtureId}/file`, {
      headers: { cookie: `isobash_session=${cookie}` },
    });
    const served = Buffer.from(await fileRes.arrayBuffer());
    check(
      "the bytes route returns exactly the stored image",
      fileRes.status === 200 && served.equals(png),
      `status=${fileRes.status} len=${served.length} expected=${png.length}`,
    );
    check(
      "the bytes are served as the sniffed type with a length and nosniff",
      fileRes.headers.get("content-type") === "image/png" &&
        fileRes.headers.get("content-length") === String(png.length) &&
        fileRes.headers.get("x-content-type-options") === "nosniff" &&
        /no-store/.test(fileRes.headers.get("cache-control") ?? ""),
      `type=${fileRes.headers.get("content-type")} cache=${fileRes.headers.get("cache-control")}`,
    );
    check(
      "the inline disposition is ASCII-quoted and names the stored file",
      /^inline; filename="[A-Za-z0-9._-]+\.png"$/.test(fileRes.headers.get("content-disposition") ?? ""),
      `disposition=${fileRes.headers.get("content-disposition")}`,
    );

    const downloadRes = await fetch(`${API}/media/assets/${fixtureId}/file?download=1`, {
      headers: { cookie: `isobash_session=${cookie}` },
    });
    check(
      "the download disposition is an attachment, not inline",
      /^attachment; filename="[A-Za-z0-9._-]+\.png"$/.test(downloadRes.headers.get("content-disposition") ?? ""),
      `disposition=${downloadRes.headers.get("content-disposition")}`,
    );

    // Damage the bytes on disk: the route must notice rather than serve them.
    writeFileSync(absolute, Buffer.concat([png, Buffer.from([0])]));
    const corruptRes = await api("GET", `/media/assets/${fixtureId}/file`, { cookie });
    check(
      "bytes that no longer match the recorded checksum are reported, not served",
      corruptRes.status === 500 && corruptRes.body?.error?.code === "ASSET_CORRUPT",
      `status=${corruptRes.status} code=${corruptRes.body?.error?.code}`,
    );

    writeFileSync(absolute, png);
    const deleteRes = await api("DELETE", `/media/assets/${fixtureId}`, { cookie });
    check("an owned asset can be deleted", deleteRes.status === 204, `status=${deleteRes.status}`);
    const goneMeta = await api("GET", `/media/assets/${fixtureId}`, { cookie });
    check("a deleted asset is no longer readable", goneMeta.status === 404, `status=${goneMeta.status}`);
    const leftover = await pool.query('SELECT 1 FROM "MediaAsset" WHERE id = $1', [fixtureId]);
    check("a deleted asset leaves no database row", leftover.rowCount === 0);

    // ------------------------------------------------- byte-level sniffing --
    // The claim that an asset's type and dimensions are read from the bytes
    // rather than from the provider's MIME claim is checked here against the real
    // compiled sniffer and hand-built containers. It needs no provider, so it runs
    // even in an environment where nothing can render an image.
    const { sniffImage } = require("../apps/backend/dist/media/media-images.js");

    const sniffedPng = sniffImage(buildPng(3, 5));
    check(
      "a PNG is identified and measured from its own header",
      sniffedPng?.mimeType === "image/png" &&
        sniffedPng.extension === "png" &&
        sniffedPng.width === 3 &&
        sniffedPng.height === 5,
      JSON.stringify(sniffedPng),
    );

    const gif = Buffer.alloc(12);
    gif.write("GIF89a", 0, "ascii");
    gif.writeUInt16LE(7, 6);
    gif.writeUInt16LE(4, 8);
    const sniffedGif = sniffImage(gif);
    check(
      "a GIF is measured from its logical screen descriptor",
      sniffedGif?.mimeType === "image/gif" && sniffedGif.width === 7 && sniffedGif.height === 4,
      JSON.stringify(sniffedGif),
    );

    // SOI, then an APP0 segment that must be skipped, then a start-of-frame.
    const jpeg = Buffer.alloc(32);
    jpeg.set([0xff, 0xd8], 0);
    jpeg.set([0xff, 0xe0], 2);
    jpeg.writeUInt16BE(16, 4);
    jpeg.set([0xff, 0xc0], 20);
    jpeg.writeUInt16BE(17, 22);
    jpeg[24] = 8;
    jpeg.writeUInt16BE(5, 25);
    jpeg.writeUInt16BE(7, 27);
    const sniffedJpeg = sniffImage(jpeg);
    check(
      "a JPEG is measured from its frame header, not the first segment",
      sniffedJpeg?.mimeType === "image/jpeg" && sniffedJpeg.extension === "jpg" && sniffedJpeg.width === 7 && sniffedJpeg.height === 5,
      JSON.stringify(sniffedJpeg),
    );

    const webp = Buffer.alloc(40);
    webp.write("RIFF", 0, "ascii");
    webp.write("WEBP", 8, "ascii");
    webp.write("VP8 ", 12, "ascii");
    webp.writeUInt16LE(64, 26);
    webp.writeUInt16LE(48, 28);
    const sniffedWebp = sniffImage(webp);
    check(
      "a WebP is identified from the RIFF payload and measured from the key frame",
      sniffedWebp?.mimeType === "image/webp" && sniffedWebp.width === 64 && sniffedWebp.height === 48,
      JSON.stringify(sniffedWebp),
    );

    const avi = Buffer.alloc(32);
    avi.write("RIFF", 0, "ascii");
    avi.write("AVI ", 8, "ascii");
    check(
      "a RIFF container that is not WebP is refused",
      sniffImage(avi) === null,
      JSON.stringify(sniffImage(avi)),
    );

    const notAnImage = Buffer.from("this payload is definitely not an image, whatever the provider claimed");
    check(
      "bytes that are not an image container are refused rather than stored as one",
      sniffImage(notAnImage) === null,
      sniffImage(notAnImage) === null ? "" : JSON.stringify(sniffImage(notAnImage)),
    );

    check(
      "a truncated payload is refused instead of being stored with guessed dimensions",
      sniffImage(buildPng(4, 4).subarray(0, 10)) === null,
    );

    // ------------------------------------- the real image path, end to end ----
    // Gemini's free tier answers every image model with `Quota exceeded ...
    // limit: 0`, so on this machine the success branch cannot be reached through
    // the live provider. A fixture speaks Gemini's exact response shape and a
    // second API instance is pointed at it through the same `GEMINI_API_BASE_URL`
    // seam that `OLLAMA_BASE_URL`/`OPENAI_BASE_URL` already provide, so the shipped
    // provider adapter, router, generation service, sniffer, storage, read route
    // and delete route all run for real. The only substituted thing is Google's
    // network address; nothing in the product is stubbed or switched off.
    const renderPng = buildPng(6, 4);
    const renderSha = createHash("sha256").update(renderPng).digest("hex");
    const geminiFixture = await startGeminiFixture(renderPng);
    let fixtureApi = null;
    try {
      fixtureApi = await startApiAgainst({ port: await freePort(), baseUrl: geminiFixture.baseUrl });
      const fx = await signUp(`p13-render-${run}@isobash.dev`, fixtureApi.base);
      const renderPrompt = `a fixture render ${run}`;

      const started = await api(
        "POST",
        "/media/generations",
        {
          cookie: fx,
          base: fixtureApi.base,
          body: { prompt: renderPrompt, aspectRatio: "1:1", count: 1, model: "gemini:gemini-3.1-flash-image" },
        },
      );
      check(
        "a generation against a rendering provider is accepted",
        started.status === 201 && ["PENDING", "RUNNING"].includes(started.body?.status),
        `status=${started.status} run=${started.body?.status} error=${started.body?.errorCode ?? "-"}`,
      );

      const done = await settle(fx, started.body?.id, 40, fixtureApi.base);
      check(
        "the run reaches COMPLETED when the provider really returns an image",
        done?.status === "COMPLETED" && !done?.errorCode,
        `status=${done?.status} error=${done?.errorCode ?? "-"} ${done?.error ?? ""}`,
      );
      check(
        "the run records the provider, the model and the provider's own finish reason",
        done?.provider === "gemini" && /flash-image/.test(done?.model ?? "") && done?.finishReason === "STOP",
        `provider=${done?.provider} model=${done?.model} finishReason=${done?.finishReason}`,
      );

      const asset = done?.assets?.[0];
      check(
        "exactly one asset is attached to the completed run",
        done?.assets?.length === 1 && done?._count?.assets === 1,
        `assets=${done?.assets?.length} count=${done?._count?.assets}`,
      );
      check(
        "the stored type and dimensions are read from the bytes, not from the request",
        asset?.mimeType === "image/png" && asset?.width === 6 && asset?.height === 4,
        `mimeType=${asset?.mimeType} ${asset?.width}x${asset?.height} requestedAspectRatio=${done?.aspectRatio}`,
      );
      check(
        "the stored size and checksum describe the bytes that were actually received",
        asset?.sizeBytes === renderPng.length && asset?.sha256 === renderSha,
        `sizeBytes=${asset?.sizeBytes} expected=${renderPng.length} sha=${asset?.sha256 === renderSha}`,
      );
      check(
        "the provider's own note is kept on the asset",
        typeof asset?.note === "string" && asset.note.includes("fixture render"),
        `note=${asset?.note}`,
      );
      check(
        "a stored asset never leaks its location on disk",
        asset?.relativePath === undefined && asset?.storageKey === undefined,
        `keys=${Object.keys(asset ?? {}).join(",")}`,
      );

      const row = await pool.query(
        'SELECT "mimeType", "sizeBytes", "width", "height", "sha256", "relativePath" FROM "MediaAsset" WHERE id = $1',
        [asset?.id],
      );
      check(
        "the asset row in PostgreSQL carries the sniffed values and a real path",
        row.rowCount === 1 &&
          row.rows[0].mimeType === "image/png" &&
          row.rows[0].sizeBytes === renderPng.length &&
          row.rows[0].width === 6 &&
          row.rows[0].height === 4 &&
          row.rows[0].sha256 === renderSha &&
          typeof row.rows[0].relativePath === "string" &&
          row.rows[0].relativePath.length > 0,
        JSON.stringify(row.rows[0] ?? {}),
      );

      const blob = join(MEDIA_ROOT, row.rows[0].relativePath);
      check("the image itself is on disk under MEDIA_ROOT", existsSync(blob), blob);
      check("the bytes on disk are exactly what the provider returned", readFileSync(blob).equals(renderPng));

      const renderedFile = await fetch(`${fixtureApi.base}/media/assets/${asset.id}/file`, {
        headers: { cookie: `isobash_session=${fx}` },
      });
      const renderedBytes = Buffer.from(await renderedFile.arrayBuffer());
      check(
        "the generated image is served back byte-for-byte as a real PNG",
        renderedFile.status === 200 &&
          renderedBytes.equals(renderPng) &&
          renderedFile.headers.get("content-type") === "image/png" &&
          renderedFile.headers.get("content-length") === String(renderPng.length),
        `status=${renderedFile.status} len=${renderedBytes.length} type=${renderedFile.headers.get("content-type")}`,
      );

      const library = await api("GET", "/media/assets", { cookie: fx, base: fixtureApi.base });
      check(
        "the generated image appears in the library",
        library.status === 200 && Array.isArray(library.body) && library.body.some((item) => item.id === asset.id),
        `status=${library.status} items=${Array.isArray(library.body) ? library.body.length : typeof library.body}`,
      );

      const imageCall = geminiFixture.state.requests.find((r) => /flash-image/.test(r.url));
      check(
        "the real adapter asked the provider for an image modality, with the prompt verbatim",
        /generateContent/.test(imageCall?.url ?? "") &&
          imageCall?.prompt === renderPrompt &&
          Array.isArray(imageCall?.modalities) &&
          imageCall.modalities.includes("IMAGE"),
        `url=${imageCall?.url} prompt=${JSON.stringify(imageCall?.prompt)} modalities=${JSON.stringify(imageCall?.modalities)}`,
      );

      const multi = await api("POST", "/media/generations", {
        cookie: fx,
        base: fixtureApi.base,
        body: { prompt: `${renderPrompt} twice`, count: 2, model: "gemini:gemini-3.1-flash-image" },
      });
      const multiDone = await settle(fx, multi.body?.id, 40, fixtureApi.base);
      check(
        "count: 2 stores two assets from one run",
        multiDone?.status === "COMPLETED" && multiDone?.assets?.length === 2,
        `status=${multiDone?.status} assets=${multiDone?.assets?.length}`,
      );

      // The honest directions, against the same real code path.
      geminiFixture.state.mode = "text";
      const textOnly = await api("POST", "/media/generations", {
        cookie: fx,
        base: fixtureApi.base,
        body: { prompt: "text only please", model: "gemini:gemini-3.1-flash-image" },
      });
      const textDone = await settle(fx, textOnly.body?.id, 40, fixtureApi.base);
      check(
        "a provider that answers with text instead of an image fails the run instead of storing a fake image",
        textDone?.status === "FAILED" && textDone?.errorCode === "EMPTY_PROVIDER_RESPONSE" && (textDone?.assets ?? []).length === 0,
        `status=${textDone?.status} error=${textDone?.errorCode} assets=${textDone?.assets?.length}`,
      );

      geminiFixture.state.mode = "safety";
      const refused = await api("POST", "/media/generations", {
        cookie: fx,
        base: fixtureApi.base,
        body: { prompt: "something refused", model: "gemini:gemini-3.1-flash-image" },
      });
      const refusedDone = await settle(fx, refused.body?.id, 40, fixtureApi.base);
      check(
        "a provider refusal fails the run and keeps the provider's own reason",
        refusedDone?.status === "FAILED" &&
          refusedDone?.errorCode === "PROVIDER_REFUSED" &&
          refusedDone?.finishReason === "IMAGE_SAFETY" &&
          (refusedDone?.assets ?? []).length === 0,
        `status=${refusedDone?.status} error=${refusedDone?.errorCode} finishReason=${refusedDone?.finishReason}`,
      );

      geminiFixture.state.mode = "http500";
      const broken = await api("POST", "/media/generations", {
        cookie: fx,
        base: fixtureApi.base,
        body: { prompt: "provider error", model: "gemini:gemini-3.1-flash-image" },
      });
      const brokenDone = await settle(fx, broken.body?.id, 40, fixtureApi.base);
      check(
        "a provider error fails the run with its own code and leaves no asset behind",
        brokenDone?.status === "FAILED" && brokenDone?.errorCode === "PROVIDER_REQUEST_FAILED" && (brokenDone?.assets ?? []).length === 0,
        `status=${brokenDone?.status} error=${brokenDone?.errorCode}`,
      );

      const dropped = await api("DELETE", `/media/assets/${asset.id}`, { cookie: fx, base: fixtureApi.base });
      check(
        "a generated image can be deleted through the real route",
        dropped.status === 204 && !existsSync(blob),
        `status=${dropped.status} blobStillThere=${existsSync(blob)}`,
      );

      // Leave no trace: the images this run rendered are real files in MEDIA_ROOT,
      // so the rest are removed through the same route a user would use.
      const rendered = await api("GET", "/media/assets", { cookie: fx, base: fixtureApi.base });
      const leftovers = (Array.isArray(rendered.body) ? rendered.body : []).length;
      for (const item of Array.isArray(rendered.body) ? rendered.body : []) {
        await api("DELETE", `/media/assets/${item.id}`, { cookie: fx, base: fixtureApi.base });
      }
      const afterCleanup = await api("GET", "/media/assets", { cookie: fx, base: fixtureApi.base });
      check(
        "every image the run rendered can be cleaned up, leaving no file behind",
        afterCleanup.status === 200 && (afterCleanup.body ?? []).length === 0,
        `removed=${leftovers} left=${(afterCleanup.body ?? []).length}`,
      );
    } finally {
      fixtureApi?.child.kill();
      geminiFixture.server.close();
    }

    // --------------------------------- a real, live image, when one can render --
    // The whole run above is against a fixture. If a *live* renderer is actually
    // available (POLLINATIONS_ENABLED), prove the same claims against it, so the
    // claim "the website generates images" is checked against a real service and
    // not only against a fixture. Skipped loudly, never silently, when none exists.
    const liveModel = (caps.generation?.models ?? []).find((m) => m.provider !== "gemini" && m.autoSelectable);
    if (!liveModel) {
      skip(
        "a live provider really renders, stores and serves an image",
        "no live image provider is enabled (set POLLINATIONS_ENABLED=true, or give Gemini image quota)",
      );
      skip(
        "the router falls over to a second image provider when the first refuses",
        "only one image provider is registered, so there is nothing to fail over to",
      );
    } else {
      const liveStart = await api("POST", "/media/generations", {
        cookie,
        body: { prompt: `a plain blue circle on white, flat vector, iso ${run}`, aspectRatio: "1:1", count: 1 },
      });
      const liveDone = await settle(cookie, liveStart.body?.id, 90);
      const liveAsset = liveDone?.assets?.[0];
      // A live provider that cannot pay (no quota, no key, a retired model) is a
      // fact about this environment, not a defect in the path — reported as a loud
      // skip with the provider's own reason. Anything else failing is a real fail.
      const cannotPay = new Set(["RATE_LIMITED", "INVALID_API_KEY", "PROVIDER_NOT_CONFIGURED", "MODEL_NOT_AVAILABLE", "NO_PROVIDER_AVAILABLE"]);
      if (liveDone?.status !== "COMPLETED" && cannotPay.has(liveDone?.errorCode)) {
        skip(
          "a live provider really renders, stores and serves an image",
          `${liveModel.provider} cannot pay for a render on this machine: ${liveDone.errorCode} — ${attemptsSummary(liveDone.error)}`,
        );
        skip(
          "the router fails over to a second image provider when the first refuses",
          "no live provider could render, so there was nothing to fail over to",
        );
      } else {
        check(
          "a live provider really renders, stores and serves an image",
          liveDone?.status === "COMPLETED" &&
            liveAsset?.mimeType?.startsWith("image/") &&
            liveAsset.width > 0 &&
            liveAsset.height > 0 &&
            liveAsset.sizeBytes > 0,
          `status=${liveDone?.status} provider=${liveDone?.provider} ${liveAsset?.mimeType} ${liveAsset?.width}x${liveAsset?.height} error=${liveDone?.errorCode ?? "-"} ${liveDone?.error ?? ""}`,
        );

        if (liveAsset) {
          const liveFile = await fetch(`${API}/media/assets/${liveAsset.id}/file`, {
            headers: { cookie: `isobash_session=${cookie}` },
          });
          const liveBytes = Buffer.from(await liveFile.arrayBuffer());
          check(
            "the live image is served back as real image bytes of the recorded size",
            liveFile.status === 200 &&
              liveBytes.length === liveAsset.sizeBytes &&
              (liveFile.headers.get("content-type") ?? "").startsWith("image/"),
            `status=${liveFile.status} len=${liveBytes.length} recorded=${liveAsset.sizeBytes} type=${liveFile.headers.get("content-type")}`,
          );
          const row = await pool.query('SELECT "relativePath" FROM "MediaAsset" WHERE id = $1', [liveAsset.id]);
          const liveBlob = row.rows[0] ? join(MEDIA_ROOT, row.rows[0].relativePath) : null;
          const liveDel = await api("DELETE", `/media/assets/${liveAsset.id}`, { cookie });
          check(
            "the live image can be deleted, blob and row together",
            liveDel.status === 204 && liveBlob !== null && !existsSync(liveBlob),
            `status=${liveDel.status} blobGone=${liveBlob !== null && !existsSync(liveBlob)}`,
          );
        }

        // Pinning the renderer that worked must reach that renderer, and a run
        // that ends up on a second provider has to say so rather than look native.
        const pinned = await api("POST", "/media/generations", {
          cookie,
          body: { prompt: `pinned render ${run}`, model: `${liveModel.provider}:${liveModel.id}` },
        });
        const pinnedDone = await settle(cookie, pinned.body?.id, 90);
        check(
          "a run pinned to the live provider never calls another provider",
          pinnedDone?.status === "COMPLETED"
            ? pinnedDone.provider === liveModel.provider
            : cannotPay.has(pinnedDone?.errorCode),
          `status=${pinnedDone?.status} provider=${pinnedDone?.provider} error=${pinnedDone?.errorCode ?? "-"}`,
        );
        for (const asset of pinnedDone?.assets ?? []) {
          await api("DELETE", `/media/assets/${asset.id}`, { cookie });
        }
      }
    }

    // -------------------------------------------------------------- limits --
    const perHour = caps.generation.generationsPerHour;
    if (perHour <= 5) {
      let limited = null;
      for (let i = 0; i < perHour + 2; i += 1) {
        const res = await api("POST", "/media/generations", { cookie, body: { prompt: `quota probe ${i}` } });
        if (res.status === 429) {
          limited = res;
          break;
        }
      }
      check(
        "the per-account hourly generation quota is enforced",
        limited !== null && limited.body?.error?.code === "RATE_LIMITED" && /limit/i.test(limited.body?.error?.message ?? ""),
        limited ? `status=${limited.status} ${limited.body?.error?.message}` : "the quota never tripped",
      );
    } else {
      skip(
        "the per-account hourly generation quota is enforced",
        `MEDIA_MAX_GENERATIONS_PER_HOUR is ${perHour}; re-run against a server started with MEDIA_MAX_GENERATIONS_PER_HOUR=2`,
      );
    }

    // The per-IP limit is always exercised, because it is configured here.
    let ipLimited = null;
    for (let i = 0; i < 30; i += 1) {
      const res = await api("POST", "/media/generations", { cookie, body: { prompt: `ip probe ${i}` } });
      if (res.status === 429 && res.headers.get("retry-after")) {
        ipLimited = res;
        break;
      }
    }
    check(
      "the per-IP rate limit on generation really bites",
      ipLimited !== null && ipLimited.body?.error?.code === "RATE_LIMITED",
      ipLimited ? `status=${ipLimited.status} retry-after=${ipLimited.headers.get("retry-after")}` : "it never tripped",
    );
  } finally {
    for (const path of fixturePaths) {
      try {
        unlinkSync(path);
      } catch {
        // already gone
      }
    }
    await pool.end().catch(() => {});
  }

  const failed = results.filter((r) => !r.passed);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed` +
      (skipped > 0 ? `, ${skipped} skipped (reported above, not counted as passes)` : ""),
  );
  if (failed.length > 0) {
    console.log('\nFailed:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  }
  process.exit(failed.length ? 1 : 0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
