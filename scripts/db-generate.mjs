// Regenerate the Prisma client while the API is running.
//
// The SYSTEM-owned API on :3001 keeps `node_modules/.prisma/client/query_engine-windows.dll.node`
// open, so a plain `npx prisma generate` dies with EPERM on the rename. The engine binary is
// version-scoped, not schema-scoped, so regenerating the client never needs to rewrite it.
//
// This generates into a scratch directory from a copy of the schema, then copies every
// generated file into place except the engine binary, which stays exactly as it is.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = join(repoRoot, "prisma", "schema.prisma");
const scratchDir = join(repoRoot, "prisma", ".generate-tmp");
const scratchSchema = join(scratchDir, "schema.prisma");
const scratchOutput = join(scratchDir, "output");
const clientDir = join(repoRoot, "node_modules", ".prisma", "client");
// `npx` is a shell shim (npx.cmd on Windows), so the CLI is invoked through node directly.
const prismaCli = join(repoRoot, "node_modules", "prisma", "build", "index.js");
if (!existsSync(prismaCli)) {
  throw new Error(`Cannot find the Prisma CLI at ${prismaCli}.`);
}

/** Files the query engine owns; overwriting them is exactly what fails while the API is live. */
const ENGINE_FILES = new Set([
  "query_engine-windows.dll.node",
  "libquery_engine-darwin.dylib.node",
  "libquery_engine-darwin-arm64.dylib.node",
  "libquery_engine-linux.so.node",
  "libquery_engine-debian-openssl-3.0.x.so.node",
]);

const schema = readFileSync(schemaPath, "utf8");
const patched = schema.replace(
  /(generator\s+client\s*\{[^}]*?provider\s*=\s*"prisma-client-js")/s,
  '$1\n  output   = "output"',
);
if (patched === schema) {
  throw new Error("Could not point the prisma-client-js generator at a scratch output directory.");
}

rmSync(scratchDir, { recursive: true, force: true });
mkdirSync(scratchDir, { recursive: true });
writeFileSync(scratchSchema, patched, "utf8");

try {
  execFileSync(process.execPath, [prismaCli, "generate", "--schema", scratchSchema], { cwd: repoRoot, stdio: "inherit" });

  if (!existsSync(scratchOutput)) {
    throw new Error(`prisma generate did not produce ${scratchOutput}`);
  }
  if (!existsSync(clientDir)) {
    throw new Error(`${clientDir} does not exist. Run a plain \`npx prisma generate\` once with the API stopped.`);
  }

  let copied = 0;
  for (const entry of readdirSync(scratchOutput)) {
    if (ENGINE_FILES.has(entry) || entry.startsWith("query_engine-") || entry.startsWith("libquery_engine-")) {
      continue;
    }
    if (entry.endsWith(".tmp") || entry.includes(".tmp")) continue;
    cpSync(join(scratchOutput, entry), join(clientDir, entry), { recursive: true, force: true });
    copied += 1;
  }

  const engine = readdirSync(clientDir).find((entry) => ENGINE_FILES.has(entry));
  console.log(`Prisma client refreshed: ${copied} generated file(s) copied into node_modules/.prisma/client.`);
  console.log(`Query engine left untouched${engine ? ` (${engine}, ${(statSync(join(clientDir, engine)).size / 1e6).toFixed(1)} MB)` : ""}.`);
} finally {
  rmSync(scratchDir, { recursive: true, force: true });
}
