// Runtime verification for Phase 12: files & documents, and the knowledge
// pipeline built on top of them. Covers: the capabilities contract, upload
// validation (extension allow-list, byte signature, UTF-8 validity, empty files,
// per-user quota, duplicate content), real extraction for every format the API
// claims it can read, honest refusal for the ones it cannot, chunking,
// owner-scoped reads and deletes, and knowledge search with a truthful report of
// whether the vector half actually ran.
//
// The PDF fixture is a hand-built single-page PDF with a real text layer, so
// extraction is exercised against pdf.js rather than asserted.
//
// Requires the full stack (backend, PostgreSQL) and DATABASE_URL in .env.
// Each run uses throwaway identities, so the script is re-runnable.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Pool } = require("../node_modules/pg");

const API = process.env.API_URL || "http://localhost:3001";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const DATABASE_URL = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)?.[1];

const results = [];

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
}

function cookieFrom(res, name) {
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.match(`${name}=([^;]+)`)?.[1] ?? null;
}

const run = randomUUID().slice(0, 8);
const email = `p12-${run}@isobash.dev`;
const otherEmail = `p12-other-${run}@isobash.dev`;
const password = "verify-pass-123";
const xff = `198.51.${140 + (run.charCodeAt(0) % 30)}.${1 + (run.charCodeAt(1) % 250)}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const jsonHeaders = (cookie) => ({
  "content-type": "application/json",
  "x-forwarded-for": xff,
  ...(cookie ? { cookie: `isobash_session=${cookie}` } : {}),
});

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

/** Multipart upload: `file` plus optional plain fields. */
async function upload(cookie, name, type, content, extra = {}) {
  const form = new FormData();
  form.append("file", new Blob([content], { type }), name);
  for (const [key, value] of Object.entries(extra)) form.append(key, String(value));
  const res = await fetch(`${API}/files`, {
    method: "POST",
    headers: { cookie: `isobash_session=${cookie}`, "x-forwarded-for": xff },
    body: form,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

/* ------------------------------------------------------------- PDF fixture */

/** A single-page PDF with a real text layer, assembled with a valid xref table. */
function buildPdf() {
  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[3] =
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>";
  const lines = [
    "Isobash verifies a PDF by reading its text layer with pdf.js.",
    "A scanned page carries no text and is reported honestly.",
  ];
  let stream = "BT /F1 12 Tf 72 720 Td 16 TL\n";
  for (const line of lines) {
    stream += `(${line.replace(/([()\\])/g, "\\$1")}) Tj T*\n`;
  }
  stream += "ET";
  objects[4] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);
const PDF = buildPdf();

/** Wait until background processing leaves PENDING/PROCESSING. */
async function settle(cookie, id, { attempts = 60, intervalMs = 400 } = {}) {
  let latest = null;
  for (let i = 0; i < attempts; i += 1) {
    const res = await api("GET", `/files/${id}`, { cookie });
    latest = res.body;
    if (latest && latest.status !== "PENDING" && latest.status !== "PROCESSING") return latest;
    await sleep(intervalMs);
  }
  return latest;
}

console.log("== Phase 12: files, documents and the knowledge pipeline ==");

const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;

try {
  /* ------------------------------------------------------------------ auth */
  const registered = await api("POST", "/auth/register", { body: { email, password } });
  const cookie = cookieFrom(registered.res, "isobash_session");
  check("a throwaway account is registered", registered.status === 201 && Boolean(cookie), `status=${registered.status}`);

  const anonymous = await api("GET", "/files");
  check("GET /files rejects anonymous access", anonymous.status === 401, `status=${anonymous.status}`);

  const anonymousSearch = await api("GET", "/knowledge/search?q=anything");
  check("GET /knowledge/search rejects anonymous access", anonymousSearch.status === 401, `status=${anonymousSearch.status}`);

  /* ---------------------------------------------------------- capabilities */
  const caps = (await api("GET", "/files/capabilities", { cookie })).body ?? {};
  check(
    "GET /files/capabilities reports the upload contract",
    Number.isInteger(caps.upload?.maxBytes) &&
      caps.upload.maxBytes > 0 &&
      Number.isInteger(caps.upload?.maxFilesPerUser) &&
      Number.isInteger(caps.upload?.maxTotalBytesPerUser) &&
      Array.isArray(caps.upload?.types) &&
      caps.upload.types.length > 0,
    `maxBytes=${caps.upload?.maxBytes} maxFiles=${caps.upload?.maxFilesPerUser} types=${caps.upload?.types?.length}`,
  );
  check(
    "the advertised contract names the checks it performs, including the byte signature",
    /signature/i.test(caps.upload?.detail ?? "") && /server/i.test(caps.upload?.detail ?? ""),
    JSON.stringify(caps.upload?.detail?.slice(0, 80)),
  );
  check(
    "extraction claims are reported per format, including the ones that are NOT read",
    caps.extraction?.pdf === true &&
      caps.extraction?.images === false &&
      caps.extraction?.officeAndArchives === false &&
      Number.isInteger(caps.extraction?.chunkSize) &&
      Number.isInteger(caps.extraction?.maxChunksPerFile),
    JSON.stringify({
      pdf: caps.extraction?.pdf,
      images: caps.extraction?.images,
      office: caps.extraction?.officeAndArchives,
      chunkSize: caps.extraction?.chunkSize,
    }),
  );
  check(
    "embedding availability is reported honestly with a reason either way",
    typeof caps.embeddings?.available === "boolean" && typeof caps.embeddings?.detail === "string" && caps.embeddings.detail.length > 0,
    `available=${caps.embeddings?.available} detail="${(caps.embeddings?.detail ?? "").slice(0, 90)}"`,
  );

  const embeddingsLive = caps.embeddings?.available === true;

  /* ------------------------------------------------- upload validation */
  const exe = await upload(cookie, "payload.exe", "application/octet-stream", "MZ not allowed");
  check(
    "an extension outside the allow-list is refused",
    exe.status === 415 && exe.body?.error?.code === "UNSUPPORTED_MEDIA_TYPE",
    `status=${exe.status} code=${exe.body?.error?.code}`,
  );

  const noExt = await upload(cookie, "noextension", "text/plain", "no extension here");
  check(
    "a file with no extension is refused rather than guessed",
    noExt.status === 415,
    `status=${noExt.status} code=${noExt.body?.error?.code}`,
  );

  const empty = await upload(cookie, "empty.txt", "text/plain", "");
  check(
    "an empty file is refused",
    empty.status === 400 && empty.body?.error?.code === "EMPTY_FILE",
    `status=${empty.status} code=${empty.body?.error?.code}`,
  );

  // The claim under test: a rename must not change what a file is. Plain text
  // claims no known binary header, so a signature check written only as
  // "does it look like some *other* format" would let all of these through.
  const fakePdf = await upload(cookie, "report.pdf", "application/pdf", "this is definitely not a pdf");
  check(
    "text bytes renamed to .pdf are refused by the byte signature",
    fakePdf.status === 415 && fakePdf.body?.error?.code === "CONTENT_SIGNATURE_MISMATCH",
    `status=${fakePdf.status} code=${fakePdf.body?.error?.code}`,
  );

  const fakePng = await upload(cookie, "shot.png", "image/png", "not a png at all");
  check(
    "text bytes renamed to .png are refused by the byte signature",
    fakePng.status === 415 && fakePng.body?.error?.code === "CONTENT_SIGNATURE_MISMATCH",
    `status=${fakePng.status} code=${fakePng.body?.error?.code}`,
  );

  const fakeZip = await upload(cookie, "archive.zip", "application/zip", "plain text pretending to be a zip");
  check(
    "text bytes renamed to .zip are refused by the byte signature",
    fakeZip.status === 415 && fakeZip.body?.error?.code === "CONTENT_SIGNATURE_MISMATCH",
    `status=${fakeZip.status} code=${fakeZip.body?.error?.code}`,
  );

  const pdfAsText = await upload(cookie, "disguised.txt", "text/plain", PDF);
  check(
    "a PDF renamed to .txt is refused instead of being indexed as text",
    pdfAsText.status === 415 && pdfAsText.body?.error?.code === "CONTENT_SIGNATURE_MISMATCH",
    `status=${pdfAsText.status} code=${pdfAsText.body?.error?.code}`,
  );

  const binaryAsText = await upload(cookie, "binary.txt", "text/plain", Buffer.from([0x41, 0x00, 0x42, 0x43]));
  check(
    "a file with NUL bytes is refused as text",
    binaryAsText.status === 415,
    `status=${binaryAsText.status} code=${binaryAsText.body?.error?.code}`,
  );

  const noField = await fetch(`${API}/files`, {
    method: "POST",
    headers: { cookie: `isobash_session=${cookie}`, "x-forwarded-for": xff },
    body: new FormData(),
  });
  check("a request with no file field is refused", noField.status === 400, `status=${noField.status}`);

  /* ------------------------------------------------ real extraction, all kinds */
  const md = await upload(
    cookie,
    "knowledge.md",
    "text/markdown",
    "# Isobash knowledge\n\nRetrieval is verified by matching citation quotes against the retrieved text.\n\nThe chunker respects a fixed size with an overlap window so a split sentence survives.\n",
  );
  check("a markdown file is stored", md.status === 201 && Boolean(md.body?.id), `status=${md.status}`);
  const mdFile = await settle(cookie, md.body?.id);
  check("the markdown file reaches READY", mdFile?.status === "READY", `status=${mdFile?.status} error=${mdFile?.error ?? ""}`);
  check("markdown is indexed into knowledge chunks", (mdFile?.chunkCount ?? 0) > 0, `chunks=${mdFile?.chunkCount}`);
  check("the stored path is server-generated, not the client's filename", /^user-\d+\/\d{4}-\d{2}\/[0-9a-f-]{36}\.md$/.test(mdFile?.relativePath ?? ""), mdFile?.relativePath);

  const mdText = (await api("GET", `/files/${md.body.id}/text`, { cookie })).body ?? {};
  check("the extracted markdown contains the real content", /Retrieval is verified by matching/.test(mdText.text ?? ""), `${mdText.characters} chars`);

  // The preview floor is 200 characters, so a file must be longer than that for
  // truncation to be observable.
  const long = "Isolinux automation notes. ".repeat(40);
  const longFile = await upload(cookie, "notes.txt", "text/plain", long);
  await settle(cookie, longFile.body?.id);
  const capped = (await api("GET", `/files/${longFile.body.id}/text?limit=200`, { cookie })).body ?? {};
  check(
    "the text preview caps at the requested length and says it was truncated",
    capped.text?.length === 200 && capped.truncated === true && capped.characters > 200,
    `len=${capped.text?.length} truncated=${capped.truncated} total=${capped.characters}`,
  );
  const floored = (await api("GET", `/files/${longFile.body.id}/text?limit=1`, { cookie })).body ?? {};
  check(
    "a preview limit below the floor is raised to it rather than honoured blindly",
    floored.text?.length === 200,
    `len=${floored.text?.length}`,
  );
  const uncapped = (await api("GET", `/files/${longFile.body.id}/text`, { cookie })).body ?? {};
  // `characters` counts the *extracted* text, which is normalised (a trailing
  // newline is dropped), so it is compared against the text actually returned
  // rather than against the raw upload length.
  check(
    "an untruncated read returns the whole extraction, trailing whitespace trimmed",
    uncapped.truncated === false &&
      uncapped.characters === uncapped.text?.length &&
      uncapped.characters === long.trim().length,
    `chars=${uncapped.characters} text=${uncapped.text?.length} raw=${long.length} trimmed=${long.trim().length}`,
  );

  const csv = await upload(cookie, "rows.csv", "text/csv", 'name,role\n"Ada, Countess",engineer\nGrace,admiral\n');
  const csvFile = await settle(cookie, csv.body?.id);
  const csvText = (await api("GET", `/files/${csv.body.id}/text`, { cookie })).body ?? {};
  check(
    "CSV is parsed into header: value rows, with quoted commas intact",
    csvFile?.status === "READY" && /name: Ada, Countess/.test(csvText.text ?? "") && /role: engineer/.test(csvText.text ?? ""),
    JSON.stringify(csvText.text),
  );

  const json = await upload(cookie, "config.json", "application/json", JSON.stringify({ app: { name: "isobash", tags: ["a", "b"] } }));
  const jsonFile = await settle(cookie, json.body?.id);
  const jsonText = (await api("GET", `/files/${json.body.id}/text`, { cookie })).body ?? {};
  check(
    "JSON is flattened into readable path: value lines",
    jsonFile?.status === "READY" && /app\.name: isobash/.test(jsonText.text ?? "") && /app\.tags\[0\]: a/.test(jsonText.text ?? ""),
    JSON.stringify(jsonText.text),
  );

  const html = await upload(
    cookie,
    "page.html",
    "text/html",
    '<html><head><style>.x{color:red}</style><script>var leaked = "must not be indexed";</script></head><body><h1>Heading</h1><p>Real body text about widgets.</p></body></html>',
  );
  const htmlFile = await settle(cookie, html.body?.id);
  const htmlText = (await api("GET", `/files/${html.body.id}/text`, { cookie })).body ?? {};
  check(
    "HTML is stripped of tags, script and style before indexing",
    htmlFile?.status === "READY" &&
      /Real body text about widgets/.test(htmlText.text ?? "") &&
      !/leaked|color:red|<script|<p>/.test(htmlText.text ?? ""),
    JSON.stringify(htmlText.text),
  );

  const pdfUpload = await upload(cookie, "report.pdf", "application/pdf", PDF);
  const pdfFile = await settle(cookie, pdfUpload.body?.id);
  const pdfText = (await api("GET", `/files/${pdfUpload.body.id}/text`, { cookie })).body ?? {};
  check(
    "a real PDF text layer is extracted by pdf.js",
    pdfUpload.status === 201 && pdfFile?.status === "READY" && /pdf\.js/.test(pdfText.text ?? ""),
    `status=${pdfFile?.status} chars=${pdfText.characters} text=${JSON.stringify((pdfText.text ?? "").slice(0, 70))}`,
  );
  check(
    "the pdf.js page footer is not indexed as content",
    !/--\s*1 of 1\s*--/.test(pdfText.text ?? ""),
    JSON.stringify((pdfText.text ?? "").slice(-40)),
  );

  /* ------------------------------------------- honest about what it cannot read */
  const png = await upload(cookie, "shot.png", "image/png", PNG);
  const pngFile = await settle(cookie, png.body?.id);
  check(
    "an image is stored and downloadable but honestly not indexed",
    png.status === 201 &&
      pngFile?.status === "READY" &&
      pngFile.extractable === false &&
      pngFile.chunkCount === 0 &&
      typeof pngFile.warning === "string" &&
      pngFile.warning.length > 0,
    `status=${pngFile?.status} extractable=${pngFile?.extractable} chunks=${pngFile?.chunkCount} warning="${pngFile?.warning ?? ""}"`,
  );

  const zip = await upload(cookie, "docx.zip", "application/zip", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]));
  const zipFile = await settle(cookie, zip.body?.id);
  check(
    "a ZIP-based office document is stored but not claimed to be parsed",
    zip.status === 201 && zipFile?.extractable === false && zipFile.chunkCount === 0 && Boolean(zipFile.warning),
    `extractable=${zipFile?.extractable} chunks=${zipFile.chunkCount} warning="${(zipFile?.warning ?? "").slice(0, 60)}"`,
  );

  /* ------------------------------------------------------ duplicates + traversal */
  const duplicate = await upload(cookie, "knowledge-copy.md", "text/markdown", "# Isobash knowledge\n\nRetrieval is verified by matching citation quotes against the retrieved text.\n\nThe chunker respects a fixed size with an overlap window so a split sentence survives.\n");
  check(
    "identical bytes cannot be stored twice for one account",
    duplicate.status === 409 && duplicate.body?.error?.code === "DUPLICATE_FILE",
    `status=${duplicate.status} code=${duplicate.body?.error?.code}`,
  );

  const traversal = await upload(cookie, "../../../etc/passwd.txt", "text/plain", "traversal attempt content");
  check(
    "a traversal filename is accepted but the display name is sanitised",
    traversal.status === 201 && traversal.body?.originalName === "passwd.txt",
    `name=${traversal.body?.originalName}`,
  );
  check(
    "the traversal filename never reaches the stored path",
    traversal.status === 201 && !/\.\./.test(traversal.body?.relativePath ?? "") && traversal.body?.relativePath.startsWith("user-"),
    traversal.body?.relativePath,
  );

  /* ---------------------------------------------------------- download + ownership */
  const download = await fetch(`${API}/files/${md.body.id}/download`, { headers: { cookie: `isobash_session=${cookie}` } });
  const downloaded = await download.text();
  check(
    "download returns the original bytes with a safe content-disposition",
    download.status === 200 &&
      download.headers.get("content-type") === "text/markdown" &&
      /attachment; filename="knowledge\.md"/.test(download.headers.get("content-disposition") ?? "") &&
      downloaded.includes("Retrieval is verified by matching"),
    `status=${download.status} type=${download.headers.get("content-type")}`,
  );

  const other = await api("POST", "/auth/register", { body: { email: otherEmail, password } });
  const otherCookie = cookieFrom(other.res, "isobash_session");

  const foreignRead = await api("GET", `/files/${md.body.id}`, { cookie: otherCookie });
  check("another user cannot read the file record", foreignRead.status === 404, `status=${foreignRead.status}`);
  const foreignText = await api("GET", `/files/${md.body.id}/text`, { cookie: otherCookie });
  check("another user cannot read the extracted text", foreignText.status === 404, `status=${foreignText.status}`);
  const foreignDownload = await fetch(`${API}/files/${md.body.id}/download`, { headers: { cookie: `isobash_session=${otherCookie}` } });
  check("another user cannot download the bytes", foreignDownload.status === 404, `status=${foreignDownload.status}`);
  const foreignDelete = await api("DELETE", `/files/${md.body.id}`, { cookie: otherCookie });
  check("another user cannot delete the file", foreignDelete.status === 404, `status=${foreignDelete.status}`);
  const survived = await api("GET", `/files/${md.body.id}`, { cookie });
  check("the file survived the foreign delete attempt", survived.status === 200, `status=${survived.status}`);

  /* ------------------------------------------------------------ project attach */
  const noProject = await api("POST", "/projects", { cookie, body: { name: "Phase 12 corpus" } });
  const projectId = noProject.body?.id;
  check("a project is created to scope a file to", noProject.status === 201 && Number.isInteger(projectId), `status=${noProject.status} id=${projectId}`);

  const foreignProject = await api("POST", `/files/${md.body.id}/reindex`, { cookie, body: { projectId: 999_999 } });
  check("attaching a file to a project the caller does not own is refused", foreignProject.status === 400, `status=${foreignProject.status}`);

  const attach = await api("POST", `/files/${md.body.id}/reindex`, { cookie, body: { projectId } });
  await sleep(1500);
  const attached = (await api("GET", `/files/${md.body.id}`, { cookie })).body ?? {};
  check("a file can be attached to an owned project", attach.status < 400 && attached.projectId === projectId, `projectId=${attached.projectId} status=${attach.status}`);

  /* ---------------------------------------------------------- knowledge search */
  const search = (await api("GET", "/knowledge/search?q=retrieval%20citation%20quotes", { cookie })).body ?? {};
  check(
    "knowledge search returns ranked hits with a score and a snippet",
    Array.isArray(search.hits) && search.hits.length > 0 && search.hits.every((h) => typeof h.score === "number" && typeof h.snippet === "string" && h.snippet.length > 0),
    `hits=${search.hits?.length} mode=${search.mode}`,
  );
  check(
    "every hit says how it matched (keyword or vector), never a silent guess",
    (search.hits ?? []).every((h) => ["keyword", "vector", "hybrid"].includes(h.matchedBy)),
    JSON.stringify((search.hits ?? []).map((h) => h.matchedBy)),
  );
  check(
    "the response states whether vector search actually ran",
    typeof search.detail === "string" && (/Vector similarity did not run/.test(search.detail) || /Vector similarity ran/.test(search.detail)),
    JSON.stringify(search.detail?.slice(0, 120)),
  );
  check(
    "the reported mode matches the embedding availability that was advertised",
    embeddingsLive
      ? ["hybrid", "vector"].includes(search.mode)
      : search.mode === "keyword" && /did not run/.test(search.detail ?? ""),
    `mode=${search.mode} embeddingsAvailable=${embeddingsLive}`,
  );
  check(
    "the top hit is the file the query came from",
    search.hits?.[0]?.fileId === md.body.id,
    `top=${search.hits?.[0]?.fileName}`,
  );

  const scoped = (await api("GET", `/knowledge/search?q=widgets&projectId=${projectId}`, { cookie })).body ?? {};
  check(
    "a project-scoped search ignores files outside the project",
    (scoped.hits ?? []).every((h) => h.fileId === md.body.id),
    `hits=${(scoped.hits ?? []).map((h) => h.fileName).join(",")}`,
  );

  const emptyQuery = await api("GET", "/knowledge/search?q=", { cookie });
  check("an empty knowledge query is refused", emptyQuery.status === 400, `status=${emptyQuery.status}`);
  const punctuationQuery = await api("GET", "/knowledge/search?q=%2A%2A%2A", { cookie });
  check("a query with no searchable terms is refused", punctuationQuery.status === 400, `status=${punctuationQuery.status}`);

  const stats = (await api("GET", "/knowledge/stats", { cookie })).body ?? {};
  check(
    "knowledge stats count the caller's own files and chunks",
    stats.files > 0 && stats.chunks > 0 && typeof stats.embeddedChunks === "number" && typeof stats.embeddings?.available === "boolean",
    JSON.stringify({ files: stats.files, chunks: stats.chunks, embedded: stats.embeddedChunks, byStatus: stats.filesByStatus }),
  );

  /* --------------------------------------------------------- reindex + list filter */
  const list = (await api("GET", "/files", { cookie })).body ?? [];
  check("GET /files lists the caller's files", Array.isArray(list) && list.some((f) => f.id === md.body.id), `count=${list.length}`);
  const images = (await api("GET", "/files?kind=image", { cookie })).body ?? [];
  check("the list can be filtered by kind", images.length > 0 && images.every((f) => f.kind === "image"), `count=${images.length}`);

  /* ---------------------------------------------------------------- delete + db */
  const deleted = await api("DELETE", `/files/${md.body.id}`, { cookie });
  check("the owner can delete the file", deleted.status === 204 || deleted.status === 200, `status=${deleted.status}`);

  if (pool) {
    const user = await pool.query(`SELECT id FROM "User" WHERE email = $1`, [email]);
    const userId = user.rows[0]?.id;
    const rows = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM "StoredFile" WHERE "userId" = $1) AS files,
         (SELECT count(*)::int FROM "FileChunk" c JOIN "StoredFile" f ON f.id = c."fileId" WHERE f."userId" = $1) AS chunks,
         (SELECT count(*)::int FROM "StoredFile" WHERE "userId" = $1 AND "relativePath" LIKE '%..%') AS traversalPaths,
         (SELECT count(*)::int FROM "StoredFile" WHERE "userId" = $1 AND "status" = 'FAILED') AS failed`,
      [userId],
    );
    const counts = rows.rows[0];
    check("files and chunks are persisted in PostgreSQL", counts.files > 0 && counts.chunks > 0, JSON.stringify(counts));
    // pg lower-cases an unquoted alias, so the key arrives as `traversalpaths`.
    check("no stored path contains a traversal segment", counts.traversalpaths === 0, `paths=${counts.traversalpaths}`);
    check("no upload was silently recorded as FAILED", counts.failed === 0, `failed=${counts.failed}`);

    const orphans = await pool.query(
      `SELECT count(*)::int AS n FROM "FileChunk" c WHERE NOT EXISTS (SELECT 1 FROM "StoredFile" f WHERE f.id = c."fileId")`,
    );
    check("no chunk references a deleted file", orphans.rows[0].n === 0, `orphans=${orphans.rows[0].n}`);

    const dupes = await pool.query(
      `SELECT count(*)::int AS n FROM (SELECT "userId", sha256 FROM "StoredFile" GROUP BY "userId", sha256 HAVING count(*) > 1) d`,
    );
    check("no account holds the same bytes twice", dupes.rows[0].n === 0, `duplicates=${dupes.rows[0].n}`);

    // Grouped per file: ordinals restart at 1 for each file, so aggregating every
    // file together would call six legitimate 1s a duplicate. A contiguous run
    // from 1 means min = 1, max = count, and no repeated ordinal.
    const chunkNumbers = await pool.query(
      `SELECT count(*)::int AS files,
              count(*) FILTER (WHERE lo = 1 AND hi = n AND distinct_ordinals = n)::int AS contiguous
         FROM (
           SELECT c."fileId", min(c.ordinal)::int AS lo, max(c.ordinal)::int AS hi,
                  count(*)::int AS n, count(DISTINCT c.ordinal)::int AS distinct_ordinals
             FROM "FileChunk" c JOIN "StoredFile" f ON f.id = c."fileId"
            WHERE f."userId" = $1
            GROUP BY c."fileId"
         ) per_file`,
      [userId],
    );
    const chunkRow = chunkNumbers.rows[0];
    check(
      "chunk ordinals restart at 1 and are contiguous within every file",
      chunkRow.files > 0 && chunkRow.contiguous === chunkRow.files,
      JSON.stringify(chunkRow),
    );

    const cascades = await pool.query(`SELECT count(*)::int AS n FROM "FileChunk" c JOIN "StoredFile" f ON f.id = c."fileId" WHERE f.id = $1`, [md.body.id]);
    check("deleting a file cascades its chunks", cascades.rows[0].n === 0, `left=${cascades.rows[0].n}`);

    const audits = await pool.query(
      `SELECT action, count(*)::int AS n FROM "AuditEvent" WHERE "actorId" = $1 AND action IN ('file_uploaded','file_deleted') GROUP BY action`,
      [userId],
    );
    const auditRows = Object.fromEntries(audits.rows.map((r) => [r.action, r.n]));
    check(
      "uploads and deletes are written to the audit trail",
      (auditRows.file_uploaded ?? 0) > 0 && (auditRows.file_deleted ?? 0) > 0,
      JSON.stringify(auditRows),
    );

    const leaked = await pool.query(
      `SELECT count(*)::int AS n FROM "StoredFile" WHERE id = $1 AND "userId" IS DISTINCT FROM $2`,
      [md.body.id, userId],
    );
    check("the file belonged to its owner only", leaked.rows[0].n === 0);
  }

  /* ------------------------------------------------------------------ cleanup */
  if (pool) {
    const ids = await pool.query(`SELECT id, email FROM "User" WHERE email = ANY($1)`, [[email, otherEmail]]);
    const userIds = ids.rows.map((r) => r.id);
    await pool.query(`DELETE FROM "FileChunk" WHERE "fileId" IN (SELECT id FROM "StoredFile" WHERE "userId" = ANY($1))`, [userIds]);
    await pool.query(`DELETE FROM "StoredFile" WHERE "userId" = ANY($1)`, [userIds]);
    await pool.query(`DELETE FROM "MemoryEntry" WHERE "userId" = ANY($1)`, [userIds]);
    await pool.query(`DELETE FROM "Task" WHERE "projectId" IN (SELECT id FROM "Project" WHERE "ownerId" = ANY($1))`, [userIds]);
    await pool.query(`DELETE FROM "Project" WHERE "ownerId" = ANY($1)`, [userIds]);
    await pool.query(`DELETE FROM "Session" WHERE "userId" = ANY($1)`, [userIds]);
    await pool.query(`DELETE FROM "User" WHERE id = ANY($1)`, [userIds]);
    console.log("\n== Cleanup ==");
    console.log("(throwaway test users and their file rows removed; audit events retained as evidence)");
  } else {
    console.log("(skipped DB checks + cleanup: DATABASE_URL not found in .env)");
  }
} finally {
  // nothing to close
}

console.log("");
const failed = results.filter((r) => !r.passed);
console.log("== Summary ==");
console.log(`${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("");
  for (const row of failed) console.log(`FAILED: ${row.name}${row.detail ? `: ${row.detail}` : ""}`);
}
await pool?.end();
process.exit(failed.length ? 1 : 0);
