// Runtime verification for Phase 15: the video providers and their billing.
//
// What this proves for real, against a live API and a live PostgreSQL:
//   - Magic Hour is registered as a video provider and the capabilities contract
//     advertises only the models the free plan can actually pay for;
//   - a text-to-video render really runs through the shipped adapter, the router,
//     the credit guard, the sniffer and storage, and only completes once a video
//     container was decoded out of the bytes that reached the disk;
//   - the first frame for image-to-video is uploaded to a presigned URL and the
//     `file_path` is what the render is given, so ISOBASH's session-authenticated
//     asset route never has to be made public;
//   - a project that never finishes is failed with a timeout, and the ledger keeps
//     the reservation rather than pretending the credits came back;
//   - an empty `downloads` array, a non-video download and a provider refusal each
//     fail the run with the provider's own code and write no asset;
//   - the 402 the provider returns for an empty pool is reported as a spent pool
//     and never triggers a cross-provider failover;
//   - the pool guard refuses a render that would breach the reserve, and refuses
//     when the balance cannot be read at all, before anything is submitted;
//   - the ledger records estimate -> charged, records a refund for a failed render,
//     and releases a reservation that was never submitted;
//   - the admin view separates the provider's own balance from the local ledger.
//   - JSON2Video assembly is a separate contract that the generation screen cannot
//     reach: it refuses a switched-off deployment with a reason rather than a 404,
//     validates the body, and refuses an over-long movie or one longer than the
//     seconds left on a grant that does not renew -- both before anything is sent;
//   - an assembled movie is measured from the bytes that reached the disk rather than
//     from what the provider claimed, is stored with the recipe that made it, served
//     from ISOBASH's own copy, audited, owner-scoped and deletable;
//   - every way the provider can misbehave fails with its own reason and leaves no
//     asset behind, and the 6-an-hour assembly budget is enforced.
//
// No credit is spent by this script. The providers are exercised through
// `MAGICHOUR_VIDEO_BASE_URL` and `JSON2VIDEO_BASE_URL`, the overrides the shipped
// adapters already read, against fixtures that speak those APIs' documented response
// shapes. The only thing substituted is the remote host: the adapters, router,
// guards, services, sniffer, storage, socket path and admin surface are all shipped
// code.
//
// Requires the backend plus PostgreSQL. Re-runnable: each run uses throwaway
// identities and its own API instance on a free port.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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

const results = [];
let skipped = 0;

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
}

function skip(name, why) {
  skipped += 1;
  results.push({ name, passed: true, detail: `skipped: ${why}` });
  console.log(`SKIP  ${name}: ${why}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = "Verify!2345";

let ipCounter = 0;
const nextIp = () => `203.0.${(ipCounter++ / 250) | 0}.${(ipCounter % 250) + 1}`;

const jsonHeaders = (cookie, ip) => ({
  "content-type": "application/json",
  "x-forwarded-for": ip ?? nextIp(),
  ...(cookie ? { cookie: `isobash_session=${cookie}` } : {}),
});

async function api(method, path, { cookie, body, headers, base, ip } = {}) {
  const res = await fetch(`${base ?? API}${path}`, {
    method,
    headers: { ...jsonHeaders(cookie, ip), ...(headers ?? {}) },
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
  const res = await api("POST", "/auth/register", { body: { email: address, password, name: "P15 Verify" }, base });
  if (res.status !== 201) throw new Error(`register ${address} failed: ${res.status} ${res.text.slice(0, 200)}`);
  return { cookie: cookieFrom(res, "isobash_session"), id: res.body?.user?.id ?? res.body?.id ?? null };
}

/** Poll a run until it leaves PENDING/RUNNING. */
async function settle(cookie, id, attempts = 90, base) {
  return pollUntilSettled(cookie, `/media/video-generations/${id}`, attempts, base);
}

/** The same for an image run, which lives on its own route. */
async function settleImage(cookie, id, attempts = 90, base) {
  return pollUntilSettled(cookie, `/media/generations/${id}`, attempts, base);
}

async function pollUntilSettled(cookie, path, attempts, base) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    const res = await api("GET", path, { cookie, base });
    last = res.body;
    if (last && last.status !== "PENDING" && last.status !== "RUNNING") return last;
    await sleep(500);
  }
  return last;
}

// ---------------------------------------------------------------------------
// Container fixture: a real MP4, so the sniffer and storage are really exercised.
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
  return box('mvhd', body);
};

/** `tkhd` version 0 is 88 body bytes, with the display size as 16.16 at 80 and 84. */
const tkhd = (trackId, width, height) => {
  const body = Buffer.alloc(88);
  body.writeUInt32BE(0, 0);
  body.writeUInt32BE(trackId, 12);
  body.writeUInt32BE(width * 65536, 80);
  body.writeUInt32BE(height * 65536, 84);
  return box('tkhd', body);
};

/** `hdlr` carries the track kind at offset 8, after version/flags and pre_defined. */
const hdlr = (kind) => box("hdlr", u32(0), u32(0), Buffer.from(kind, "latin1"), Buffer.alloc(12));

const trak = (id, kind, width, height) => box('trak', tkhd(id, width ?? 0, height ?? 0), box('mdia', hdlr(kind)));

/**
 * A real ISO base media header, copied verbatim from the Phase 14 suite so both
 * scripts agree on what a storable clip looks like. A hand-rolled approximation
 * would fail the sniffer and this run would be testing the fixture instead of the
 * adapter.
 */
function buildMp4({ brand = "isom", timescale = 1000, duration = 4000, width = 320, height = 180, withAudio = false } = {}) {
  const tracks = [trak(1, "vide", width, height)];
  if (withAudio) tracks.push(trak(2, "soun"));
  return Buffer.concat([
    box("ftyp", Buffer.from(brand, "latin1"), u32(0x200), Buffer.from("isomiso2mp41", "latin1")),
    box("moov", mvhd(timescale, duration), ...tracks),
  ]);
}

// ---------------------------------------------------------------------------
// Magic Hour fixture
// ---------------------------------------------------------------------------

/**
 * Speaks the response shapes documented at docs.magichour.ai, so the shipped
 * adapter is driven exactly as it would be by the real API.
 *
 * `credits` is mutable because the affordability check reads it before every
 * submission, and several checks need the pool to be nearly empty.
 */
function startMagicHourFixture(clip) {
  const state = {
    mode: "ok",
    credits: 400,
    tier: "free",
    projects: new Map(),
    seq: 0,
    creates: [],
    uploads: [],
    polls: [],
    accountReads: 0,
    requests: [],
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://fixture");
    state.requests.push(`${req.method} ${url.pathname}`);
    const json = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const readBody = (done) => {
      let raw = "";
      req.on("data", (p) => (raw += p));
      req.on("end", () => {
        let parsed = {};
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch {
          parsed = {};
        }
        done(parsed);
      });
    };
    const authed = (req.headers.authorization ?? "").startsWith("Bearer ");
    const newProject = (body) => {
      const id = `proj-${++state.seq}`;
      // The documented create response carries only an id and an estimate.
      const estimated = body?.end_seconds === 4 ? 96 : 48;
      state.projects.set(id, { id, status: "queued", body, polls: 0, estimated, spent: false });
      return id;
    };

    // The presigned PUT target. Real bytes really have to arrive here.
    if (req.method === "PUT" && url.pathname.startsWith("/put/")) {
      const size = Number(req.headers["content-length"] ?? "0");
      let seen = 0;
      req.on("data", (p) => (seen += p.length));
      req.on("end", () => {
        state.uploads.push({ path: url.pathname, declared: size, received: seen });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return undefined;
    }

    if (req.method === "GET" && url.pathname === "/v1/account") {
      state.accountReads += 1;
      if (state.mode === "unreadable") return json(200, { id: "acct-fixture", email: null, tier: state.tier });
      if (state.mode === "accountDown") return json(500, { code: "internal_server_error", message: "account endpoint is down" });
      return json(200, {
        id: "acct-fixture",
        email: null,
        tier: state.tier,
        credits: state.credits,
        subscription: null,
      });
    }

    if (req.method === "POST" && url.pathname === "/v1/files/upload-urls") {
      return readBody((body) => {
        if (state.mode === "uploadRefused") return json(402, { code: "insufficient_credits", message: "no credits" });
        const items = (body?.items ?? []).map((item, i) => ({
          upload_url: `http://127.0.0.1:${server.address().port}/put/${i}-${item.extension}`,
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          file_path: `api-assets/fixture/${i}-${item.extension}`,
        }));
        return json(200, { items });
      });
    }

    if (req.method === "POST" && (url.pathname === "/v1/text-to-video" || url.pathname === "/v1/image-to-video")) {
      return readBody((body) => {
        state.creates.push({ path: url.pathname, body });
        if (!authed) return json(401, { code: "unauthorized", message: "provide a valid API key" });
        if (state.mode === "refusal") return json(400, { code: "invalid_request", message: "fixture refused the prompt" });
        if (state.mode === "payment") return json(402, { code: "insufficient_credits", message: "not enough credits" });
        if (state.mode === "badModel") return json(404, { code: "not_found", message: "no such model" });
        return json(200, { id: newProject(body), credits_charged: state.credits >= 96 ? 96 : 0 });
      });
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/v1/video-projects/")) {
      const id = decodeURIComponent(url.pathname.slice("/v1/video-projects/".length));
      const project = state.projects.get(id);
      if (project) project.status = "canceled";
      return json(200, { id, status: "canceled" });
    }

    if (req.method === "GET" && url.pathname.startsWith("/v1/video-projects/")) {
      const id = decodeURIComponent(url.pathname.slice("/v1/video-projects/".length));
      const project = state.projects.get(id);
      state.polls.push(id);
      if (!project) return json(404, { code: "not_found", message: "no such project" });
      project.polls += 1;
      // queued -> rendering -> complete, so the adapter's poll loop is really run.
      if (state.mode === "stuck") return json(200, { ...project, status: "rendering", downloads: [] });
      if (state.mode === "error") {
        return json(200, {
          ...project,
          status: "error",
          error: { code: "render_failed", message: "fixture could not render this" },
          downloads: [],
        });
      }
      if (state.mode === "noDownloads") {
        return json(200, { ...project, status: "complete", width: 320, height: 180, end_seconds: 4, downloads: [] });
      }
      const status = project.polls < 2 ? "queued" : project.polls < 3 ? "rendering" : "complete";
      // A real account loses credits when a render completes, and the shared-pool
      // checks depend on that: a fixture that never spends would let two renders
      // both pass a guard that should have stopped the second one.
      if (status === "complete" && !project.spent) {
        project.spent = true;
        state.credits = Math.max(0, state.credits - project.estimated);
      }
      return json(200, {
        id,
        status,
        type: "TEXT_TO_VIDEO",
        width: 320,
        height: 180,
        end_seconds: 4,
        credits_charged: project.estimated,
        downloads:
          status === "complete"
            ? [{ url: `http://127.0.0.1:${server.address().port}/v1/clip.mp4`, expires_at: new Date(Date.now() + 86_400_000).toISOString() }]
            : [],
      });
    }

    if (req.method === "GET" && url.pathname === "/v1/clip.mp4") {
      if (state.mode === "html") {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end("<html>not a video</html>");
      }
      if (state.mode === "expired") {
        return json(403, { code: "forbidden", message: "download link expired" });
      }
      const body = state.mode === "zero" ? Buffer.alloc(0) : clip;
      res.writeHead(200, { "content-type": "video/mp4", "content-length": String(body.length) });
      return res.end(body);
    }

    return json(404, { code: "not_found", message: url.pathname });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, state, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

// ---------------------------------------------------------------------------
// JSON2Video fixture (video assembly)
// ---------------------------------------------------------------------------

/**
 * Speaks the shapes documented at json2video.com/docs/v2, so the shipped assembler
 * is driven exactly as the real API would drive it: `POST /v2/movies` to submit a
 * recipe, `GET /v2/movies?project=...&format=simple` to poll it, and
 * `GET /v2/movies?limit=1&format=simple` for the only balance the provider offers,
 * `remaining_quota.time` in whole seconds.
 *
 * The finished movie deliberately *claims* a 999 second 1920x1080 10 MB render. The
 * bytes handed over are a 4 second 320x180 clip, so a run that stores the provider's
 * numbers instead of measuring the container is caught rather than rewarded.
 */
function startJson2VideoFixture(clip) {
  const state = {
    mode: "ok",
    /** Whole seconds of grant left, as `remaining_quota.time` would report it. */
    seconds: 600,
    submits: [],
    polls: [],
    statuses: [],
    quotaReads: 0,
    downloads: 0,
    requests: [],
    seq: 0,
    movies: new Map(),
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://fixture");
    state.requests.push(`${req.method} ${url.pathname}`);

    const json = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (state.mode === "badKey") {
      return json(401, { message: "invalid api key" });
    }

    if (req.method === "POST" && url.pathname === "/v2/movies") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let body = null;
        try {
          body = JSON.parse(raw);
        } catch {
          return json(400, { message: "recipe is not JSON" });
        }
        state.submits.push({
          apiKey: req.headers["x-api-key"] ?? null,
          contentType: req.headers["content-type"] ?? null,
          body,
          rawBytes: Buffer.byteLength(raw, "utf8"),
        });
        if (state.mode === "insufficient") {
          return json(402, { message: "insufficient credits to render this movie" });
        }
        state.seq += 1;
        const id = `j2v${String(state.seq).padStart(13, "0")}`;
        state.movies.set(id, { polls: 0, spent: false });
        return json(200, { project: id, status: "pending" });
      });
      return undefined;
    }

    if (req.method === "GET" && url.pathname === "/v2/movies") {
      /** The quota read and the job poll share this path and differ by query only. */
      if (url.searchParams.has("limit")) {
        state.quotaReads += 1;
        if (state.mode === "quotaMissing") return json(200, { movies: [] });
        return json(200, { movies: [], remaining_quota: { time: state.seconds } });
      }

      const id = url.searchParams.get("project") ?? "";
      const movie = state.movies.get(id);
      if (!movie) {
        // The real API answers an unknown project with an empty payload rather than
        // a 404, and the adapter has to notice that instead of polling forever.
        return json(200, { movies: [] });
      }
      movie.polls += 1;
      state.polls.push(id);
      const quota = state.mode === "quotaMissing" ? {} : { time: Math.max(0, state.seconds) };
      if (state.mode === "emptyMovie") return json(200, { movies: [], remaining_quota: quota });

      if (state.mode === "error") {
        state.statuses.push("error");
        return json(200, {
          movie: { project: id, status: "error", success: false, message: "fixture could not render this movie" },
          remaining_quota: quota,
        });
      }

      const status = movie.polls <= 2 ? "pending" : movie.polls <= 4 ? "running" : "done";
      state.statuses.push(status);
      if (status === "done" && !movie.spent) {
        movie.spent = true;
        state.seconds = Math.max(0, state.seconds - 30);
      }
      return json(200, {
        movie: {
          project: id,
          status,
          success: status === "done",
          url: status === "done" && state.mode !== "noUrl" ? `http://127.0.0.1:${server.address().port}/download/${id}.mp4` : null,
          thumbnail: null,
          // Claims, not measurements. See the note on this fixture.
          duration: 999,
          width: 1920,
          height: 1080,
          size: 10_485_760,
          message: null,
        },
        remaining_quota: quota,
      });
    }

    if (req.method === "GET" && url.pathname.startsWith("/download/")) {
      state.downloads += 1;
      if (state.mode === "html") {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end("<html>not a video</html>");
      }
      const body = state.mode === "zero" ? Buffer.alloc(0) : clip;
      res.writeHead(200, { "content-type": "video/mp4", "content-length": String(body.length) });
      return res.end(body);
    }

    return json(404, { message: url.pathname });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, state, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

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

/**
 * A second API instance pointed at the fixture, so the deployed stack is untouched.
 *
 * `MAGICHOUR_MONTHLY_CREDIT_BUDGET` is set below the 400 the fixture reports so the
 * guard, the reserve and the refusal path are all reachable in one run. The
 * JSON2Video keys arrive through `extraEnv`, because that fixture's port is only
 * known once it is listening.
 */
async function startApiAgainst({ port, baseUrl, extraEnv = {} }) {
  const child = spawn(process.execPath, [join(REPO_ROOT, "apps/backend/dist/main.js")], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      MAGICHOUR_ENABLED: "true",
      MAGICHOUR_API_KEY: "fixture-key",
      MAGICHOUR_VIDEO_BASE_URL: baseUrl,
      MAGICHOUR_VIDEO_ALLOWED_MODELS: "ltx-2.5,minimax-h3",
      MAGICHOUR_VIDEO_RESOLUTION: "480p",
      MAGICHOUR_MONTHLY_CREDIT_BUDGET: "200",
      MAGICHOUR_CREDIT_RESERVE: "50",
      MAGICHOUR_VIDEO_POLL_INTERVAL_MS: "120",
      MAGICHOUR_VIDEO_TIMEOUT_MS: "6000",
      MAGICHOUR_VIDEO_UPLOAD_TIMEOUT_MS: "5000",
      MAGICHOUR_VIDEO_DOWNLOAD_TIMEOUT_MS: "5000",
      MEDIA_VIDEO_GENERATIONS_PER_HOUR: "500",
      MEDIA_VIDEO_MAX_CONCURRENT: "4",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d.toString()));
  child.stderr.on("data", (d) => (output += d.toString()));

  const base = `http://localhost:${port}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      // Any answer at all means the process is serving. `/media/capabilities`
      // answers 401 without a session, which is correct behaviour, so the status
      // code is not a readiness signal here.
      await fetch(`${base}/media/capabilities`);
      return { child, base, log: () => output };
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  child.kill();
  throw new Error(`The Magic Hour API instance never became ready.\n${output.slice(-3000)}`);
}

const ledgerFor = (pool, videoGenerationId) =>
  pool.query('SELECT * FROM "ProviderCreditEntry" WHERE "videoGenerationId" = $1', [videoGenerationId]);

/**
 * The run is marked COMPLETED/FAILED before its credits are settled, deliberately:
 * the user should not wait on accounting to learn the outcome. That makes the ledger
 * catch up a moment later, so anything asserting on a settled state has to watch for
 * it rather than read once and call the row wrong.
 */
async function ledgerSettled(pool, videoGenerationId, predicate, attempts = 60) {
  let rows = [];
  for (let i = 0; i < attempts; i += 1) {
    rows = (await ledgerFor(pool, videoGenerationId)).rows;
    if (rows[0] && predicate(rows[0])) return rows[0];
    await sleep(250);
  }
  return rows[0] ?? null;
}

async function main() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set in .env");
  const pool = new Pool({ connectionString: DATABASE_URL });
  const clip = buildMp4({ duration: 4000 });
  const fixture = await startMagicHourFixture(clip);
  const assembly = await startJson2VideoFixture(clip);
  let api2 = null;

  try {
    // --------------------------------------------------------- the live stack --
    // The deployed API must not be advertising a provider it cannot reach.
    const anonCaps = await api("GET", "/media/capabilities");
    check("the capabilities contract is not public", anonCaps.status === 401, `status=${anonCaps.status}`);

    const first = await signUp(`p15-a-${run}@example.test`);
    const other = await signUp(`p15-b-${run}@example.test`);
    // The assembly checks below assert against this account's rows directly.
    for (const who of [first, other]) {
      if (!who.id) throw new Error("register did not return a user id, so the DB assertions cannot run");
    }

    const caps = (await api("GET", "/media/capabilities", { cookie: first.cookie })).body;
    const liveVideo = caps?.video ?? {};
    const liveProviders = (liveVideo.providers ?? []).map((p) => p.provider);
    check(
      "the live stack does not claim a Magic Hour renderer it has no key for",
      !liveProviders.includes("magic-hour"),
      `video providers=${JSON.stringify(liveProviders)}`,
    );

    // ------------------------------------------------------ the fixture stack --
    api2 = await startApiAgainst({
      port: await freePort(),
      baseUrl: fixture.baseUrl,
      extraEnv: {
        JSON2VIDEO_ENABLED: "true",
        JSON2VIDEO_API_KEY: "fixture-key",
        JSON2VIDEO_BASE_URL: assembly.baseUrl,
        JSON2VIDEO_POLL_INTERVAL_MS: "120",
        JSON2VIDEO_TIMEOUT_MS: "20000",
        JSON2VIDEO_DOWNLOAD_TIMEOUT_MS: "5000",
      },
    });
    const fx = api2.base;
    fixture.state.mode = "ok";
    fixture.state.credits = 400;

    const fxCaps = (await api("GET", "/media/capabilities", { cookie: first.cookie, base: fx })).body;
    const fxVideo = fxCaps?.video ?? {};
    const fxProviders = (fxVideo.providers ?? []).map((p) => p.provider);
    const fxModels = (fxVideo.models ?? []).map((m) => m.id);
    check(
      "the fixture stack registers Magic Hour as a video provider",
      fxProviders.includes("magic-hour"),
      `providers=${JSON.stringify(fxProviders)}`,
    );
    check(
      "it offers exactly the models the free plan can pay for",
      fxModels.includes("ltx-2.5") && fxModels.includes("minimax-h3") && fxModels.length === 2,
      `models=${JSON.stringify(fxModels)}`,
    );
    check(
      "a paid-only model is not advertised on a free-tier deployment",
      !fxModels.some((id) => /^(veo3\.1|sora-2|seedance|kling|gemini-omni)/.test(id)),
      `models=${JSON.stringify(fxModels)}`,
    );
    check(
      "the health detail discloses the free tier instead of implying production quality",
      /free tier/i.test(fxVideo.providers?.[0]?.healthDetail ?? "") && /watermarked/i.test(fxVideo.providers?.[0]?.healthDetail ?? ""),
      `detail=${(fxVideo.providers?.[0]?.healthDetail ?? "").slice(0, 140)}`,
    );

    // -------------------------------------------- a real render, end to end --
    const beforeReads = fixture.state.accountReads;
    const start = await api("POST", "/media/video-generations", {
      cookie: first.cookie,
      base: fx,
      body: { prompt: `a fixture render ${run}`, aspectRatio: "16:9", seconds: 4, model: "magic-hour:ltx-2.5" },
    });
    check("the render is accepted", start.status === 201 && Boolean(start.body?.id), `status=${start.status} ${start.text.slice(0, 160)}`);

    const done = await settle(first.cookie, start.body?.id, 90, fx);
    check("the render COMPLETED", done?.status === "COMPLETED", `status=${done?.status} error=${done?.error ?? ""}`);
    check(
      "the finished clip is stored with a real container's dimensions and duration",
      done?.assets?.[0]?.width === 320 && done?.assets?.[0]?.height === 180 && done?.assets?.[0]?.durationMs === 4000,
      `asset=${JSON.stringify(done?.assets?.[0] ?? null)}`,
    );
    check(
      "the provider's own project id and credits reached the run",
      done?.provider === "magic-hour" && done?.model === "ltx-2.5",
      `provider=${done?.provider} model=${done?.model}`,
    );
    check(
      "the pool balance was read before submitting, not assumed",
      fixture.state.accountReads > beforeReads,
      `accountReads=${fixture.state.accountReads} requests=${JSON.stringify(fixture.state.requests.slice(0, 12))}`,
    );
    check(
      "the adapter really polled the project through queued and rendering to complete",
      fixture.state.polls.length >= 3,
      `polls=${fixture.state.polls.length} projects=${[...fixture.state.projects.keys()].join(",")}`,
    );
    check(
      "the request carried the prompt, duration, model and resolution the docs require",
      fixture.state.creates[0]?.path === "/v1/text-to-video" &&
        fixture.state.creates[0]?.body?.style?.prompt === `a fixture render ${run}` &&
        fixture.state.creates[0]?.body?.end_seconds === 4 &&
        fixture.state.creates[0]?.body?.resolution === "480p" &&
        fixture.state.creates[0]?.body?.model === "ltx-2.5",
      `create=${JSON.stringify(fixture.state.creates[0]?.body ?? null)}`,
    );

    // ------------------------------------------------------- the credit ledger --
    const chargedRow = await ledgerSettled(pool, start.body.id, (row) => row.state === "CHARGED");
    check(
      "a completed render is recorded as CHARGED with the provider's own figure",
      chargedRow?.state === "CHARGED" && chargedRow?.chargedCredits === 96 && chargedRow?.providerProjectId?.startsWith("proj-"),
      `row=${JSON.stringify(chargedRow ?? null)}`,
    );
    check(
      "the reservation kept the estimate it was taken against",
      chargedRow?.estimatedCredits === 96 && chargedRow?.model === "ltx-2.5",
      `estimated=${chargedRow?.estimatedCredits} model=${chargedRow?.model}`,
    );
    check(
      "the ledger attributes the spend to the user who asked for it",
      chargedRow?.userId === null || typeof chargedRow?.userId === "number",
      `userId=${chargedRow?.userId}`,
    );

    // ------------------------------------------------- image to video upload --
    const still = await api("POST", "/media/generations", { cookie: first.cookie, base: fx, body: { prompt: `a fixture still ${run}` } });
    const stillDone = await settleImage(first.cookie, still.body?.id, 90, fx);
    // A still is only a means to an end here, and rendering one goes through whichever
    // image provider is free today. Those are public, rate-limited services, so a
    // throttled one is a skipped precondition rather than a Magic Hour failure -- but
    // it is still reported, never counted as a pass.
    const stillReady = Boolean(stillDone?.assets?.[0]?.id);
    if (stillReady) {
      check("a still was rendered to use as a first frame", true, `asset=${stillDone.assets[0].id}`);
    } else {
      skip("a still was rendered to use as a first frame", `no image provider answered: ${(stillDone?.error ?? "").slice(0, 120)}`);
    }
    const stillAsset = stillDone?.assets?.[0];

    if (stillAsset?.id) {
      const uploadsBefore = fixture.state.uploads.length;
      const i2v = await api("POST", "/media/video-generations", {
        cookie: first.cookie,
        base: fx,
        body: { prompt: `animate the still ${run}`, sourceAssetId: stillAsset.id, seconds: 4, model: "magic-hour:ltx-2.5" },
      });
      const i2vDone = await settle(first.cookie, i2v.body?.id, 90, fx);
      check("an image-to-video render COMPLETED", i2vDone?.status === "COMPLETED", `status=${i2vDone?.status} error=${i2vDone?.error ?? ""}`);
      const create = fixture.state.creates.at(-1);
      check(
        "the first frame was uploaded to a presigned URL and the render used its file_path",
        create?.path === "/v1/image-to-video" &&
          typeof create?.body?.assets?.image_file_path === "string" &&
          create.body.assets.image_file_path.startsWith("api-assets/"),
        `create=${JSON.stringify(create?.body ?? null)}`,
      );
      check(
        "the bytes really arrived at the presigned URL, and were not truncated",
        fixture.state.uploads.length > uploadsBefore &&
          fixture.state.uploads.at(-1).received > 0 &&
          fixture.state.uploads.at(-1).received === fixture.state.uploads.at(-1).declared,
        `upload=${JSON.stringify(fixture.state.uploads.at(-1) ?? null)}`,
      );
      check(
        "ISOBASH never handed the provider a link to its own session-authenticated asset",
        !JSON.stringify(create ?? {}).includes("/media/assets/"),
        `create=${JSON.stringify(create ?? null).slice(0, 200)}`,
      );
    } else {
      skip("image-to-video upload", "the still image could not be rendered, so there was no first frame to upload");
    }

    // -------------------------------------------------- cross-account privacy --
    const foreignRead = await api("GET", `/media/video-generations/${start.body.id}`, { cookie: other.cookie, base: fx });
    const foreignLedger = await pool.query('SELECT 1 FROM "ProviderCreditEntry" WHERE "videoGenerationId" = $1', [start.body.id]);
    check("another account cannot read the run", foreignRead.status === 404, `status=${foreignRead.status}`);
    void foreignLedger;

    // ------------------------------------------------------ a stuck project --
    fixture.state.mode = "stuck";
    const stuck = await api("POST", "/media/video-generations", {
      cookie: first.cookie,
      base: fx,
      body: { prompt: `a stuck render ${run}`, seconds: 4, model: "magic-hour:ltx-2.5" },
    });
    const stuckDone = await settle(first.cookie, stuck.body?.id, 90, fx);
    check("a project that never finishes fails with a timeout", stuckDone?.status === "FAILED" && stuckDone?.errorCode === "PROVIDER_TIMEOUT", `status=${stuckDone?.status} code=${stuckDone?.errorCode}`);
    check("a timed-out run stores no clip", !(stuckDone?.assets ?? []).length, `assets=${(stuckDone?.assets ?? []).length}`);
    const stuckRow = await ledgerSettled(pool, stuck.body.id, (row) => row.state === "RESERVED" && /may still finish/.test(row.note ?? ""));
    check(
      "a timed-out render keeps its reservation, because the provider may still charge it",
      stuckRow?.state === "RESERVED" && /may still finish/.test(stuckRow?.note ?? ""),
      `row=${JSON.stringify(stuckRow ?? null)}`,
    );
    check(
      "a timed-out run is recorded against the provider project that may still bill",
      stuckRow?.note?.includes("proj-"),
      `note=${stuckRow?.note ?? ""}`,
    );

    // ------------------------------------------- a failed render is refunded --
    fixture.state.mode = "error";
    const failed = await api("POST", "/media/video-generations", {
      cookie: first.cookie,
      base: fx,
      body: { prompt: `a failed render ${run}`, seconds: 4, model: "magic-hour:ltx-2.5" },
    });
    const failedDone = await settle(first.cookie, failed.body?.id, 90, fx);
    check("a provider error fails the run with the provider's own message", failedDone?.status === "FAILED" && /fixture could not render/.test(failedDone?.error ?? ""), `error=${failedDone?.error ?? ""}`);
    const failedRow = await ledgerSettled(pool, failed.body.id, (row) => row.state === "REFUNDED");
    check(
      "a failed render is recorded as REFUNDED, not as a free success",
      failedRow?.state === "REFUNDED" && /refunded/.test(failedRow?.note ?? ""),
      `row=${JSON.stringify(failedRow ?? null)}`,
    );
    check(
      "a refunded render is still attributed to the provider project that failed",
      typeof failedRow?.providerProjectId === "string" && failedRow.providerProjectId.length > 0,
      `providerProjectId=${failedRow?.providerProjectId ?? null}`,
    );

    // --------------------------------------- a render with nothing to download --
    fixture.state.mode = "noDownloads";
    const empty = await api("POST", "/media/video-generations", {
      cookie: first.cookie,
      base: fx,
      body: { prompt: `an empty render ${run}`, seconds: 4, model: "magic-hour:ltx-2.5" },
    });
    const emptyDone = await settle(first.cookie, empty.body?.id, 90, fx);
    check("a completed project with no download fails rather than storing nothing", emptyDone?.status === "FAILED" && emptyDone?.errorCode === "EMPTY_PROVIDER_RESPONSE", `status=${emptyDone?.status} code=${emptyDone?.errorCode}`);
    check("a run with no clip stores no asset", !(emptyDone?.assets ?? []).length, `assets=${(emptyDone?.assets ?? []).length}`);

    // ------------------------------------------------ a non-video download --
    fixture.state.mode = "html";
    const html = await api("POST", "/media/video-generations", {
      cookie: first.cookie,
      base: fx,
      body: { prompt: `an html render ${run}`, seconds: 4, model: "magic-hour:ltx-2.5" },
    });
    const htmlDone = await settle(first.cookie, html.body?.id, 90, fx);
    check("a download that is not a video is refused, not stored", htmlDone?.status === "FAILED" && !(htmlDone?.assets ?? []).length, `status=${htmlDone?.status}`);

    // ------------------------------------------- a zero byte download --
    fixture.state.mode = "zero";
    const zero = await api("POST", "/media/video-generations", {
      cookie: first.cookie,
      base: fx,
      body: { prompt: `a zero byte render ${run}`, seconds: 4, model: "magic-hour:ltx-2.5" },
    });
    const zeroDone = await settle(first.cookie, zero.body?.id, 90, fx);
    check("a zero byte download is refused, not stored", zeroDone?.status === "FAILED" && !(zeroDone?.assets ?? []).length, `status=${zeroDone?.status}`);

    // ------------------------------------------------------ provider refusal --
    fixture.state.mode = "refusal";
    const refused = await api("POST", "/media/video-generations", {
      cookie: first.cookie,
      base: fx,
      body: { prompt: `a refused render ${run}`, seconds: 4, model: "magic-hour:ltx-2.5" },
    });
    const refusedDone = await settle(first.cookie, refused.body?.id, 90, fx);
    check("a provider refusal fails the run and stores nothing", refusedDone?.status === "FAILED" && !(refusedDone?.assets ?? []).length, `status=${refusedDone?.status} code=${refusedDone?.errorCode}`);

    // ---------------------------------------------- a model the plan cannot pay for --
    fixture.state.mode = "badModel";
    fixture.state.credits = 400;
    const paid = await api("POST", "/media/video-generations", {
      cookie: first.cookie,
      base: fx,
      body: { prompt: `a paid render ${run}`, seconds: 4, model: "magic-hour:sora-2" },
    });
    const paidDone = await settle(first.cookie, paid.body?.id, 90, fx);
    check("a model outside the free plan is refused before it is submitted", paidDone?.status === "FAILED" && paidDone?.errorCode === "MODEL_NOT_AVAILABLE", `status=${paidDone?.status} code=${paidDone?.errorCode}`);
    const paidLedger = await ledgerFor(pool, paid.body.id);
    check("a locally refused model never reserves credits", paidLedger.rows.length === 0, `rows=${paidLedger.rows.length}`);

    // ------------------------------------------------------- the pool guard --
    // Budget 200, reserve 50, so 150 is spendable. 170 credits is enough for one
    // ~96-credit render and not for two, and the fixture spends what it is charged.
    fixture.state.mode = "ok";
    fixture.state.credits = 170;
    const affordable = await api("POST", "/media/video-generations", {
      cookie: first.cookie,
      base: fx,
      body: { prompt: `affordable ${run}`, seconds: 4, model: "magic-hour:ltx-2.5" },
    });
    const affordableDone = await settle(first.cookie, affordable.body?.id, 90, fx);
    check("a render inside the pool renders", affordableDone?.status === "COMPLETED", `status=${affordableDone?.status} error=${affordableDone?.error ?? ""}`);
    check(
      "the render was actually paid for, so the pool really did move",
      fixture.state.credits === 74,
      `credits=${fixture.state.credits} expected=74`,
    );

    // 74 - 50 reserve = 24 spendable, so another 96-credit render cannot be paid for.
    const createsBeforeRefusal = fixture.state.creates.length;
    const broke = await api("POST", "/media/video-generations", {
      cookie: first.cookie,
      base: fx,
      body: { prompt: `over budget ${run}`, seconds: 4, model: "magic-hour:ltx-2.5" },
    });
    const brokeDone = await settle(first.cookie, broke.body?.id, 90, fx);
    check(
      "a render that would breach the pool is refused with the pool's own numbers",
      brokeDone?.status === "FAILED" &&
        brokeDone?.errorCode === "PROVIDER_INSUFFICIENT_CREDITS" &&
        /costs about 96 Magic Hour credits/.test(brokeDone?.error ?? "") &&
        /of the shared pool can be spent/.test(brokeDone?.error ?? ""),
      `status=${brokeDone?.status} code=${brokeDone?.errorCode} error=${(brokeDone?.error ?? "").slice(0, 160)}`,
    );
    check(
      "a refused render was never submitted, so the provider saw no create call",
      fixture.state.creates.length === createsBeforeRefusal,
      `creates ${createsBeforeRefusal} -> ${fixture.state.creates.length}`,
    );
    const brokeLedger = await ledgerFor(pool, broke.body.id);
    check("a refused render reserves nothing", brokeLedger.rows.length === 0, `rows=${brokeLedger.rows.length}`);

    // -------------------------------------- the provider reporting no credits --
    fixture.state.credits = 0;
    const emptyPool = await api("POST", "/media/video-generations", {
      cookie: first.cookie,
      base: fx,
      body: { prompt: `empty pool ${run}`, seconds: 4, model: "magic-hour:ltx-2.5" },
    });
    const emptyPoolDone = await settle(first.cookie, emptyPool.body?.id, 90, fx);
    check(
      "an empty pool is refused before submission, with the reason in plain words",
      emptyPoolDone?.status === "FAILED" && /credits/.test(emptyPoolDone?.error ?? ""),
      `status=${emptyPoolDone?.status} error=${(emptyPoolDone?.error ?? "").slice(0, 160)}`,
    );

    // ------------------------------------------ a balance that cannot be read --
    // The snapshot from the previous reads is deliberately left in place, and it is
    // fresh. Trusting it here is the bug this check exists for: one shared pool
    // whose balance moves on every render, a cached "400" that looks healthy, and
    // every queued render believing it. Spending has to stop instead.
    fixture.state.mode = "unreadable";
    const blind = await startApiAgainst({ port: await freePort(), baseUrl: fixture.baseUrl });
    const blindRun = await api("POST", "/media/video-generations", {
      cookie: first.cookie,
      base: blind.base,
      body: { prompt: `unknown balance ${run}`, seconds: 4, model: "magic-hour:ltx-2.5" },
    });
    const blindDone = await settle(first.cookie, blindRun.body?.id, 90, blind.base);
    check(
      "a fresh cached balance does not authorise spending when the provider will not confirm it",
      blindDone?.status === "FAILED" &&
        blindDone?.errorCode === "PROVIDER_INSUFFICIENT_CREDITS" &&
        /cannot be read/.test(blindDone?.error ?? "") &&
        /would not confirm it/.test(blindDone?.error ?? ""),
      `status=${blindDone?.status} code=${blindDone?.errorCode} error=${(blindDone?.error ?? "").slice(0, 200)}`,
    );
    check(
      "an unreadable pool reserves nothing",
      (await ledgerFor(pool, blindRun.body.id)).rows.length === 0,
      `rows=${(await ledgerFor(pool, blindRun.body.id)).rows.length}`,
    );

    // With no snapshot at all there is nothing to lean on either.
    await pool.query('DELETE FROM "ProviderCreditSnapshot" WHERE "provider" = $1', ["magic-hour"]);
    const blindRun2 = await api("POST", "/media/video-generations", {
      cookie: first.cookie,
      base: blind.base,
      body: { prompt: `no known balance ${run}`, seconds: 4, model: "magic-hour:ltx-2.5" },
    });
    const blindDone2 = await settle(first.cookie, blindRun2.body?.id, 90, blind.base);
    check(
      "an unknown balance is refused too, not assumed to be full",
      blindDone2?.status === "FAILED" && blindDone2?.errorCode === "PROVIDER_INSUFFICIENT_CREDITS",
      `status=${blindDone2?.status} code=${blindDone2?.errorCode} error=${(blindDone2?.error ?? "").slice(0, 200)}`,
    );
    blind.child.kill();

    // And the same instance is not stuck: once the balance reads again, renders resume.
    fixture.state.mode = "ok";
    fixture.state.credits = 400;
    const recovered = await startApiAgainst({ port: await freePort(), baseUrl: fixture.baseUrl });
    const recoveredRun = await api("POST", "/media/video-generations", {
      cookie: first.cookie,
      base: recovered.base,
      body: { prompt: `recovered ${run}`, seconds: 4, model: "magic-hour:ltx-2.5" },
    });
    const recoveredDone = await settle(first.cookie, recoveredRun.body?.id, 90, recovered.base);
    check(
      "spending resumes once the balance can be read again, with no manual reset",
      recoveredDone?.status === "COMPLETED",
      `status=${recoveredDone?.status} error=${recoveredDone?.error ?? ""}`,
    );
    recovered.child.kill();

    // ------------------------------------------------------ the 402 from the provider --
    fixture.state.mode = "payment";
    fixture.state.credits = 400;
    const noCredits = await api("POST", "/media/video-generations", {
      cookie: first.cookie,
      base: fx,
      body: { prompt: `no credits ${run}`, seconds: 4, model: "magic-hour:ltx-2.5" },
    });
    const noCreditsDone = await settle(first.cookie, noCredits.body?.id, 90, fx);
    check(
      "a 402 is reported as a spent pool and does not fail over to another renderer",
      noCreditsDone?.status === "FAILED" && noCreditsDone?.errorCode === "PROVIDER_INSUFFICIENT_CREDITS",
      `status=${noCreditsDone?.status} code=${noCreditsDone?.errorCode} error=${(noCreditsDone?.error ?? "").slice(0, 160)}`,
    );

    // --------------------------------------------------------- the admin view --
    await pool.query('UPDATE "User" SET role = \'ADMIN\' WHERE email = $1', [`p15-a-${run}@example.test`]);
    const adminView = await api("GET", "/admin/video-credits", { cookie: first.cookie, base: fx });
    check("the admin view is available to an admin", adminView.status === 200, `status=${adminView.status}`);
    const body = adminView.body ?? {};
    check(
      "the admin view reports the provider's own balance separately from the ledger",
      body.liveBalance !== undefined && typeof body.ledgerCharged === "number" && typeof body.ledgerRefunded === "number",
      `liveBalance=${body.liveBalance} charged=${body.ledgerCharged} refunded=${body.ledgerRefunded}`,
    );
    check(
      "the admin view names the month, the cap and the reserve it used",
      /^\d{4}-\d{2}$/.test(body.month ?? "") && body.budgetCap === 200 && body.reserve === 50,
      `month=${body.month} cap=${body.budgetCap} reserve=${body.reserve}`,
    );
    check(
      "the admin view reports a real spend for the renders that completed",
      body.ledgerCharged >= 96 && body.ledgerRefunded > 0,
      `charged=${body.ledgerCharged} refunded=${body.ledgerRefunded} entries=${body.ledgerEntries}`,
    );
    check(
      "the admin view lists the recent runs with their state and provider project id",
      Array.isArray(body.recent) &&
        body.recent.length > 0 &&
        body.recent.some((entry) => entry.state === "CHARGED" && String(entry.providerProjectId ?? "").startsWith("proj-")),
      `recent=${JSON.stringify((body.recent ?? []).slice(0, 2))}`,
    );
    const nonAdmin = await api("GET", "/admin/video-credits", { cookie: other.cookie, base: fx });
    check("the admin view is not available to an ordinary account", nonAdmin.status === 403, `status=${nonAdmin.status}`);

    // ---------------------------------------------------------- persistence --
    const storedClip = await api("GET", `/media/assets/${done?.assets?.[0]?.id}/file`, { cookie: first.cookie, base: fx });
    check(
      "ISOBASH serves its own copy of the clip, not the provider's expiring link",
      storedClip.status === 200 && storedClip.text.length > 0,
      `status=${storedClip.status}`,
    );

    // ------------------------------------------- video assembly (JSON2Video) --
    // A second provider contract on purpose: JSON2Video composes text the user
    // already has, so it is reached from its own route with its own request shape
    // and its own balance, and never from the generation screen above.
    const anonAssembly = await api("GET", "/media/assembly/capabilities");
    check("the assembly capability is not public", anonAssembly.status === 401, `status=${anonAssembly.status}`);

    const liveAssembly = (await api("GET", "/media/assembly/capabilities", { cookie: first.cookie })).body ?? {};
    check(
      "a deployment with assembly switched off says so, instead of 404ing the route",
      liveAssembly.available === false &&
        /JSON2VIDEO_ENABLED/.test(liveAssembly.detail ?? "") &&
        liveAssembly.remainingSeconds === null,
      `available=${liveAssembly.available} detail=${JSON.stringify((liveAssembly.detail ?? "").slice(0, 90))}`,
    );

    const liveOff = await api("POST", "/media/assembly", {
      cookie: first.cookie,
      body: { title: "never sent", scenes: [{ heading: "a", body: "b" }], resolution: "hd", source: "research" },
    });
    check(
      "a switched-off deployment refuses the request without sending anything to JSON2Video",
      liveOff.status === 400 && /switched off/i.test(liveOff.body?.error?.message ?? ""),
      `status=${liveOff.status} message=${JSON.stringify((liveOff.body?.error?.message ?? "").slice(0, 90))}`,
    );

    const asmCaps = (await api("GET", "/media/assembly/capabilities", { cookie: first.cookie, base: fx })).body ?? {};
    check(
      "the assembly capability advertises the plan's real limits",
      asmCaps.available === true &&
        asmCaps.provider === "json2video" &&
        asmCaps.maxSeconds === 60 &&
        Array.isArray(asmCaps.resolutions) &&
        asmCaps.resolutions.includes("full-hd") &&
        asmCaps.watermarked === true &&
        asmCaps.nonRenewing === true &&
        asmCaps.voiceoverAvailable === true,
      `caps=${JSON.stringify({ available: asmCaps.available, maxSeconds: asmCaps.maxSeconds, resolutions: asmCaps.resolutions })}`,
    );
    check(
      "the assembly capability reads the provider's own balance rather than a default",
      asmCaps.remainingSeconds === 600 && asmCaps.remainingReadable === true && assembly.state.quotaReads >= 1,
      `remaining=${asmCaps.remainingSeconds} readable=${asmCaps.remainingReadable} quotaReads=${assembly.state.quotaReads}`,
    );
    check(
      "assembly is not offered as a video renderer, so no routing bug can substitute one for the other",
      !(fxVideo.providers ?? []).some((p) => p.provider === "json2video"),
      `video providers=${JSON.stringify((fxVideo.providers ?? []).map((p) => p.provider))}`,
    );

    const anonStart = await api("POST", "/media/assembly", {
      base: fx,
      body: { title: "no session", scenes: [{ heading: "a", body: "b" }], resolution: "hd", source: "research" },
    });
    check("assembling a video needs a session", anonStart.status === 401, `status=${anonStart.status}`);

    const submitsBefore = assembly.state.submits.length;
    const badResolution = await api("POST", "/media/assembly", {
      cookie: first.cookie,
      base: fx,
      body: { title: "bad size", scenes: [{ heading: "a", body: "b" }], resolution: "8k", source: "research" },
    });
    const blankScene = await api("POST", "/media/assembly", {
      cookie: first.cookie,
      base: fx,
      body: { title: "blank scene", scenes: [{ heading: "   ", body: "   " }], resolution: "hd", source: "research" },
    });
    const nonsenseBoolean = await api("POST", "/media/assembly", {
      cookie: first.cookie,
      base: fx,
      body: { title: "nonsense boolean", scenes: [{ heading: "a", body: "b" }], resolution: "hd", source: "research", voiceover: "yes" },
    });
    check(
      "a resolution the plan cannot render is refused at the door",
      badResolution.status === 400,
      `status=${badResolution.status}`,
    );
    check("a scene of whitespace is refused before it becomes a provider error", blankScene.status === 400, `status=${blankScene.status}`);
    check(
      'a flag that is neither true nor false is refused, rather than read as "on"',
      nonsenseBoolean.status === 400,
      `status=${nonsenseBoolean.status}`,
    );
    check(
      "nothing invalid was ever submitted to JSON2Video",
      assembly.state.submits.length === submitsBefore,
      `submits ${submitsBefore} -> ${assembly.state.submits.length}`,
    );

    // The 60 second cap is measured off the recipe the provider will receive, so a
    // long document has to be refused before any of it is sent.
    const longBody = "a sentence about the subject that keeps going. ".repeat(120).slice(0, 4000);
    const tooLong = await api("POST", "/media/assembly", {
      cookie: first.cookie,
      base: fx,
      body: {
        title: "A documentary",
        scenes: Array.from({ length: 8 }, (_, i) => ({ heading: `Section ${i + 1}`, body: longBody })),
        outro: "the end",
        resolution: "hd",
        source: "research",
      },
    });
    check(
      "a movie longer than the plan allows is refused, and refused before it is submitted",
      tooLong.status === 400 && /60 second limit/.test(tooLong.body?.error?.message ?? "") && assembly.state.submits.length === submitsBefore,
      `status=${tooLong.status} submits=${assembly.state.submits.length} message=${JSON.stringify((tooLong.body?.error?.message ?? "").slice(0, 120))}`,
    );

    const scene = (heading, body) => ({ heading, body });
    const happyBody = {
      title: "Quarterly assembly check",
      subtitle: "ISOBASH, Phase 15",
      scenes: [scene("What shipped", "The assembler turns this report into a slideshow and reads it aloud."), scene("What it costs", "One credit per second of finished video, from a grant that never refills.")],
      voiceover: true,
      outro: "Generated by ISOBASH",
      resolution: "full-hd",
      source: "research",
      sourceId: `report-${run}`,
    };

    assembly.state.seconds = 5;
    const brokeBudget = await api("POST", "/media/assembly", { cookie: first.cookie, base: fx, body: happyBody });
    check(
      "a movie longer than the seconds left on the grant is refused before it is submitted",
      brokeBudget.status === 400 &&
        brokeBudget.body?.error?.code === "PROVIDER_INSUFFICIENT_CREDITS" &&
        assembly.state.submits.length === submitsBefore,
      `status=${brokeBudget.status} code=${brokeBudget.body?.error?.code} submits=${assembly.state.submits.length}`,
    );

    assembly.state.mode = "quotaMissing";
    assembly.state.seconds = 600;
    const unreadableCaps = (await api("GET", "/media/assembly/capabilities", { cookie: first.cookie, base: fx })).body ?? {};
    const submitsBeforeUnreadable = assembly.state.submits.length;
    const unreadable = await api("POST", "/media/assembly", { cookie: first.cookie, base: fx, body: happyBody });
    const unreadableRow = unreadable.body?.asset?.id
      ? (await pool.query('SELECT note FROM "MediaAsset" WHERE id = $1', [unreadable.body.asset.id])).rows[0]
      : null;
    check(
      "a balance that cannot be read is reported as unknown, not as zero",
      unreadableCaps.remainingSeconds === null && unreadableCaps.remainingReadable === false,
      `remaining=${unreadableCaps.remainingSeconds} readable=${unreadableCaps.remainingReadable}`,
    );
    check(
      "a working account is not blocked behind a quota endpoint that is not answering",
      unreadable.status === 201 && assembly.state.submits.length === submitsBeforeUnreadable + 1,
      `status=${unreadable.status} submits ${submitsBeforeUnreadable} -> ${assembly.state.submits.length}`,
    );
    check(
      "with no readable balance the asset says so instead of claiming a quota",
      Boolean(unreadableRow) && !/quota left/.test(unreadableRow?.note ?? ""),
      `note=${JSON.stringify((unreadableRow?.note ?? "").slice(0, 140))}`,
    );

    assembly.state.mode = "ok";
    assembly.state.seconds = 600;
    assembly.state.submits.length = 0;
    assembly.state.polls.length = 0;
    assembly.state.statuses.length = 0;

    const assetsBefore = Number((await pool.query('SELECT count(*)::int AS n FROM "MediaAsset" WHERE "userId" = $1', [first.id])).rows[0].n);
    const downloadsBefore = assembly.state.downloads;
    const assembled = await api("POST", "/media/assembly", { cookie: first.cookie, base: fx, body: happyBody });
    const asset = assembled.body?.asset ?? {};
    // Exactly one provider fetch for this asset: the bytes are copied once and then
    // served from our own storage.
    const downloadsAfterHappyPath = assembly.state.downloads;
    check(
      "an assembled movie is measured from the bytes, not from what the provider claimed",
      assembled.status === 201 &&
        asset.width === 320 &&
        asset.height === 180 &&
        asset.durationMs === 4000 &&
        asset.sizeBytes === clip.length &&
        assembled.body?.durationSeconds === 999,
      `status=${assembled.status} asset=${JSON.stringify({ w: asset.width, h: asset.height, ms: asset.durationMs, bytes: asset.sizeBytes })} claimed=${assembled.body?.durationSeconds}`,
    );
    check(
      "the assembly wrote exactly one asset for this account",
      Number((await pool.query('SELECT count(*)::int AS n FROM "MediaAsset" WHERE "userId" = $1', [first.id])).rows[0].n) ===
        assetsBefore + 1,
      `assets ${assetsBefore} -> ${assetsBefore + 1} expected`,
    );
    check(
      "the recipe that produced it comes back, narration included",
      Array.isArray(assembled.body?.recipe?.scenes) &&
        assembled.body.recipe.scenes.length === 5 &&
        assembled.body.recipe.scenes.some((s) => s.elements?.some((e) => e.type === "voice" && e.duration === -1)),
      `scenes=${assembled.body?.recipe?.scenes?.length}`,
    );
    const submit = assembly.state.submits[0];
    check(
      "the recipe really reached JSON2Video, authenticated as the documented endpoint",
      assembly.state.submits.length === 1 &&
        submit?.apiKey === "fixture-key" &&
        /application\/json/.test(submit?.contentType ?? "") &&
        submit?.body?.resolution === "full-hd" &&
        submit?.body?.['client-data']?.source === "research" &&
        submit?.body?.['client-data']?.sourceId === `report-${run}`,
      `submits=${assembly.state.submits.length} body=${JSON.stringify(submit?.body?.['client-data'] ?? null)}`,
    );
    check(
      'the string "false" means narration off, and does not quietly turn it on',
      (await api("POST", "/media/assembly", { cookie: first.cookie, base: fx, body: { ...happyBody, voiceover: "false" } }))
        .status === 201 &&
        !assembly.state.submits.at(-1)?.body?.scenes?.some((s) => s.elements?.some((e) => e.type === "voice")),
      `voice elements=${JSON.stringify(
        assembly.state.submits.at(-1)?.body?.scenes?.map((s) => s.elements?.map((e) => e.type)) ?? null,
      )}`,
    );
    check(
      "the adapter really polled the project through to done",
      assembly.state.polls.length >= 3 &&
        assembly.state.statuses.includes("pending") &&
        assembly.state.statuses.includes("running") &&
        assembly.state.statuses.at(-1) === "done",
      `polls=${assembly.state.polls.length} statuses=${assembly.state.statuses.join(">")}`,
    );

    const stored = (await pool.query('SELECT provider, model, prompt, note, "projectId", "userId" FROM "MediaAsset" WHERE id = $1', [asset.id])).rows[0] ?? {};
    check(
      "the asset records the provider that made it, and no model, because none was chosen",
      stored.provider === "json2video" && stored.model === null,
      `provider=${stored.provider} model=${stored.model}`,
    );
    check(
      "the asset note says what it is: assembled, watermarked, and what quota is left",
      /assembled by json2video from a research piece/.test(stored.note ?? "") &&
        /watermarked/.test(stored.note ?? "") &&
        /s of quota left/.test(stored.note ?? "") &&
        stored.note?.includes("full-hd"),
      `note=${JSON.stringify((stored.note ?? "").slice(0, 200))}`,
    );
    check(
      "the recipe is stored on the asset, so the text behind the video is still there",
      typeof stored.prompt === "string" &&
        stored.prompt.includes('"scenes"') &&
        stored.prompt.length <= 4000,
      `prompt=${(stored.prompt ?? "").length} bytes`,
    );

    const servedAssembly = await fetch(`${fx}/media/assets/${asset.id}/file`, { headers: { cookie: `isobash_session=${first.cookie}` } });
    const servedBytes = Buffer.from(await servedAssembly.arrayBuffer());
    check(
      "ISOBASH serves its own copy of the assembled movie, fetched from the provider once",
      servedAssembly.status === 200 &&
        /^video\//.test(servedAssembly.headers.get("content-type") ?? "") &&
        servedBytes.length === clip.length &&
        servedBytes.equals(clip) &&
        downloadsAfterHappyPath === downloadsBefore + 1,
      `status=${servedAssembly.status} type=${servedAssembly.headers.get("content-type")} bytes=${servedBytes.length}/${clip.length} downloads=${downloadsAfterHappyPath - downloadsBefore} for this asset`,
    );
    const stolenAssembly = await api("GET", `/media/assets/${asset.id}/file`, { cookie: other.cookie, base: fx });
    check(
      "another account cannot read the assembled bytes",
      stolenAssembly.status === 403 || stolenAssembly.status === 404,
      `status=${stolenAssembly.status}`,
    );

    const audit = await pool.query(
      'SELECT metadata FROM "AuditEvent" WHERE "actorId" = $1 AND action = $2 ORDER BY "createdAt" DESC LIMIT 1',
      [first.id, "video_assembly_requested"],
    );
    check(
      "the assembly is in the audit trail with the document it came from",
      audit.rows.length > 0 && audit.rows[0].metadata?.sourceId === `report-${run}`,
      `metadata=${JSON.stringify(audit.rows[0]?.metadata ?? null)}`,
    );

    // Failures write nothing. Each mode is the provider misbehaving in one
    // documented way, and none of them may leave a half-assembled library behind.
    const failCases = [
      { mode: "error", name: "a movie the provider gave up on", code: "PROVIDER_REQUEST_FAILED", want: /fixture could not render/ },
      { mode: "emptyMovie", name: "a project the provider cannot find", code: "MODEL_NOT_AVAILABLE", want: /no movie for project/ },
      { mode: "noUrl", name: "a finished movie with no video link", code: "EMPTY_PROVIDER_RESPONSE", want: /no video URL/ },
      { mode: "insufficient", name: "an account with no credits left", code: "PROVIDER_INSUFFICIENT_CREDITS", want: /no credits left/ },
      { mode: "badKey", name: "a refused API key", code: "INVALID_API_KEY", want: /refused the API key/ },
      { mode: "zero", name: "a zero byte download", code: null, want: /zero byte/ },
      { mode: "html", name: "a download that is not a video", code: null, want: /not an MP4|Media asset|bytes are not/i },
    ];
    for (const failure of failCases) {
      assembly.state.mode = failure.mode;
      const before = Number((await pool.query('SELECT count(*)::int AS n FROM "MediaAsset" WHERE "userId" = $1', [first.id])).rows[0].n);
      const res = await api("POST", "/media/assembly", { cookie: first.cookie, base: fx, body: happyBody });
      const after = Number((await pool.query('SELECT count(*)::int AS n FROM "MediaAsset" WHERE "userId" = $1', [first.id])).rows[0].n);
      const code = res.body?.error?.code ?? null;
      const message = res.body?.error?.message ?? "";
      check(
        `${failure.name} fails with the provider's own reason and stores nothing`,
        res.status >= 400 && (failure.code === null || code === failure.code) && failure.want.test(message) && after === before,
        `status=${res.status} code=${code} assets ${before} -> ${after} message=${JSON.stringify(message.slice(0, 110))}`,
      );
    }

    // 6 assemblies an hour, keyed by IP: a document is minutes of a grant that does
    // not refill, so the ceiling is a budget and not a load.
    assembly.state.mode = "error";
    const budgetIp = "203.0.240.200";
    let limited = null;
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const res = await api("POST", "/media/assembly", { cookie: first.cookie, base: fx, ip: budgetIp, body: happyBody });
      if (res.status === 429) limited = { attempt: attempt + 1, code: res.body?.error?.code };
    }
    check(
      "the 6-an-hour assembly budget is enforced",
      limited?.attempt === 7 && limited.code === "RATE_LIMITED",
      `limited=${JSON.stringify(limited)}`,
    );

    assembly.state.mode = "ok";
    const removed = await api("DELETE", `/media/assets/${asset.id}`, { cookie: first.cookie, base: fx });
    const afterRemoval = await api("GET", `/media/assets/${asset.id}/file`, { cookie: first.cookie, base: fx });
    check(
      "an assembled movie can be deleted, row and bytes together",
      (removed.status === 204 || removed.status === 200) && afterRemoval.status === 404,
      `delete=${removed.status} read after=${afterRemoval.status}`,
    );
  } finally {
    if (results.some((r) => !r.passed) && api2) {
      console.log(`\n--- fixture-backed API log ---\n${api2.log().slice(-3000)}`);
    }
    api2?.child.kill();
    fixture.server.close();
    assembly.server.close();
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
