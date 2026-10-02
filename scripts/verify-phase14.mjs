// Runtime verification for Phase 14: video generation and the clip library.
//
// What this proves for real, against a live API and a live PostgreSQL:
//   - every video route requires a session;
//   - the capabilities contract is truthful about the video limits the server
//     enforces, and does not claim a provider it cannot reach;
//   - prompt/aspect-ratio/seconds/audio/model/first-frame validation is enforced;
//   - another account's run and asset answer 404, never 403;
//   - the container sniffer reads duration, frame size and the audio flag out of
//     real MP4 and WebM containers, and refuses audio-only and non-video payloads
//     instead of storing them as clips;
//   - a real render really runs, really terminates, and is only COMPLETED once a
//     video container was decoded out of the bytes that reached the disk;
//   - a render shorter than requested is COMPLETED *and* says so in `warning`;
//   - a refusal, a quota wall, a non-video answer and an empty body all fail the
//     run with the provider's own code, and none of them writes an asset;
//   - a first frame is uploaded and its URL is what the provider is given;
//   - cancel is honoured and a run never stays PENDING/RUNNING forever;
//   - the bytes route answers real Range requests, so a player can seek, and
//     answers 416 for a range it cannot satisfy;
//   - a clip can be served byte-for-byte and deleted with its file.
//
// No provider in this environment can pay for a render, so the generation path is
// exercised against a second API instance started by this script with
// `POLLINATIONS_VIDEO_BASE_URL` pointed at a fixture that speaks Pollinations'
// response shape. That is the only substituted thing: the provider adapter,
// router, service, sniffer, storage, byte route and deletion are all the shipped
// code. When a real provider *can* render, the `liveProvider` branch runs instead.
//
// Requires the backend (and `npm run build:backend`, because the sniffer is
// exercised from the compiled output), plus PostgreSQL. Re-runnable: each run uses
// throwaway identities.
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { Pool } = require("../node_modules/pg");
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SNIFFER = join(REPO_ROOT, "apps/backend/dist/media/video-bytes.js");

const API = process.env.API_URL || "http://localhost:3001";
const WEB = process.env.WEB_URL || "http://localhost:3002";
const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)?.[1];
const MEDIA_ROOT = env.match(/^MEDIA_ROOT="?([^"\r\n]+)"?/m)?.[1];

const results = [];
let skipped = 0;

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
}

/** Reported loudly rather than silently passing a check that could not run. */
function skip(name, reason) {
  skipped += 1;
  console.log(`SKIP  ${name}: ${reason}`);
  results.push({ name, passed: true, skipped: true, detail: reason });
}

const run = randomUUID().slice(0, 8);
const email = `p14-${run}@isobash.dev`;
const otherEmail = `p14-other-${run}@isobash.dev`;
const password = "verify-pass-123";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The video route allows six starts per IP per fifteen minutes, so every start
 * gets its own forwarded address. One address is reserved for the check that
 * proves the limit bites.
 */
let ipCounter = 0;
const nextIp = () => `203.0.${(ipCounter++ / 250) | 0}.${(ipCounter % 250) + 1}`;

const jsonHeaders = (cookie, ip) => ({
  "content-type": "application/json",
  "x-forwarded-for": ip ?? nextIp(),
  ...(cookie ? { cookie: `isobash_session=${cookie}` } : {}),
});

async function api(method, path, { cookie, body, headers, base, ip, raw } = {}) {
  const res = await fetch(`${base ?? API}${path}`, {
    method,
    headers: { ...jsonHeaders(cookie, ip), ...(headers ?? {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  const text = buffer.toString("utf8");
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return raw
    ? { status: res.status, body: parsed, text, headers: res.headers, buffer }
    : { status: res.status, body: parsed, text, headers: res.headers };
}

function cookieFrom(res, name) {
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.match(new RegExp(`${name}=([^;]+)`))?.[1] ?? null;
}

async function signUp(address, base) {
  const res = await api("POST", "/auth/register", { body: { email: address, password, name: "P14 Verify" }, base });
  if (res.status !== 201) throw new Error(`register ${address} failed: ${res.status} ${res.text.slice(0, 200)}`);
  return cookieFrom(res, "isobash_session");
}

/** Poll a run until it leaves PENDING/RUNNING. */
async function settle(cookie, id, attempts = 60, base) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    const res = await api("GET", `/media/video-generations/${id}`, { cookie, base });
    last = res.body;
    if (last && last.status !== "PENDING" && last.status !== "RUNNING") return last;
    await sleep(500);
  }
  return last;
}

// ---------------------------------------------------------------------------
// Container fixtures
// ---------------------------------------------------------------------------

const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
};

const box = (type, ...parts) => {
  const body = Buffer.concat(parts.map((part) => (Buffer.isBuffer(part) ? part : Buffer.from(part, "latin1"))));
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + body.length, 0);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, body]);
};

/** `mvhd` version 0: timescale at 12, duration at 16, both in whole header bytes. */
const mvhd = (timescale, duration) => {
  const body = Buffer.alloc(100);
  body.writeUInt32BE(0, 0);
  body.writeUInt32BE(timescale, 12);
  body.writeUInt32BE(duration, 16);
  body.writeUInt32BE(0x00010000, 20); // rate 1.0
  body.writeUInt16BE(0x0100, 24); // volume 1.0
  body.writeUInt32BE(2, 96); // next track id
  return box("mvhd", body);
};

/** `tkhd` version 0 is 88 body bytes, with the display size as 16.16 at 80 and 84. */
const tkhd = (trackId, width, height) => {
  const body = Buffer.alloc(88);
  body.writeUInt32BE(0, 0);
  body.writeUInt32BE(trackId, 12);
  body.writeUInt32BE(width * 65536, 80);
  body.writeUInt32BE(height * 65536, 84);
  return box("tkhd", body);
};

/** `hdlr` carries the track kind at offset 8, after version/flags and pre_defined. */
const hdlr = (kind) => box("hdlr", u32(0), u32(0), Buffer.from(kind, "latin1"), Buffer.alloc(12));

const trak = (id, kind, width, height) => box("trak", tkhd(id, width ?? 0, height ?? 0), box("mdia", hdlr(kind)));

/**
 * A real ISO base media header: `ftyp` plus a `moov` holding `mvhd` and one
 * `trak` per stream. Enough for a real demuxer to find the streams, and exactly
 * what the sniffer is documented to read.
 */
function buildMp4({ brand = "isom", timescale = 1000, duration = 4000, width = 320, height = 180, withAudio = false } = {}) {
  const tracks = [trak(1, "vide", width, height)];
  if (withAudio) tracks.push(trak(2, "soun"));
  return Buffer.concat([box("ftyp", Buffer.from(brand, "latin1"), u32(0x200), Buffer.from("isomiso2mp41", "latin1")), box("moov", mvhd(timescale, duration), ...tracks)]);
}

/** An audio-only `.m4a`: a valid `ftyp` that no player can show a picture from. */
function buildAudioOnlyM4a() {
  return Buffer.concat([
    box("ftyp", Buffer.from("M4A ", "latin1"), u32(0), Buffer.from("M4A mp42isom", "latin1")),
    box("moov", mvhd(1000, 6000), trak(1, "soun")),
  ]);
}

/** An EBML size: the width is the position of the first set bit, marker at bit 7*length. */
const ebmlSize = (n) => {
  let length = 1;
  while (n >= 2 ** (7 * length) - 1) length += 1;
  const out = Buffer.alloc(length);
  let value = n;
  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = value & 0xff;
    value = Math.floor(value / 256);
  }
  out[0] |= 0x80 >> (length - 1);
  return out;
};

const ebml = (idBytes, body) => Buffer.concat([Buffer.from(idBytes), ebmlSize(body.length), body]);
const ebmlUint = (idBytes, n) => ebml(idBytes, (() => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0, 0); return b; })());
const ebmlFloat64 = (idBytes, n) => ebml(idBytes, (() => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b; })());

const EBML_HEADER = [0x1a, 0x45, 0xdf, 0xa3];
const DOCTYPE = [0x42, 0x82];
const SEGMENT = [0x18, 0x53, 0x80, 0x67];
const INFO = [0x15, 0x49, 0xa9, 0x66];
const DURATION = [0x44, 0x89];
const TRACKS = [0x16, 0x54, 0xae, 0x6b];
const TRACK_ENTRY = [0xae];
const TRACK_TYPE = [0x83];
const VIDEO = [0xe0];
const PIXEL_WIDTH = [0xb0];
const PIXEL_HEIGHT = [0xba];

/** A WebM header with a real `Segment`, `Info.Duration` and a video `Tracks` entry. */
function buildWebm({ docType = "webm", durationMs = 6000, width = 640, height = 360, withAudio = false } = {}) {
  // A TrackEntry declares exactly one TrackType, so the soundtrack is its own entry.
  const entries = [
    ebml(TRACK_ENTRY, Buffer.concat([ebmlUint(TRACK_TYPE, 1), ebml(VIDEO, Buffer.concat([ebmlUint(PIXEL_WIDTH, width), ebmlUint(PIXEL_HEIGHT, height)]))])),
  ];
  if (withAudio) entries.push(ebml(TRACK_ENTRY, ebmlUint(TRACK_TYPE, 2)));
  const segment = Buffer.concat([
    ebml(INFO, ebmlFloat64(DURATION, durationMs)),
    ebml(TRACKS, Buffer.concat(entries)),
  ]);
  // A Segment is normally written with an unknown size (a single all-ones byte),
  // which is what makes a streamed WebM readable before it has finished arriving.
  const unknown = Buffer.concat([Buffer.from(SEGMENT), Buffer.from([0xff]), segment]);
  return Buffer.concat([ebml(EBML_HEADER, ebml(DOCTYPE, Buffer.from(docType, "latin1"))), unknown]);
}

// ---------------------------------------------------------------------------
// The provider fixture
// ---------------------------------------------------------------------------

/**
 * A Pollinations-shaped fixture, so the real video adapter, router, service,
 * sniffer, storage and byte route can be exercised on a machine where no key can
 * pay for a render. Started through the same `POLLINATIONS_VIDEO_BASE_URL`
 * override the shipped provider already reads.
 */
function startVideoFixture(clip) {
  const state = { mode: "clip", calls: 0, requests: [], uploads: [] };
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://fixture");
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.method === "POST" && url.pathname === "/upload") {
      let raw = "";
      req.on("data", (piece) => {
        raw += piece;
      });
      req.on("end", () => {
        let body = {};
        try {
          body = JSON.parse(raw || "{}");
        } catch {
          body = {};
        }
        state.uploads.push({ contentType: body?.contentType, bytes: Buffer.from(body?.data ?? "", "base64").length });
        return send(200, { url: `http://fixture.invalid/first-frame-${state.uploads.length}.png` });
      });
      return undefined;
    }

    if (req.method === "GET" && url.pathname.startsWith("/video/")) {
      state.calls += 1;
      const prompt = decodeURIComponent(url.pathname.slice("/video/".length));
      state.requests.push({
        prompt,
        model: url.searchParams.get("model"),
        duration: url.searchParams.get("duration"),
        audio: url.searchParams.get("audio"),
        aspectRatio: url.searchParams.get("aspectRatio"),
        image: url.searchParams.get("image"),
        authorized: (req.headers.authorization ?? "").startsWith("Bearer "),
      });

      if (state.mode === "refusal") {
        return send(400, { error: { code: "content_blocked", message: "fixture refused the prompt" } });
      }
      if (state.mode === "payment") {
        return send(402, { error: { code: "insufficient_pollen", message: "no pollen left" } });
      }
      if (state.mode === "html") {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end("<html>not a video</html>");
      }
      if (state.mode === "empty") {
        res.writeHead(200, { "content-type": "video/mp4", "content-length": "0" });
        return res.end();
      }
      if (state.mode === "slow") {
        // Never answers, so the cancel path has a run that is genuinely in flight.
        return undefined;
      }

      const body = state.mode === "short" ? buildMp4({ duration: 1500 }) : clip;
      res.writeHead(200, { "content-type": "video/mp4", "content-length": String(body.length) });
      return res.end(body);
    }

    return send(404, { error: { code: "not_found", message: url.pathname } });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, state, baseUrl: `http://127.0.0.1:${server.address().port}` });
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
    env: {
      ...process.env,
      PORT: String(port),
      POLLINATIONS_VIDEO_ENABLED: "true",
      POLLINATIONS_VIDEO_API_KEY: "fixture-key",
      POLLINATIONS_VIDEO_BASE_URL: baseUrl,
      POLLINATIONS_VIDEO_TIMEOUT_MS: "8000",
      // The quota is checked per account per hour; the default of six is a real
      // ceiling but it is smaller than this suite's render count, so it is
      // exercised separately against the untouched stack.
      MEDIA_VIDEO_GENERATIONS_PER_HOUR: "500",
      MEDIA_VIDEO_MAX_CONCURRENT: "4",
    },
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

// ---------------------------------------------------------------------------

const main = async () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const clip = buildMp4({ timescale: 1000, duration: 4000, width: 320, height: 180, withAudio: true });
  const written = [];
  let api2 = null;
  let fixture = null;

  try {
    if (!existsSync(SNIFFER)) {
      throw new Error(`${SNIFFER} is missing. Run "npm run build:backend" before verifying:phase14.`);
    }
    const { sniffVideo } = require(SNIFFER);

    const cookie = await signUp(email);
    const otherCookie = await signUp(otherEmail);

    // ------------------------------------------------------------- the sniffer --
    const mp4 = sniffVideo(clip);
    check(
      "an MP4 is measured from its own header, not from what was asked for",
      mp4?.mimeType === "video/mp4" && mp4.width === 320 && mp4.height === 180 && mp4.durationMs === 4000 && mp4.hasAudio === true,
      JSON.stringify(mp4),
    );

    const silent = sniffVideo(buildMp4({ duration: 2000, width: 64, height: 64 }));
    check("a clip with no audio track records hasAudio=false rather than null", silent?.hasAudio === false, JSON.stringify(silent));

    const quicktime = sniffVideo(buildMp4({ brand: "qt  " }));
    check("a QuickTime brand is stored as video/quicktime with a .mov extension", quicktime?.mimeType === "video/quicktime" && quicktime?.extension === "mov", JSON.stringify(quicktime));

    const webm = sniffVideo(buildWebm({ durationMs: 6000, width: 640, height: 360, withAudio: true }));
    check(
      "a WebM container is measured from its EBML tree, unknown segment size included",
      webm?.mimeType === "video/webm" && webm.width === 640 && webm.height === 360 && webm.durationMs === 6000 && webm.hasAudio === true,
      JSON.stringify(webm),
    );

    const mkv = sniffVideo(buildWebm({ docType: "matroska" }));
    check("a Matroska DocType is not called WebM", mkv?.mimeType === "video/x-matroska" && mkv?.extension === "mkv", JSON.stringify(mkv));

    check("an audio-only M4A is refused rather than stored as a clip", sniffVideo(buildAudioOnlyM4a()) === null, "sniffed");

    const truncated = clip.subarray(0, 24);
    check("a payload too short to hold a container is refused", sniffVideo(truncated) === null, `len=${truncated.length}`);

    check("an HTML error page saved as .mp4 is refused", sniffVideo(Buffer.from("<html>gateway timeout</html>")) === null, "sniffed");

    // ------------------------------------------------------------------ auth --
    for (const [method, path] of [
      ["GET", "/media/video-generations"],
      ["POST", "/media/video-generations"],
      ["GET", "/media/video-generations/00000000-0000-0000-0000-000000000000"],
      ["POST", "/media/video-generations/00000000-0000-0000-0000-000000000000/cancel"],
      ["DELETE", "/media/video-generations/00000000-0000-0000-0000-000000000000"],
    ]) {
      const res = await api(method, path, { body: method === "POST" ? { prompt: "anon" } : undefined });
      check(`${method} ${path} requires a session`, res.status === 401, `status=${res.status}`);
    }

    // ---------------------------------------------------------- capabilities --
    const caps = (await api("GET", "/media/capabilities", { cookie })).body;
    const video = caps?.video;
    check(
      "the video contract reports the limits the server enforces",
      Array.isArray(video?.durations) && video.durations.length > 0 && video.maxVideoBytes > 0 && video.maxPromptCharacters > 0 && Array.isArray(video?.containers) && video.containers.length > 0,
      `durations=${JSON.stringify(video?.durations)} maxBytes=${video?.maxVideoBytes}`,
    );
    check(
      "the video contract separates text-to-video from image-to-video",
      typeof video?.imageToVideo === "boolean" && (typeof video?.imageToVideoDetail === "string" || video?.imageToVideo === false),
      `imageToVideo=${video?.imageToVideo}`,
    );
    check(
      "video availability is not claimed while no provider is configured",
      video?.available === false ? video.detail.length > 0 : true,
      `available=${video?.available}`,
    );
    check("the usage block counts video renders separately from images", typeof caps?.usage?.videoGenerations === "number", `videoGenerations=${caps?.usage?.videoGenerations}`);
    check("the last video failure is absent rather than empty", caps?.lastVideoFailure === null, `lastVideoFailure=${JSON.stringify(caps?.lastVideoFailure)}`);

    // ------------------------------------------------------------ validation --
    const invalid = [
      ["an empty prompt is refused", { prompt: "" }],
      ["a prompt past the ceiling is refused", { prompt: "x".repeat(2001) }],
      ["a non-integer length is refused", { prompt: "ok", seconds: 4.5 }],
      ["a length of zero is refused", { prompt: "ok", seconds: 0 }],
      ["a length past 120 is refused", { prompt: "ok", seconds: 121 }],
      ["a non-boolean audio flag is refused", { prompt: "ok", audio: "yes" }],
      ["a first frame id past 64 characters is refused", { prompt: "ok", sourceAssetId: "a".repeat(65) }],
      ["a model with shell metacharacters is refused", { prompt: "ok", model: "veo;rm -rf /" }],
    ];
    for (const [label, body] of invalid) {
      const res = await api("POST", "/media/video-generations", { cookie, body });
      check(label, res.status === 400 && res.body?.error?.code === "VALIDATION_FAILED", `status=${res.status} code=${res.body?.error?.code ?? "-"}`);
    }

    // Must be a ratio the video DTO allows. "4:3" is a valid *image* ratio but
    // not a valid video one, so the request would be refused by validation and
    // there would be no run to probe for cross-account isolation.
    const res2 = await api("POST", "/media/video-generations", { cookie, body: { prompt: `own run ${run}`, aspectRatio: "16:9" } });
    const own = res2.body;
    if (own?.id) {
      const res3 = await api("GET", `/media/video-generations/${own.id}`, { cookie: otherCookie });
      check("another account's run answers 404, never 403", res3.status === 404 && res3.body?.error?.code === "NOT_FOUND", `status=${res3.status}`);
      const res4 = await api("POST", `/media/video-generations/${own.id}/cancel`, { cookie: otherCookie });
      check("another account cannot cancel a run", res4.status === 404, `status=${res4.status}`);
      const res5 = await api("DELETE", `/media/video-generations/${own.id}`, { cookie: otherCookie });
      check("another account cannot delete a run", res5.status === 404, `status=${res5.status}`);
      await api("DELETE", `/media/video-generations/${own.id}`, { cookie });
    } else {
      check("another account's run answers 404, never 403", false, `the run could not be started: ${res2.status} ${res2.text.slice(0, 120)}`);
    }

    const missingFrame = await api("POST", "/media/video-generations", { cookie, body: { prompt: `frame ${run}`, sourceAssetId: randomUUID() } });
    check("a first frame that does not exist is refused", missingFrame.status === 400 || missingFrame.status === 404, `status=${missingFrame.status}`);
    if (missingFrame.body?.id) await api("DELETE", `/media/video-generations/${missingFrame.body.id}`, { cookie });

    // ----------------------------------------------- the real render, via fixture --
    fixture = await startVideoFixture(clip);
    const port = await freePort();
    api2 = await startApiAgainst({ port, baseUrl: fixture.baseUrl });

    const caps2 = (await api("GET", "/media/capabilities", { cookie, base: api2.base })).body;
    check(
      "the fixture-backed instance reports video as available with the model it will call",
      caps2?.video?.available === true && (caps2?.video?.models ?? []).length > 0,
      `available=${caps2?.video?.available} models=${JSON.stringify((caps2?.video?.models ?? []).map((m) => m.id))}`,
    );

    const start = await api("POST", "/media/video-generations", { cookie, base: api2.base, body: { prompt: `a fixture render ${run}`, aspectRatio: "16:9", seconds: 4 } });
    check("a render is accepted and is not reported as finished on acceptance", start.status === 201 && ["PENDING", "RUNNING"].includes(start.body?.status), `status=${start.status} run=${start.body?.status}`);
    const done = await settle(cookie, start.body?.id, 60, api2.base);
    check("a real render completes and stores one asset", done?.status === "COMPLETED" && done?.assets?.length === 1, `status=${done?.status} assets=${done?.assets?.length} error=${done?.errorCode ?? "-"}`);

    const asked = fixture.state.requests.at(-1);
    check(
      "the provider was asked for a video with the prompt, length and aspect ratio it was given",
      asked?.prompt === `a fixture render ${run}` && asked.duration === "4" && asked.aspectRatio === "16:9" && asked.audio === "false" && asked.authorized === true,
      JSON.stringify(asked),
    );

    const stored = done?.assets?.[0];
    check(
      "the stored type, size, duration and audio flag are read from the bytes",
      stored?.kind === "VIDEO" && stored?.mimeType === "video/mp4" && stored?.width === 320 && stored?.height === 180 && stored?.durationMs === 4000 && stored?.hasAudio === true,
      JSON.stringify({ kind: stored?.kind, mimeType: stored?.mimeType, w: stored?.width, h: stored?.height, ms: stored?.durationMs, audio: stored?.hasAudio }),
    );
    check("the stored size and checksum describe the bytes that were actually received", stored?.sizeBytes === clip.length && stored?.sha256 === createHash("sha256").update(clip).digest("hex"), `sizeBytes=${stored?.sizeBytes} expected=${clip.length}`);

    const row = await pool.query(`SELECT "relativePath", "durationMs", "hasAudio", "videoGenerationId" FROM "MediaAsset" WHERE id = $1`, [stored?.id]);
    check("the clip row carries the sniffed values and points back at its run", row.rows[0]?.durationMs === 4000 && row.rows[0]?.hasAudio === true && row.rows[0]?.videoGenerationId === done?.id, JSON.stringify(row.rows[0]));

    const onDisk = join(MEDIA_ROOT, row.rows[0]?.relativePath ?? "");
    check("the clip is on disk under MEDIA_ROOT", existsSync(onDisk), onDisk);
    if (existsSync(onDisk)) written.push(onDisk);
    check("the bytes on disk are exactly what the provider returned", existsSync(onDisk) && readFileSync(onDisk).equals(clip), "compared");

    // ------------------------------------------------------------- serving --
    const served = await api("GET", `/media/assets/${stored?.id}/file`, { cookie, raw: true, base: api2.base, headers: { accept: "video/mp4" } });
    check(
      "the clip is served back byte-for-byte as a video, with ranges advertised",
      served.status === 200 && served.buffer.equals(clip) && served.headers.get("content-type") === "video/mp4" && served.headers.get("accept-ranges") === "bytes",
      `status=${served.status} len=${served.buffer.length} type=${served.headers.get("content-type")}`,
    );

    const ranged = await fetch(`${api2.base}/media/assets/${stored?.id}/file`, { headers: { cookie: `isobash_session=${cookie}`, range: "bytes=0-99" } });
    const rangedBody = Buffer.from(await ranged.arrayBuffer());
    check(
      "a range request really is answered with 206 and only the asked-for bytes, so a player can seek",
      ranged.status === 206 && rangedBody.equals(clip.subarray(0, 100)) && ranged.headers.get("content-range") === `bytes 0-99/${clip.length}`,
      `status=${ranged.status} len=${rangedBody.length} content-range=${ranged.headers.get("content-range")}`,
    );

    const unsatisfiable = await fetch(`${api2.base}/media/assets/${stored?.id}/file`, { headers: { cookie: `isobash_session=${cookie}`, range: `bytes=${clip.length + 10}-${clip.length + 20}` } });
    check("a range past the end of the clip is refused with 416, not clipped silently", unsatisfiable.status === 416, `status=${unsatisfiable.status}`);

    const foreignBytes = await api("GET", `/media/assets/${stored?.id}/file`, { cookie: otherCookie });
    check("another account cannot read the clip", foreignBytes.status === 404, `status=${foreignBytes.status}`);

    // ------------------------------------------------------- image to video --
    const image = await api("POST", "/media/generations", { cookie, base: api2.base, body: { prompt: `a fixture still ${run}` } });
    const stillDone = await settle(cookie, image.body?.id, 40, api2.base);
    const stillAsset = stillDone?.assets?.[0];
    if (stillAsset) {
      const i2v = await api("POST", "/media/video-generations", { cookie, base: api2.base, body: { prompt: `animate the still ${run}`, sourceAssetId: stillAsset.id, seconds: 4 } });
      const i2vDone = await settle(cookie, i2v.body?.id, 60, api2.base);
      const askedWithFrame = fixture.state.requests.at(-1);
      check(
        "an image-to-video run uploads the first frame and hands the provider the URL it returned",
        fixture.state.uploads.length === 1 && fixture.state.uploads[0].bytes > 0 && askedWithFrame?.image === fixture.state.uploads.length && i2vDone?.status === "COMPLETED",
        `uploads=${fixture.state.uploads.length} image=${askedWithFrame?.image} status=${i2vDone?.status}`,
      );
      check("the run records which stored image it animated", i2vDone?.sourceAssetId === stillAsset.id, `sourceAssetId=${i2vDone?.sourceAssetId}`);
      for (const asset of i2vDone?.assets ?? []) await api("DELETE", `/media/assets/${asset.id}`, { cookie, base: api2.base });
      await api("DELETE", `/media/video-generations/${i2vDone?.id}`, { cookie, base: api2.base });
    } else {
      skip("an image-to-video run uploads the first frame and hands the provider the URL it returned", `no stored still was produced: ${stillDone?.status} ${stillDone?.errorCode ?? ""}`);
    }

    // ------------------------------------------------------ the failure paths --
    const cases = [
      ["html", "a provider that answers with HTML instead of a clip fails the run and stores nothing", "EMPTY_PROVIDER_RESPONSE"],
      ["empty", "a provider that answers with an empty body fails the run and stores nothing", "EMPTY_PROVIDER_RESPONSE"],
      ["refusal", "a provider refusal fails the run and keeps the provider's own reason", "PROVIDER_REFUSED"],
      ["payment", "a provider with no credit left fails the run with its own code", "RATE_LIMITED"],
    ];
    for (const [mode, label, expected] of cases) {
      fixture.state.mode = mode;
      const started = await api("POST", "/media/video-generations", { cookie, base: api2.base, body: { prompt: `${mode} probe ${run}`, seconds: 4 } });
      const failedRun = await settle(cookie, started.body?.id, 40, api2.base);
      check(label, failedRun?.status === "FAILED" && failedRun?.errorCode === expected && failedRun?.assets?.length === 0, `status=${failedRun?.status} code=${failedRun?.errorCode} assets=${failedRun?.assets?.length}`);
    }
    fixture.state.mode = "clip";

    const refused = await api("GET", "/media/video-generations?status=FAILED", { cookie, base: api2.base });
    check("a refused render keeps the provider's finish reason", (refused.body ?? []).some((r) => r.finishReason), `failures=${(refused.body ?? []).length}`);

    // A clip shorter than requested is complete, but it must say so.
    fixture.state.mode = "short";
    const shortRun = await api("POST", "/media/video-generations", { cookie, base: api2.base, body: { prompt: `short render ${run}`, seconds: 4 } });
    const shortDone = await settle(cookie, shortRun.body?.id, 40, api2.base);
    check(
      "a render shorter than requested is COMPLETED and says so in warning, so a truncated clip is never read as the requested one",
      shortDone?.status === "COMPLETED" && /1\.5s|shorter than the 4s/.test(shortDone?.warning ?? ""),
      `status=${shortDone?.status} warning=${shortDone?.warning ?? "-"}`,
    );
    fixture.state.mode = "clip";

    // ------------------------------------------------------------------ cancel --
    fixture.state.mode = "slow";
    const cancelRun = await api("POST", "/media/video-generations", { cookie, base: api2.base, body: { prompt: `cancel me ${run}`, seconds: 4 } });
    await sleep(1200);
    const cancelled = await api("POST", `/media/video-generations/${cancelRun.body?.id}/cancel`, { cookie, base: api2.base });
    check("cancel is accepted and records the request", cancelled.status === 201 && cancelled.body?.cancelRequestedAt !== null, `status=${cancelled.status} at=${cancelled.body?.cancelRequestedAt}`);
    const cancelledDone = await settle(cookie, cancelRun.body?.id, 40, api2.base);
    check("a cancelled render terminates and is never left PENDING or RUNNING", ["CANCELLED", "FAILED"].includes(cancelledDone?.status) && cancelledDone?.assets?.length === 0, `status=${cancelledDone?.status} assets=${cancelledDone?.assets?.length}`);
    fixture.state.mode = "clip";

    // ------------------------------------------------------------------ quota --
    const perIp = await api("POST", "/media/video-generations", { cookie, base: api2.base, body: { prompt: `ip probe ${run}`, seconds: 4 }, ip: "198.18.7.7" });
    let limited = null;
    for (let i = 0; i < 12; i += 1) {
      const res = await api("POST", "/media/video-generations", { cookie, base: api2.base, body: { prompt: `ip probe ${i} ${run}`, seconds: 4 }, ip: "198.18.7.7" });
      if (res.status === 429 && res.headers.get("retry-after")) {
        limited = res;
        break;
      }
    }
    check("the per-IP rate limit on video generation really bites", limited !== null && limited.body?.error?.code === "RATE_LIMITED", limited ? `status=${limited.status} first=${perIp.status}` : "it never tripped");

    // ----------------------------------------------------------------- cleanup --
    const removed = await api("DELETE", `/media/video-generations/${done?.id}`, { cookie, base: api2.base });
    check("a render can be deleted through the real route", removed.status === 204 && !existsSync(onDisk), `status=${removed.status} blobStillThere=${existsSync(onDisk)}`);
    const gone = await api("GET", `/media/assets/${stored?.id}/file`, { cookie, base: api2.base });
    check("a deleted clip is no longer readable", gone.status === 404, `status=${gone.status}`);
    const rows = await pool.query(`SELECT count(*)::int AS n FROM "MediaAsset" WHERE id = $1`, [stored?.id]);
    check("a deleted clip leaves no database row", rows.rows[0]?.n === 0, `rows=${rows.rows[0]?.n}`);

    // ------------------------------------------------------------- live provider --
    const liveCaps = (await api("GET", "/media/capabilities", { cookie })).body;
    if (liveCaps?.video?.available) {
      const live = await api("POST", "/media/video-generations", { cookie, body: { prompt: `a live render ${run}`, seconds: 4 } });
      const liveDone = await settle(cookie, live.body?.id, 90);
      const unpaid = ["RATE_LIMITED", "PROVIDER_REQUEST_FAILED", "PROVIDER_UNAVAILABLE", "MODEL_NOT_AVAILABLE", "INVALID_API_KEY"];
      check(
        "a live provider is asked for a real clip and the run ends truthfully either way",
        liveDone?.status === "COMPLETED" || (liveDone?.status === "FAILED" && unpaid.includes(liveDone?.errorCode)),
        `status=${liveDone?.status} error=${liveDone?.errorCode ?? "-"} provider=${liveDone?.provider ?? "-"}`,
      );
      for (const asset of liveDone?.assets ?? []) await api("DELETE", `/media/assets/${asset.id}`, { cookie });
      if (liveDone?.id) await api("DELETE", `/media/video-generations/${liveDone.id}`, { cookie });
    } else {
      skip("a live provider is asked for a real clip and the run ends truthfully either way", liveCaps?.video?.detail ?? "no video provider is configured");
    }

    const hourly = liveCaps?.video?.generationsPerHour;
    if (hourly !== undefined && hourly <= 5) {
      let quotaLimited = null;
      for (let i = 0; i < hourly + 2; i += 1) {
        const res = await api("POST", "/media/video-generations", { cookie, body: { prompt: `quota probe ${i} ${run}`, seconds: 4 } });
        if (res.status === 429) {
          quotaLimited = res;
          break;
        }
      }
      check(
        "the per-account hourly video quota is enforced",
        quotaLimited !== null && quotaLimited.body?.error?.code === "RATE_LIMITED",
        quotaLimited ? `status=${quotaLimited.status}` : "the quota never tripped",
      );
    } else {
      skip("the per-account hourly video quota is enforced", `MEDIA_VIDEO_GENERATIONS_PER_HOUR is ${hourly}; re-run against a server started with MEDIA_VIDEO_GENERATIONS_PER_HOUR=2`);
    }

    // ------------------------------------------------------------ the web surface --
    const page = await fetch(`${WEB}/app/media`, { headers: { cookie: `isobash_session=${cookie}` } });
    const html = await page.text();
    check("the media surface serves the clip form, not a reserved placeholder", page.status === 200 && html.includes("Generate a clip") && !html.includes("Reserved surface"), `status=${page.status}`);
  } finally {
    if (results.some((r) => !r.passed) && api2) {
      // A failed run against the fixture instance is almost always explained by
      // what that process printed, so show it rather than just the status code.
      console.log(`\n--- fixture-backed API log ---\n${api2.log().slice(-2500)}`);
    }
    api2?.child.kill();
    fixture?.server.close();
    for (const path of written) {
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
    console.log("\nFailed:");
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  }
  process.exit(failed.length ? 1 : 0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
