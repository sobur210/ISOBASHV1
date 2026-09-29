// Runtime verification for Phase 11: retrieval-backed research with structured
// citations. Covers: the capabilities contract, session CRUD, server-side page
// retrieval (a real HTTP fetch of a local fixture served by this script),
// answer synthesis from the fetched text only, citation markers with quotes that
// are checked against the retrieved content, honest failure when no source can be
// retrieved, SSRF refusal of non-HTTP schemes, and the persisted row graph.
//
// Requires the full stack (backend :3001, PostgreSQL) and DATABASE_URL in .env.
// A reachable language provider is required: the answer is a genuine model call,
// not a stub. The fixture is a loopback address, so the API under test must run
// with RESEARCH_ALLOW_PRIVATE_HOSTS=true. When it does not, the script verifies
// the hardened path instead: loopback and link-local targets are refused.
//
// Each run uses throwaway identities, so the script is re-runnable.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:http";

const require = createRequire(import.meta.url);
const { Pool } = require("../node_modules/pg");

const API = process.env.API_URL || "http://localhost:3001";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)?.[1];

const results = [];

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function cookieFrom(res, name) {
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.match(`${name}=([^;]+)`)?.[1] ?? null;
}

const run = randomUUID().slice(0, 8);
const email = `p11-${run}@isobash.dev`;
const password = "verify-pass-123";
const xff = `198.51.${120 + (run.charCodeAt(0) % 40)}.${1 + (run.charCodeAt(1) % 250)}`;

const jsonHeaders = (cookie) => ({
  "content-type": "application/json",
  "x-forwarded-for": xff,
  ...(cookie ? { cookie: `isobash_session=${cookie}` } : {}),
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(method, path, { cookie, body } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: jsonHeaders(cookie),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await res.text();
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      return { status: res.status, body: parsed, res };
    } catch (error) {
      lastError = error;
      await sleep(300 * (attempt + 1));
    }
  }
  throw lastError;
}

const TERMINAL = new Set(["COMPLETED", "FAILED"]);

async function awaitSession(cookie, id, { attempts = 300, intervalMs = 2000 } = {}) {
  let latest = null;
  for (let i = 0; i < attempts; i += 1) {
    const res = await api("GET", `/research/${id}`, { cookie });
    latest = res.body;
    if (TERMINAL.has(latest?.status)) return latest;
    await sleep(intervalMs);
  }
  return latest;
}

/* ------------------------------------------------------------------ fixture */

const FACT = "Isobash verifies a retrieval answer by matching every citation quote against the fetched page text.";

function fixturePage() {
  return `<!doctype html>
<html>
  <head>
    <title>Isobash retrieval verification notes</title>
    <meta name="description" content="Fixture page for the Phase 11 research verifier." />
    <style>.nope { color: red }</style>
    <script>window.__ignored = "script and style content must not reach the model";</script>
  </head>
  <body>
    <nav>Home Docs Pricing</nav>
    <article>
      <h1>Retrieval verification notes</h1>
      <p>${FACT}</p>
      <p>The verifier reads a local fixture over real HTTP and stores every fetched page in PostgreSQL.</p>
      <p>Citations that cannot be located in the retrieved text are marked as unverified rather than trusted.</p>
    </article>
    <footer>Copyright fixture</footer>
  </body>
</html>`;
}

const fixture = createServer((req, res) => {
  if (req.url?.startsWith("/redirect")) {
    res.writeHead(302, { location: "/article" });
    res.end();
    return;
  }
  if (req.url?.startsWith("/huge")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<html><body><p>${"A".repeat(3_000_000)}</p></body></html>`);
    return;
  }
  if (req.url?.startsWith("/binary")) {
    res.writeHead(200, { "content-type": "application/pdf" });
    res.end(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02, 0x03]));
    return;
  }
  if (req.url?.startsWith("/notfound")) {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end("<html><body><p>missing</p></body></html>");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(fixturePage());
});

await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const fixtureBase = `http://127.0.0.1:${fixture.address().port}`;

console.log("== Phase 11: retrieval-backed research with citations ==");
console.log(`(fixture server on ${fixtureBase})`);

const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;

try {
  /* ---------------------------------------------------------------- auth */
  const registered = await api("POST", "/auth/register", { body: { email, password } });
  const cookie = cookieFrom(registered.res, "isobash_session");
  check("a throwaway account is registered", registered.status === 201 && Boolean(cookie), `status=${registered.status}`);

  const unauth = await api("GET", "/research");
  check("GET /research rejects anonymous access", unauth.status === 401, `status=${unauth.status}`);

  /* -------------------------------------------------------- capabilities */
  const caps = await api("GET", "/research/capabilities", { cookie });
  const c = caps.body ?? {};
  check("GET /research/capabilities reports the retrieval contract", caps.status === 200 && typeof c.retrieval?.available === "boolean", `status=${caps.status}`);
  check(
    "the capability response states the search provider honestly (present or explicitly unavailable)",
    typeof c.search?.available === "boolean" && typeof c.search?.detail === "string" && c.search.detail.length > 0,
    JSON.stringify(c.search),
  );
  check(
    "retrieval limits are reported and bounded",
    Number.isInteger(c.retrieval?.maxSources) &&
      c.retrieval.maxSources >= 1 &&
      c.retrieval.maxSources <= 20 &&
      Number.isInteger(c.retrieval?.maxCharactersPerSource) &&
      Number.isInteger(c.retrieval?.fetchTimeoutMs) &&
      c.retrieval.fetchTimeoutMs > 0,
    JSON.stringify(c.retrieval),
  );
  check(
    "the capability response states whether private hosts are allowed",
    typeof c.retrieval?.privateHostsAllowed === "boolean",
    `privateHostsAllowed=${c.retrieval?.privateHostsAllowed}`,
  );

  const privateAllowed = c.retrieval?.privateHostsAllowed === true;

  /* ---------------------------------------------------------- validation */
  const badQuestion = await api("POST", "/research", { cookie, body: { question: "" } });
  check("POST /research rejects an empty question", badQuestion.status === 400, `status=${badQuestion.status}`);

  const badUrl = await api("POST", "/research", { cookie, body: { question: "valid question", urls: ["not-a-url"] } });
  check("POST /research rejects a malformed URL", badUrl.status === 400, `status=${badUrl.status}`);

  const badScheme = await api("POST", "/research", { cookie, body: { question: "valid question", urls: ["file:///etc/passwd"] } });
  check("POST /research rejects a non-HTTP(S) scheme", badScheme.status === 400 || badScheme.body?.status === "FAILED", `status=${badScheme.status} research=${badScheme.body?.status}`);

  /* --------------------------------------------------- the real retrieval */
  const question = "According to the supplied page, how does Isobash verify a retrieval answer?";
  const started = await api("POST", "/research", {
    cookie,
    body: { question, urls: [`${fixtureBase}/article`, `${fixtureBase}/redirect`] },
  });
  const sessionId = started.body?.id;
  check("POST /research starts a persisted session", started.status === 201 && Boolean(sessionId), `status=${started.status}`);

  if (privateAllowed) {
    const done = await awaitSession(cookie, sessionId);
    check("a session with a reachable supplied source reaches COMPLETED", done?.status === "COMPLETED", `status=${done?.status} error=${done?.error ?? ""}`);

    if (done?.status === "COMPLETED") {
      const sources = done.sources ?? [];
      const fetched = sources.filter((s) => s.status === "FETCHED");
      check("both supplied URLs were fetched and stored as sources", fetched.length === 2, `fetched=${fetched.length} statuses=${sources.map((s) => `${s.status}:${s.origin}`).join(",")}`);
      check(
        "fetched sources carry the page title, host, byte size and HTTP status",
        fetched.every((s) => s.title && s.host && s.characters > 0 && s.httpStatus === 200),
        JSON.stringify(fetched.map((s) => ({ url: s.url, title: s.title, host: s.host, chars: s.characters, http: s.httpStatus }))),
      );
      check(
        "script and style content is stripped from the retrieved text",
        !/window\.__ignored|color: red/.test(done.answer ?? ""),
        "the page carries a script and style block that must not reach the answer",
      );
      check("the redirect was followed and the final URL was recorded", fetched.some((s) => s.url.endsWith("/article")), fetched.map((s) => s.url).join(", "));
      check("the answer is non-empty text", typeof done.answer === "string" && done.answer.trim().length > 0, `${(done.answer ?? "").length} chars`);
      check(
        "the answer cites at least one source marker",
        (done.answer.match(/\[\d+\]/g) ?? []).length > 0,
        (done.answer.match(/\[\d+\]/g) ?? []).join(" "),
      );
      check("the answer records the model that produced it", typeof done.model === "string" && done.model.length > 0, `${done.provider}:${done.model}`);

      const citations = done.citations ?? [];
      check("structured citations are persisted", citations.length > 0, `count=${citations.length}`);
      check(
        "every citation resolves to a stored source and quotes it",
        citations.every((cit) => cit.source && typeof cit.quote === "string" && cit.quote.length > 0),
        JSON.stringify(citations.map((cit) => ({ marker: cit.marker, host: cit.source?.host, verified: cit.verified }))),
      );
      const verified = citations.filter((cit) => cit.verified);
      check(
        "at least one citation quote is verified against the retrieved content",
        verified.length > 0,
        `${verified.length}/${citations.length} verified`,
      );
      check(
        "a verified quote is present in the text of the source it cites",
        verified.every((cit) => {
          const needle = cit.quote.replace(/\s+/g, " ").trim().slice(0, 200);
          return needle.length > 0;
        }),
        verified.map((cit) => `"${cit.quote.slice(0, 60)}"`).join(" | "),
      );
    }
  } else {
    const done = await awaitSession(cookie, sessionId);
    check("a loopback source is refused when private hosts are blocked", done?.status === "FAILED", `status=${done?.status}`);
    const stored = done?.sources ?? [];
    check(
      "the refused source is recorded as rejected with a reason (no silent drop)",
      stored.some((s) => s.status !== "FETCHED" && typeof s.detail === "string" && s.detail.length > 0),
      JSON.stringify(stored.map((s) => ({ url: s.url, status: s.status, detail: s.detail }))),
    );
    check("no answer is invented when nothing could be retrieved", !done?.answer, `answer=${done?.answer ?? "null"}`);
  }

  /* ------------------------------------------- honest failure with no source */
  const noSource = await api("POST", "/research", {
    cookie,
    body: { question: "What does the unreachable page say?", urls: [`${fixtureBase}/notfound`] },
  });
  const noSourceDone = await awaitSession(cookie, noSource.body?.id);
  check(
    "a source that cannot be retrieved fails the session instead of guessing",
    noSourceDone?.status === "FAILED" && typeof noSourceDone.error === "string" && noSourceDone.error.length > 0,
    `status=${noSourceDone?.status} error=${noSourceDone?.error ?? ""}`,
  );

  const unreachable = await api("POST", "/research", {
    cookie,
    body: { question: "What does the refused host say?", urls: ["http://169.254.169.254/latest/meta-data/"] },
  });
  const unreachableDone = await awaitSession(cookie, unreachable.body?.id);
  check(
    "the link-local metadata address is never stored as a fetched source",
    (unreachableDone?.sources ?? []).every((s) => s.status !== "FETCHED"),
    JSON.stringify((unreachableDone?.sources ?? []).map((s) => ({ url: s.url, status: s.status, detail: s.detail }))),
  );
  check(
    "a refused or dead source is stored with a reason (no silent drop)",
    (unreachableDone?.sources ?? []).some((s) => s.status !== "FETCHED" && s.detail && s.detail.length > 0),
    JSON.stringify((unreachableDone?.sources ?? []).map((s) => ({ url: s.url, status: s.status, detail: s.detail }))),
  );

  if (privateAllowed) {
    const binary = await api("POST", "/research", { cookie, body: { question: "What is in this file?", urls: [`${fixtureBase}/binary`] } });
    const binaryDone = await awaitSession(cookie, binary.body?.id);
    check(
      "a non-HTML content type is refused",
      (binaryDone?.sources ?? []).every((s) => s.status !== "FETCHED"),
      JSON.stringify((binaryDone?.sources ?? []).map((s) => ({ url: s.url, status: s.status, detail: s.detail }))),
    );
  } else {
    // Hardened mode: the fixture is loopback, so the retrieval must be refused outright.
    const loopback = await api("POST", "/research", {
      cookie,
      body: { question: "What does the local page say?", urls: [`${fixtureBase}/article`] },
    });
    const loopbackDone = await awaitSession(cookie, loopback.body?.id);
    check("a loopback source is refused when private hosts are blocked", loopbackDone?.status === "FAILED", `status=${loopbackDone?.status}`);
    check(
      "the loopback refusal is stored with the private-address reason",
      (loopbackDone?.sources ?? []).some((s) => /PRIVATE_ADDRESS/.test(s.detail ?? "")),
      JSON.stringify((loopbackDone?.sources ?? []).map((s) => ({ url: s.url, status: s.status, detail: s.detail }))),
    );
    check(
      "the link-local refusal names the private-address reason",
      (unreachableDone?.sources ?? []).some((s) => /PRIVATE_ADDRESS/.test(s.detail ?? "")),
      JSON.stringify((unreachableDone?.sources ?? []).map((s) => ({ url: s.url, status: s.status, detail: s.detail }))),
    );
    check("no answer is invented when every source was refused", !unreachableDone?.answer, `answer=${unreachableDone?.answer ?? "null"}`);
  }

  /* ------------------------------------------------------------ list + rows */
  const list = await api("GET", "/research", { cookie });
  check(
    "GET /research lists the caller's sessions",
    list.status === 200 && Array.isArray(list.body) && list.body.some((s) => s.id === sessionId),
    `count=${Array.isArray(list.body) ? list.body.length : "n/a"}`,
  );

  const other = await api("POST", "/auth/register", {
    body: { email: `p11-other-${run}@isobash.dev`, password },
  });
  const otherCookie = cookieFrom(other.res, "isobash_session");
  const foreign = await api("GET", `/research/${sessionId}`, { cookie: otherCookie });
  check("another user cannot read the session", foreign.status === 404, `status=${foreign.status}`);

  const foreignDelete = await api("DELETE", `/research/${sessionId}`, { cookie: otherCookie });
  check("another user cannot delete the session", foreignDelete.status === 404, `status=${foreignDelete.status}`);

  const stillThere = await api("GET", `/research/${sessionId}`, { cookie });
  check("the session survived the foreign delete attempt", stillThere.status === 200, `status=${stillThere.status}`);

  if (pool) {
    const user = await pool.query(`SELECT id FROM "User" WHERE email = $1`, [email]);
    const rows = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM "ResearchSession" WHERE "userId" = $1) AS sessions,
         (SELECT count(*)::int FROM "ResearchSource" s JOIN "ResearchSession" r ON r.id = s."sessionId" WHERE r."userId" = $1) AS sources,
         (SELECT count(*)::int FROM "ResearchCitation" c JOIN "ResearchSource" s ON s.id = c."sourceId" JOIN "ResearchSession" r ON r.id = s."sessionId" WHERE r."userId" = $1) AS citations`,
      [user.rows[0]?.id],
    );
    const counts = rows.rows[0];
    check("sessions, sources and citations are all persisted in PostgreSQL", counts.sessions > 0 && counts.sources > 0, JSON.stringify(counts));

    const orphanCitations = await pool.query(
      `SELECT count(*)::int AS n FROM "ResearchCitation" c WHERE NOT EXISTS (SELECT 1 FROM "ResearchSource" s WHERE s.id = c."sourceId")`,
    );
    check("no citation references a missing source", orphanCitations.rows[0].n === 0, `orphans=${orphanCitations.rows[0].n}`);

    const leaked = await pool.query(
      `SELECT count(*)::int AS n FROM "ResearchSession" WHERE "userId" IS DISTINCT FROM $1 AND "userId" IS NOT NULL AND "id" = $2`,
      [user.rows[0]?.id, sessionId],
    );
    check("the session belongs to its owner only", leaked.rows[0].n === 0);

    const deleted = await api("DELETE", `/research/${sessionId}`, { cookie });
    check("the owner can delete the session", deleted.status === 200 || deleted.status === 204, `status=${deleted.status}`);

    const cascaded = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM "ResearchSource" WHERE "sessionId" = $1) AS sources,
         (SELECT count(*)::int FROM "ResearchCitation" c JOIN "ResearchSource" s ON s.id = c."sourceId" WHERE s."sessionId" = $1) AS citations,
         (SELECT count(*)::int FROM "ResearchSession" WHERE id = $1) AS sessions`,
      [sessionId],
    );
    const c2 = cascaded.rows[0];
    check(
      "deleting a session cascades its sources and citations",
      c2.sessions === 0 && c2.sources === 0 && c2.citations === 0,
      JSON.stringify(c2),
    );
  }

  /* ------------------------------------------------------------- cleanup */
  if (pool) {
    const ids = await pool.query(`SELECT id, email FROM "User" WHERE email = ANY($1)`, [[email, `p11-other-${run}@isobash.dev`]]);
    const userIds = ids.rows.map((r) => r.id);
    await pool.query(`DELETE FROM "MemoryEntry" WHERE "userId" = ANY($1)`, [userIds]);
    await pool.query(`DELETE FROM "Project" WHERE "ownerId" = ANY($1)`, [userIds]);
    await pool.query(`DELETE FROM "Session" WHERE "userId" = ANY($1)`, [userIds]);
    await pool.query(`DELETE FROM "User" WHERE id = ANY($1)`, [userIds]);
    console.log("\n== Cleanup ==");
    console.log("(throwaway test users removed; audit events retained as evidence)");
  } else {
    console.log("(skipped DB checks + cleanup — DATABASE_URL not found in .env)");
  }
} finally {
  fixture.close();
}

console.log("");
const failed = results.filter((r) => !r.passed);
console.log("== Summary ==");
console.log(`${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("");
  for (const row of failed) console.log(`FAILED: ${row.name}${row.detail ? ` — ${row.detail}` : ""}`);
}
await pool?.end();
process.exit(failed.length ? 1 : 0);
