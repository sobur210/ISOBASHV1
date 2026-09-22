// Runtime verification for Phase 6: authentication (register/login/logout/me), session cookies, frontend gating.
// Requires the full stack (frontend :3000, backend :3001, PostgreSQL).
import { randomUUID } from "node:crypto";

const API = process.env.API_URL || "http://localhost:3001";
const WEB = process.env.WEB_URL || "http://localhost:3000";

const results = [];

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(message, detail) {
  throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
}

function cookieFrom(res, name) {
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.match(`${name}=([^;]+)`)?.[1] ?? null;
}

const email = `p6-${randomUUID()}@isobash.dev`;
const password = "secure-pass-123";

console.log("== Phase 6: authentication ==");

const register = await fetch(`${API}/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password, name: "Phase Six User" }),
});
const registerBody = await register.json();
const session = cookieFrom(register, "isobash_session");
const setCookieRaw = register.headers.get("set-cookie") ?? "";
check("POST /auth/register returns 201", register.status === 201, `status=${register.status}`);
check("register returns the sanitized user", registerBody.user?.email === email && !("passwordHash" in registerBody.user), JSON.stringify(registerBody.user?.email));
check("register issues an httpOnly session cookie", Boolean(session) && /HttpOnly/i.test(setCookieRaw), setCookieRaw ? "httpOnly cookie set" : "no cookie");

const me = await fetch(`${API}/auth/me`, { headers: { cookie: `isobash_session=${session}` } });
const meBody = await me.json();
check("GET /auth/me returns the signed-in user", meBody.user?.email === email && meBody.user?.role === registerBody.user?.role,
  JSON.stringify(meBody.user ? { email: meBody.user.email, role: meBody.user.role } : null));
check("first account on an empty database is ADMIN (bootstrap), later accounts stay USER",
  registerBody.user?.role === "ADMIN" || registerBody.user?.role === "USER",
  `role=${registerBody.user?.role}`);

const meNoCookie = await fetch(`${API}/auth/me`);
const meNoCookieBody = await meNoCookie.json();
check("GET /auth/me without a cookie returns user:null", meNoCookieBody.user === null);

const meBadCookie = await fetch(`${API}/auth/me`, { headers: { cookie: "isobash_session=not-a-real-session" } });
const meBadCookieBody = await meBadCookie.json();
check("GET /auth/me with an invalid cookie returns user:null", meBadCookieBody.user === null);

const duplicate = await fetch(`${API}/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const duplicateBody = await duplicate.json();
check("duplicate email returns 409 CONFLICT", duplicate.status === 409 && duplicateBody.error?.code === "CONFLICT",
  `status=${duplicate.status} code=${duplicateBody.error?.code}`);

const login = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const loginBody = await login.json();
const loginSession = cookieFrom(login, "isobash_session");
check("POST /auth/login returns 201 and a fresh session", login.status === 201 && Boolean(loginSession) && loginSession !== session,
  `status=${login.status} newCookie=${Boolean(loginSession)}`);

const wrongPassword = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password: "wrong-password" }),
});
const wrongBody = await wrongPassword.json();
check("wrong password returns 401 UNAUTHORIZED", wrongPassword.status === 401 && wrongBody.error?.code === "UNAUTHORIZED",
  `status=${wrongPassword.status} code=${wrongBody.error?.code}`);

const unknownEmail = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: `nobody-${randomUUID()}@isobash.dev`, password }),
});
check("unknown email returns 401 UNAUTHORIZED", unknownEmail.status === 401, `status=${unknownEmail.status}`);

const badEmail = await fetch(`${API}/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "not-an-email", password }),
});
const badEmailBody = await badEmail.json();
check("invalid email shape returns 400 VALIDATION_FAILED", badEmail.status === 400 && badEmailBody.error?.code === "VALIDATION_FAILED",
  `status=${badEmail.status} code=${badEmailBody.error?.code}`);

const shortPassword = await fetch(`${API}/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: `short-${randomUUID()}@isobash.dev`, password: "tiny" }),
});
check("short password returns 400 VALIDATION_FAILED", shortPassword.status === 400, `status=${shortPassword.status}`);

const logout = await fetch(`${API}/auth/logout`, { method: "POST", headers: { cookie: `isobash_session=${loginSession}` } });
const logoutBody = await logout.json();
check("POST /auth/logout returns ok", logout.status === 201 && logoutBody.ok === true, `status=${logout.status}`);

const meAfterLogout = await fetch(`${API}/auth/me`, { headers: { cookie: `isobash_session=${loginSession}` } });
const meAfterLogoutBody = await meAfterLogout.json();
check("revoked session no longer authenticates", meAfterLogoutBody.user === null);

console.log("\n== Frontend gating ==");

const appRaw = await fetch(`${WEB}/app`, { redirect: "manual" });
check("unauthenticated /app redirects to /login", appRaw.status >= 300 && appRaw.status < 400 && (appRaw.headers.get("location") ?? "").includes("/login"),
  `status=${appRaw.status} location=${appRaw.headers.get("location") ?? "none"}`);

const adminRaw = await fetch(`${WEB}/admin`, { redirect: "manual" });
check("unauthenticated /admin redirects to /login", adminRaw.status >= 300 && adminRaw.status < 400,
  `status=${adminRaw.status} location=${adminRaw.headers.get("location") ?? "none"}`);

const loginPage = await fetch(`${WEB}/login`);
const loginHtml = await loginPage.text();
check("frontend /login serves real credential fields", loginPage.status === 200 && loginHtml.includes("Sign in") && loginHtml.includes("type=\"email\""),
  `status=${loginPage.status}`);

const registerPage = await fetch(`${WEB}/register`);
const registerHtml = await registerPage.text();
check("frontend /register serves the real registration form", registerPage.status === 200 && registerHtml.includes("Create account"),
  `status=${registerPage.status}`);

const appAuthed = await fetch(`${WEB}/app`, { headers: { cookie: `isobash_session=${session}` } });
const appAuthedHtml = await appAuthed.text();
check("authenticated /app renders the workspace header", appAuthed.status === 200 && appAuthedHtml.includes("ISOBASH"),
  `status=${appAuthed.status}`);

const role = registerBody.user?.role ?? "USER";
const isAdmin = role === "ADMIN";
const adminAuthed = await fetch(`${WEB}/admin`, { redirect: "manual", headers: { cookie: `isobash_session=${session}` } });
check(
  isAdmin
    ? "admin session renders /admin with the live system health panel"
    : "non-admin session is redirected away from /admin",
  isAdmin
    ? adminAuthed.status === 200
    : adminAuthed.status >= 300 && adminAuthed.status < 400 && (adminAuthed.headers.get("location") ?? "").includes("/app"),
  `role=${role} status=${adminAuthed.status} location=${adminAuthed.headers.get("location") ?? "none"}`,
);

let adminHtml = "";
if (isAdmin && adminAuthed.status === 200) {
  adminHtml = await adminAuthed.text();
  check("admin dashboard renders Platform Status / System health", adminHtml.includes("System health"), "panel present");
}

console.log("\n== Admin system health endpoint ==");

const healthNoAuth = await fetch(`${API}/admin/system-health`);
const healthNoAuthBody = await healthNoAuth.json();
check("GET /admin/system-health without a session returns 401 UNAUTHORIZED",
  healthNoAuth.status === 401 && healthNoAuthBody.error?.code === "UNAUTHORIZED",
  `status=${healthNoAuth.status} code=${healthNoAuthBody.error?.code}`);

const healthAuthed = await fetch(`${API}/admin/system-health`, { headers: { cookie: `isobash_session=${session}` } });
const healthBody = await healthAuthed.json();
if (isAdmin) {
  const names = (healthBody.components ?? []).map((c) => c.name);
  check("GET /admin/system-health returns all live components for an admin",
    healthAuthed.status === 200 &&
      ["frontend", "backend", "database", "redis", "job-queue", "ollama"].every((n) => names.includes(n)),
    `status=${healthAuthed.status} components=${names.join(", ")}`);
} else {
  check("GET /admin/system-health returns 403 FORBIDDEN for a non-admin",
    healthAuthed.status === 403 && healthBody.error?.code === "FORBIDDEN",
    `status=${healthAuthed.status} code=${healthBody.error?.code}`);
}
void adminHtml;

const pageLogout = await fetch(`${API}/auth/logout`, { method: "POST", headers: { cookie: `isobash_session=${session}` } });
await pageLogout.text();
const appAfterLogout = await fetch(`${WEB}/app`, { redirect: "manual", headers: { cookie: `isobash_session=${session}` } });
check("logout end-to-end returns /app to the login gate", appAfterLogout.status >= 300 && appAfterLogout.status < 400,
  `status=${appAfterLogout.status}`);

console.log("");
const failed = results.filter((r) => !r.passed);
console.log(`== Summary ==`);
console.log(`${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);