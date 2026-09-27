// Runtime verification for Phase 8: security hardening.
// Covers: audit events, rate limiting (login failure lockout + per-IP mfa verify),
// admin MFA lifecycle (setup -> enable -> 2-step login -> verify -> disable),
// security headers (backend + frontend), SameSite=Lax + HttpOnly cookies, and the
// authorization surface regression from Phase 7.
// Requires the full stack (frontend :3000, backend :3001, PostgreSQL) and DATABASE_URL in .env.
//
// Each run uses unique throwaway identities and unique X-Forwarded-For IPs so every
// rate-limit bucket starts fresh and the script can be re-run immediately.
import { createHmac, randomUUID } from "node:crypto";
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
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function cookieFrom(res, name) {
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.match(`${name}=([^;]+)`)?.[1] ?? null;
}

function hasHeader(res, name, expectedPart) {
  const value = res.headers.get(name) ?? "";
  return value.toLowerCase().includes(expectedPart.toLowerCase());
}

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totpFor(secret, at = Date.now()) {
  const counter = Math.floor(at / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return (binary % 10 ** 6).toString().padStart(6, "0");
}

const run = randomUUID().slice(0, 8);
const email = `p8-${run}@isobash.dev`;
const password = "secure-pass-456";
const xffLifecycle = `203.0.113.${100 + Math.floor(Math.random() * 100)}`;
const xffRate = `203.0.113.${200 + Math.floor(Math.random() * 50)}`;

const json = (body) => ({ "content-type": "application/json", ...body });
const post = (path, payload) => fetch(`${API}${path}`, { method: "POST", headers: json(payload.headers ?? {}), body: JSON.stringify(payload.body ?? {}) });

console.log("== Phase 8: authentication & authorization security ==");

const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;

console.log("\n== Security headers ==");

const health = await fetch(`${API}/health`);
check("backend sets X-Content-Type-Options: nosniff", hasHeader(health, "x-content-type-options", "nosniff"));
check("backend sets X-Frame-Options: DENY", hasHeader(health, "x-frame-options", "deny"));
check("backend sets Referrer-Policy: strict-origin-when-cross-origin",
  hasHeader(health, "referrer-policy", "strict-origin-when-cross-origin"));
check("backend sets Permissions-Policy denying camera/mic/geo", hasHeader(health, "permissions-policy", "camera=()"));
check("backend sets Cross-Origin-Opener-Policy: same-origin", hasHeader(health, "cross-origin-opener-policy", "same-origin"));
check("backend sets Cross-Origin-Resource-Policy: same-origin", hasHeader(health, "cross-origin-resource-policy", "same-origin"));
check("backend CSP locks content to 'none' with frame-ancestors 'none'",
  hasHeader(health, "content-security-policy", "default-src 'none'") &&
    hasHeader(health, "content-security-policy", "frame-ancestors 'none'"),
  `csp=${health.headers.get("content-security-policy") ?? "(missing)"}`);

const home = await fetch(WEB);
check("frontend sets X-Frame-Options: DENY on pages", hasHeader(home, "x-frame-options", "deny"));
check("frontend sets a CSP on pages", Boolean(home.headers.get("content-security-policy")),
  `csp=${(home.headers.get("content-security-policy") ?? "(missing)").slice(0, 48)}…`);

console.log("\n== Registration & cookie hardening ==");

const register = await fetch(`${API}/auth/register`, {
  method: "POST",
  headers: json({ "x-forwarded-for": xffLifecycle }),
  body: JSON.stringify({ email, password, name: "Phase Eight User" }),
});
const registerBody = await register.json();
const session = cookieFrom(register, "isobash_session");
const user = registerBody.user ?? {};
const setCookie = register.headers.get("set-cookie") ?? "";
check("POST /auth/register returns 201 and a session", register.status === 201 && Boolean(session), `status=${register.status}`);
check("session cookie is HttpOnly", setCookie.toLowerCase().includes("httponly"));
check("session cookie is SameSite=Lax (CSRF-relevant)", setCookie.toLowerCase().includes("samesite=lax"));
check("rate-limited endpoint exposes x-ratelimit-* headers",
  ["x-ratelimit-limit", "x-ratelimit-remaining"].every((k) => register.headers.get(k) !== null),
  `limit=${register.headers.get("x-ratelimit-limit")} remaining=${register.headers.get("x-ratelimit-remaining")}`);

const meSansCookie = await fetch(`${API}/auth/me`);
check("GET /auth/me without a session returns user:null", meSansCookie.status === 200 && (await meSansCookie.json()).user === null);

console.log("\n== Admin MFA lifecycle (TOTP) ==");

const authHeaders = { cookie: `isobash_session=${session}`, "x-forwarded-for": xffLifecycle };

const me0 = await fetch(`${API}/auth/me`, { headers: authHeaders });
check("fresh user reports mfaEnabled=false", (await me0.json()).user?.mfaEnabled === false);

const setupWrongPw = await post("/auth/mfa/setup", { headers: authHeaders, body: { password: "wrong-password" } });
check("MFA setup refuses the wrong password (401)", setupWrongPw.status === 401, `status=${setupWrongPw.status}`);

const setup = await post("/auth/mfa/setup", { headers: authHeaders, body: { password } });
const setupBody = await setup.json();
const secret = setupBody.secret;
check("MFA setup returns a base32 secret", setup.status === 201 && Boolean(secret), `status=${setup.status}`);
check("MFA setup returns a TOTP otpauth URI for ISOBASH",
  typeof setupBody.otpauthUrl === "string" && setupBody.otpauthUrl.startsWith("otpauth://totp/ISOBASH:") && setupBody.otpauthUrl.includes(`secret=${secret}`));

const enableWrong = await post("/auth/mfa/enable", { headers: authHeaders, body: { code: "999999" } });
check("MFA enable rejects a wrong code (401)", enableWrong.status === 401, `status=${enableWrong.status}`);

const enable = await post("/auth/mfa/enable", { headers: authHeaders, body: { code: totpFor(secret) } });
check("MFA enable accepts the current TOTP code", enable.status === 201 && (await enable.json()).ok === true, `status=${enable.status}`);

const me1 = await fetch(`${API}/auth/me`, { headers: authHeaders });
check("mfaEnabled=true surfaces over /auth/me after enabling", (await me1.json()).user?.mfaEnabled === true);

console.log("\n== Two-step sign-in ==");

const reLogin = await post("/auth/login", {
  headers: { "x-forwarded-for": xffLifecycle },
  body: { email, password },
});
const reLoginBody = await reLogin.json();
check("login of an MFA user yields mfaRequired + mfaToken (no cookie yet)",
  reLogin.status === 201 && reLoginBody.mfaRequired === true && Boolean(reLoginBody.mfaToken), `status=${reLogin.status}`);
check("no session cookie is set until MFA is verified", cookieFrom(reLogin, "isobash_session") === null);

const wrongVerify = await post("/auth/mfa/verify", {
  headers: { "x-forwarded-for": xffLifecycle },
  body: { token: reLoginBody.mfaToken, code: "111111" },
});
check("MFA verify rejects a wrong code on a live token (401)",
  wrongVerify.status === 401 && (await wrongVerify.json()).error?.code === "UNAUTHORIZED");

const verify = await post("/auth/mfa/verify", {
  headers: { "x-forwarded-for": xffLifecycle },
  body: { token: reLoginBody.mfaToken, code: totpFor(secret) },
});
const verifyBody = await verify.json();
const mfaCookie = cookieFrom(verify, "isobash_session");
check("MFA verify completes the sign-in with a session",
  verify.status === 201 && Boolean(mfaCookie) && verifyBody.user?.email === email, `status=${verify.status}`);
check("completed session is SameSite=Lax + HttpOnly",
  (verify.headers.get("set-cookie") ?? "").toLowerCase().includes("samesite=lax") &&
    (verify.headers.get("set-cookie") ?? "").toLowerCase().includes("httponly"));

const adminNoSession = await fetch(`${API}/admin/system-health`);
const adminNoSessionBody = await adminNoSession.json();
check("admin endpoint stays locked without a session (401 AuthGuard)",
  adminNoSession.status === 401 && adminNoSessionBody.error?.code === "UNAUTHORIZED", `status=${adminNoSession.status}`);

const adminAsUser = await fetch(`${API}/admin/system-health`, { headers: { cookie: `isobash_session=${mfaCookie}` } });
check("regular user is still blocked from admin surface (403 RolesGuard)",
  adminAsUser.status === 403 && (await adminAsUser.json()).error?.code === "FORBIDDEN", `status=${adminAsUser.status}`);

console.log("\n== mfa verify per-IP rate limit ==");

// Dedicated IP: exactly 10 verify calls are allowed in 15 minutes; the 11th must be
// throttled even though each individual call also carries a bad token.
let early429 = null;
let loopLeft = null;
for (let i = 0; i < 10; i += 1) {
  const lg = await post("/auth/login", { headers: { "x-forwarded-for": xffRate }, body: { email, password } });
  if (lg.status === 429) { early429 = "login"; loopLeft = i; break; }
  const body = (await lg.json());
  if (!body.mfaRequired) { early429 = `unexpected(${lg.status})`; loopLeft = i; break; }
  const v = await post("/auth/mfa/verify", { headers: { "x-forwarded-for": xffRate }, body: { token: body.mfaToken, code: "000000" } });
  if (v.status !== 401) { early429 = `verify(status=${v.status})`; loopLeft = i; break; }
}
const exhausted = await post("/auth/mfa/verify", { headers: { "x-forwarded-for": xffRate }, body: { token: "0".repeat(48), code: "000000" } });
const exhaustedBody = await exhausted.json();
check("mfa/verify exceeds its per-IP budget and returns 429 RATE_LIMITED",
  early429 === null && exhausted.status === 429 && exhaustedBody.error?.code === "RATE_LIMITED",
  `early429=${early429} status=${exhausted.status} code=${exhaustedBody.error?.code} loopLeft=${loopLeft}`);

console.log("\n== Login failure lockout (per-account) ==");

let lockoutStatus;
for (let i = 1; i <= 6; i += 1) {
  const attempt = await post("/auth/login", {
    headers: { "x-forwarded-for": xffLifecycle },
    body: { email, password: `wrong-${i}` },
  });
  lockoutStatus = attempt.status;
}
check("5 consecutive failed logins lock the account (6th attempt → 429 RATE_LIMITED)",
  lockoutStatus === 429, `status of 6th attempt=${lockoutStatus}`);

const locked = await post("/auth/login", { headers: { "x-forwarded-for": xffLifecycle }, body: { email, password } });
const lockedBody = await locked.json();
check("lockout does not DoS the legitimate holder (correct password reaches MFA step)",
  locked.status === 201 && lockedBody.mfaRequired === true, `status=${locked.status}`);

const stillLocked = await post("/auth/login", {
  headers: { "x-forwarded-for": xffLifecycle },
  body: { email, password: "wrong-7" },
});
const stillLockedBody = await stillLocked.json();
check("lockout still throttles further failed attempts until the window resets",
  stillLocked.status === 429 && stillLockedBody.error?.code === "RATE_LIMITED", `status=${stillLocked.status}`);

console.log("\n== Audit trail (persistent) ==");

if (pool) {
  const { rows } = await pool.query(
    `SELECT category, action, count(*)::int AS n,
            max((metadata->>'locked')::text) AS locked
     FROM "AuditEvent"
     WHERE "actorEmail" = $1
     GROUP BY category, action
     ORDER BY category, action`,
    [email],
  );
  const map = Object.fromEntries(rows.map((r) => [`${r.category}:${r.action}`, r]));
  check("register is audited (AUTH/register)", map["AUTH:register"]?.n >= 1, `n=${map["AUTH:register"]?.n ?? 0}`);
  check("failed MFA setup is audited (SECURITY/mfa_setup_failed_wrong_password)",
    map["SECURITY:mfa_setup_failed_wrong_password"]?.n === 1);
  check("MFA enable is audited (SECURITY/mfa_enabled)", map["SECURITY:mfa_enabled"]?.n === 1);
  check("MFA wrong-code enable is audited (SECURITY/mfa_enable_failed_invalid_code)",
    map["SECURITY:mfa_enable_failed_invalid_code"]?.n === 1);
  check("MFA-gated password-ok logins are audited (AUTH/login_password_ok_mfa_required)",
    (map["AUTH:login_password_ok_mfa_required"]?.n ?? 0) >= 8, `n=${map["AUTH:login_password_ok_mfa_required"]?.n ?? 0}`);
  check("failed login is audited with a locked flag (SECURITY/login_failed)",
    map["SECURITY:login_failed"]?.n >= 7 && map["SECURITY:login_failed"]?.locked === "true",
    `n=${map["SECURITY:login_failed"]?.n ?? 0} locked=${map["SECURITY:login_failed"]?.locked ?? "(none)"}`);
  check("successful 2-step login is audited as AUTH/login",
    map["AUTH:login"]?.n >= 1, `login n=${map["AUTH:login"]?.n ?? 0}`);
  check("failed MFA login is audited (SECURITY/mfa_login_failed)",
    map["SECURITY:mfa_login_failed"]?.n >= 2, `n=${map["SECURITY:mfa_login_failed"]?.n ?? 0}`);

  console.log("\n== Cleanup ==");

  await pool.query(`DELETE FROM "Session" WHERE "userId" = $1`, [user.id]);
  await pool.query(`DELETE FROM "User" WHERE id = $1`, [user.id]);
  console.log("(throwaway test user removed; audit events retained as evidence)");
} else {
  console.log("(skipped audit + cleanup — DATABASE_URL not found in .env)");
}

console.log("");
const failed = results.filter((r) => !r.passed);
console.log("== Summary ==");
console.log(`${results.length - failed.length}/${results.length} checks passed.`);
await pool?.end();
process.exit(failed.length ? 1 : 0);