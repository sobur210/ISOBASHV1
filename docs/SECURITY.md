# ISOBASH Security Posture

Phase 8 hardening. Covers authentication hardening, rate limiting, audit logging,
security headers, and the CSRF/XSS/SQLi posture for the current application surface.

## Authentication

- Passwords hashed with **bcryptjs** (10 salt rounds) before storage. No plaintext or reversibly-encrypted passwords.
- Sessions are random UUID rows in PostgreSQL (`Session`), carried in an `isobash_session`
  cookie that is **HttpOnly** and **SameSite=Lax**, with a 30-day `expiresAt` and revocable `revokedAt`.
  The cookie is only sent over HTTPS in production (`secure` toggled by `NODE_ENV`).
- `GET /auth/me` never errors: it resolves the cookie to a sanitized user payload (`SessionUser`)
  or `{ user: null }`, so clients can branch on session state safely.
- Login failure lockout (per account email): after 5 failed attempts in 15 minutes the account is
  throttled with `429 RATE_LIMITED` for further *failed* attempts. A legitimate holder entering the
  correct password still proceeds to the MFA step rather than being locked out entirely (anti-DoS).

### Admin multi-factor authentication (TOTP)

- Any account can enable MFA from **Workspace → Settings**. Setup re-validates the current password
  before a new secret is generated.
- Implementation follows RFC 6238: HMAC-SHA1, 6 digits, 30-second step, ±1 step window.
- The shared secret is generated (20 random bytes, base32-encoded) client-agnostically and returned
  to the user once as `{ secret, otpauthUrl }` (standard `otpauth://totp/` URI for any authenticator app).
- The secret is encrypted at rest with **AES-256-GCM** using `APP_SECRET` (`security.appSecret`) and
  stored in `User.mfaSecret`; `mfaEnabledAt` marks the account as enrolled. Neither is returned by any API.
- Logging in while MFA is enabled returns `{ mfaRequired: true, mfaToken }` and **no session cookie**.
  The sign-in only completes after `POST /auth/mfa/verify` validates the TOTP code.
- Enabling MFA rotates every *other* session the user holds; each device must re-authenticate.
- Pending MFA-bound logins are single-use in-memory tokens with a **3-minute TTL** and a **20-attempt cap**
  per token. **Limitation:** in-memory means the backend must run as a single instance; move these to Redis
  if the API is ever horizontally scaled.

## Rate limiting

Fixed-window counters backed by Redis with an automatic in-memory fallback if Redis is unreachable.

| Bucket | Limit | Window | Scope |
| --- | --- | --- | --- |
| `POST /auth/register` | 30 | 15 min | per IP |
| `POST /auth/login` | 30 | 15 min | per IP |
| `POST /auth/mfa/verify` | 10 | 15 min | per IP |
| Login failures | 5 | 15 min | per account email |

- Limited endpoints expose `x-ratelimit-limit`, `x-ratelimit-remaining` and `retry-after`.
- Exceeding a limit returns `429 RATE_LIMITED`.
- Limits and windows are configurable via `RATE_LIMIT_*` environment variables.

## Audit logging

`AuditEvent` rows are written for authentication and authorization events. Categories:

- `AUTH` — register, login, logout, `login_password_ok_mfa_required`, successful 2-step login
- `SECURITY` — failed login (**only a SHA-256 hash of the email address is retained**), MFA setup/enable/disable
  success and failure, invalid MFA code on sign-in
- `ADMIN` / `AUTHORIZATION` — RolesGuard allow (`admin_access`) and deny (`forbidden`)

Each event records category, action, actor id/email, IP, user-agent, and optional JSON metadata.
Failed writes are swallowed with a warning so security logging never breaks the request path.

## Security headers

### Backend (all routes, `SecurityHeadersMiddleware`)

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-origin`
- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'` — the API never
  serves HTML, so content is locked down to nothing by default.
- `Strict-Transport-Security` is added when serving over HTTPS or in production.

### Frontend (`next.config.ts`)

- Same anti-clickjacking/referrer/permissions headers as the backend.
- A Content-Security-Policy is applied to every page. Production uses `script-src 'self'`; the dev
  allowance (`'unsafe-inline' 'unsafe-eval'`) exists because Turbopack injects inline scripts/styles.

## CSRF / XSS / injection posture

- **CSRF:** the session cookie is `SameSite=Lax` (blocks cross-site POSTs) and HttpOnly; CORS is
  credentialed only toward the configured frontend origin. These two in combination mean a cross-site
  attacker cannot authenticate a state-changing request to the API.
- **XSS / stored injection:** user- and assistant-generated chat content is rendered as plain text
  (no `dangerouslySetInnerHTML` except a static theme script), so there is no DOM sink for stored XSS today.
- **SQL injection:** all queries go through Prisma's parameterized query builder; no raw SQL is executed
  from application code.
- **SSRF:** outbound provider calls are limited to configured provider URLs/environment; external URL
  fetching is not exposed through the API.
- **Secrets:** `APP_SECRET`, provider API keys, and the DATABASE_URL live only in local `.env`
  (git-ignored); `.env.example` documents each key without values.

## Operational notes

- New migrations are surfaced by the audit trail and Prisma schema; keep the API running with
  `prisma migrate deploy` on production.
- Re-running `scripts/verify-phase8.mjs` within the 15-minute rate-limit window is safe: each run uses
  unique throwaway identities and unique client IPs so every bucket starts fresh.