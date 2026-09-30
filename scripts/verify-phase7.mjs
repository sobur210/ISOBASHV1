// Runtime verification for Phase 7: role-based authorization.
// AuthGuard (any session) + RolesGuard (@Roles('ADMIN')) on the admin surface,
// role-aware frontend navigation links.
// Requires the full stack (frontend :3000, backend :3001, PostgreSQL) and a App/DB reachable from DATABASE_URL in .env.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Pool } = require("../node_modules/pg");

const API = process.env.API_URL || "http://localhost:3001";
const WEB = process.env.WEB_URL || "http://localhost:3000";

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

const email = `p7-${randomUUID()}@isobash.dev`;
const password = "secure-pass-123";

console.log("== Phase 7: role-based authorization ==");

const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;

const register = await fetch(`${API}/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password, name: "Phase Seven User" }),
});
const registerBody = await register.json();
const session = cookieFrom(register, "isobash_session");
const user = registerBody.user ?? {};
check("POST /auth/register returns 201 and a session", register.status === 201 && Boolean(session), `status=${register.status}`);
check("user payload includes the role and id", typeof user.id === "number" && (user.role === "ADMIN" || user.role === "USER"), `role=${user.role} id=${user.id}`);

console.log("\n== AuthGuard (authentication required) ==");

const healthNoAuth = await fetch(`${API}/admin/system-health`);
const healthNoAuthBody = await healthNoAuth.json();
check("GET /admin/system-health without a session returns 401 UNAUTHORIZED (AuthGuard)",
  healthNoAuth.status === 401 && healthNoAuthBody.error?.code === "UNAUTHORIZED",
  `status=${healthNoAuth.status} code=${healthNoAuthBody.error?.code}`);

console.log("\n== RolesGuard (role required) ==");

const originalRole = user.role;
let role = originalRole;

const healthAsCurrent = await fetch(`${API}/admin/system-health`, { headers: { cookie: `isobash_session=${session}` } });
const healthBody = await healthAsCurrent.json();
if (role === "ADMIN") {
  const names = (healthBody.components ?? []).map((c) => c.name);
  check("ADMIN role gets 200 with all live components (RolesGuard allows)",
    healthAsCurrent.status === 200 && ["frontend", "backend", "database", "redis", "job-queue", "ollama"].every((n) => names.includes(n)),
    `status=${healthAsCurrent.status} components=${names.join(", ")}`);
} else {
  check("USER role gets 403 FORBIDDEN on the admin endpoint (RolesGuard denies)",
    healthAsCurrent.status === 403 && healthBody.error?.code === "FORBIDDEN",
    `status=${healthAsCurrent.status} code=${healthBody.error?.code}`);
}

console.log("\n== Role-aware frontend navigation ==");

const appAsCurrent = await fetch(`${WEB}/app`, { headers: { cookie: `isobash_session=${session}` } });
const appAsCurrentHtml = await appAsCurrent.text();
if (role === "ADMIN") {
  check("workspace header shows the Admin link for admins", appAsCurrent.status === 200 && /href="\/admin"/.test(appAsCurrentHtml),
    `status=${appAsCurrent.status}`);
} else {
  check("workspace header hides the Admin link from regular users",
    appAsCurrent.status === 200 && !/href="\/admin"/.test(appAsCurrentHtml),
    `status=${appAsCurrent.status}`);
}

console.log("\n== Role change is reflected immediately (entitlement is server-side) ==");

if (pool) {
  const flip = async (nextRole) => {
    await pool.query(`UPDATE "User" SET role = $1 WHERE id = $2`, [nextRole, user.id]);
  };

  await flip(role === "ADMIN" ? "USER" : "ADMIN");
  const flippedMe = await fetch(`${API}/auth/me`, { headers: { cookie: `isobash_session=${session}` } });
  const flippedBody = await flippedMe.json();
  role = flippedBody.user?.role ?? role;
  check("role change via DB is reflected in /auth/me on the next request",
    flippedBody.user?.role === (originalRole === "ADMIN" ? "USER" : "ADMIN"), `role=${flippedBody.user?.role}`);

  const healthFlipped = await fetch(`${API}/admin/system-health`, { headers: { cookie: `isobash_session=${session}` } });
  const healthFlippedBody = await healthFlipped.json();
  if (role === "ADMIN") {
    const names = (healthFlippedBody.components ?? []).map((c) => c.name);
    check("promoted user now gets 200 with all live components",
      healthFlipped.status === 200 && ["frontend", "backend", "database", "redis", "job-queue", "ollama"].every((n) => names.includes(n)),
      `status=${healthFlipped.status}`);
  } else {
    check("demoted user now gets 403 FORBIDDEN", healthFlipped.status === 403 && healthFlippedBody.error?.code === "FORBIDDEN",
      `status=${healthFlipped.status} code=${healthFlippedBody.error?.code}`);
  }

  const appFlipped = await fetch(`${WEB}/app`, { headers: { cookie: `isobash_session=${session}` } });
  const appFlippedHtml = await appFlipped.text();
  if (role === "ADMIN") {
    check("workspace now shows the Admin link", /href="\/admin"/.test(appFlippedHtml));
  } else {
    check("workspace now hides the Admin link", !/href="\/admin"/.test(appFlippedHtml));
  }

  if (role === "ADMIN") {
    const adminFlipped = await fetch(`${WEB}/admin`, { headers: { cookie: `isobash_session=${session}` } });
    const adminFlippedHtml = await adminFlipped.text();
    check("admin session renders /admin with the live system health panel",
      adminFlipped.status === 200 && adminFlippedHtml.includes("System health"),
      `status=${adminFlipped.status}`);
  } else {
    const adminFlipped = await fetch(`${WEB}/admin`, { redirect: "manual", headers: { cookie: `isobash_session=${session}` } });
    check("non-admin /admin redirects to /app", adminFlipped.status === 403 || (adminFlipped.status >= 300 && adminFlipped.status < 400),
      `status=${adminFlipped.status}`);
  }

  await flip(originalRole);
  await pool.end();
  console.log("(test user restored to original role)");
} else {
  console.log("(skipped role round-trip: DATABASE_URL not found in .env)");
}

const logout = await fetch(`${API}/auth/logout`, { method: "POST", headers: { cookie: `isobash_session=${session}` } });
check("logout completes", logout.status === 201, `status=${logout.status}`);

console.log("");
const failed = results.filter((r) => !r.passed);
console.log("== Summary ==");
console.log(`${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);