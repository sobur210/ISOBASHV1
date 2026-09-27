# ISOBASH Project Memory

Last updated: 2026-09-27

## Current status

- Phase 1 (project foundation): implemented and runtime-verified.
- Phase 2 (AI provider bridge): implemented and runtime-verified.
- Phase 3 (core infrastructure/services): implemented and runtime-verified.
- Phase 4 (complete product UI architecture): implemented and runtime-verified.
- Phase 5 (AI engine foundation + live chat): implemented and runtime-verified.
- Phase 6 (authentication): implemented and runtime-verified. Register/login/logout/me with bcrypt hashing and server-side sessions (httpOnly `isobash_session` cookie, 30-day TTL), `/app` and `/admin` layouts gate on a real session (redirect → `/login`), real login/register forms. Chat APIs remain client-session scoped (unchanged).
- Platform Status moved / admin gating: the hardcoded "Platform status" panel was **removed from the public hero** (`app/page.tsx`) entirely. It now lives in the admin dashboard as a live, real-time **SystemHealthPanel** (admin-only): frontend, backend, database, Redis, job queue, and Ollama are each **checked live** by `GET /admin/system-health` (per-component latency in ms, 5s timeouts), auto-refreshing every 10s. `AuthGuard` + `RolesGuard` (`@Roles('ADMIN')`, backend) + `requireAdmin()` (frontend `/admin` layout) enforce `role === 'ADMIN'`; non-admins get `403 FORBIDDEN` / redirected to `/app`. `403` now maps to `FORBIDDEN` in the error filter. The **first account registered on an empty database is bootstrapped as ADMIN**.
- Gemini provider: `gemini.provider.ts` + registry/config wiring, build-green (`GEMINI_ENABLED`/`GEMINI_MODEL`/`GEMINI_API_KEY`; `normalizeRequest` added so per-provider model routing works). Committed in `3ce2bbd`.
- Frontend visual redesign applied: ISOBASH brand identity (primary `#3B82F6`, accent `#0EA5FF`, dark `#111827`, light `#F8FAFC`, gray `#6B7280`), light/dark mode toggle with cookie persistence, responsive workspace and admin shells built on route layouts.
- Phase 4 UI: design-system primitives (`ui/card`, `ui/badge`, `ui/status-chip`, `ui/skeleton`), real-state workspace dashboard at `/app` (`health-panel` fetches `/health` + `/ai/providers/health` with 30s auto-refresh; `capabilities-panel` fetches `/ai/capabilities`), new surfaces `/app/research` (Phase 11) and `/app/billing` (Phase 16), route `loading.tsx`/`error.tsx` for `/app` and `/admin`, `lib/api.ts` client with normalized error extraction.
- Phase 5: live chat — `Conversation`/`Message` Prisma models (migration applied), provider `stream()` + registry streaming, `ChatService` orchestration persisting user/assistant messages, `POST /chat/stream` NDJSON/SSE streaming (meta→delta→done/error), ownership by `x-client-session` header, `DELETE`/list/detail endpoints, realtime `chat:updated` via session rooms, `/ai/tools` registry (empty), and a real `/app/chat` surface (conversation list, thread, streaming composer). Chat feature card on dashboard marked "Live now".
- Phase 7 (authorization): `@Roles()` + `RolesGuard` gate the admin surface (`AdminController` = `@UseGuards(AuthGuard, RolesGuard)` + `@Roles('ADMIN')`); AuthGuard + RolesGuard + AuditService exported via AuthModule re-exporting SecurityModule; `admin.guard.ts` deleted; `verify-phase7.mjs` 10/10 (incl. DB role round-trip + admin link visibility).
- Phase 8 (security hardening): rate limiting (Redis-backed w/ in-memory fallback), admin TOTP MFA (RFC 6238, secret AES-256-GCM at rest with `APP_SECRET`, 2-step login, session rotation on enable), persistent `AuditEvent` audit trail, security headers (backend + frontend CSP), CSRF posture (SameSite=Lax + httpOnly), 429→`RATE_LIMITED`. `verify-phase8.mjs` 40/40; phase6 24/24 + phase7 10/10 regressions green.
- Everything through Phase 8 is committed (`3ce2bbd`); the working tree is clean. `.env.example` is tracked (the `.env.*` rule used to swallow it), `.env` stays local-only, and the two duplicate brand PNGs at the repo root are ignored because the app assets are already tracked.
- All services verified live: frontend (3000), backend (3001), PostgreSQL (5432), Redis 5 (6380), Ollama (11434), BullMQ worker, Socket.IO.
- Frontend lint/typecheck are clean (eslint 0 errors, 0 warnings; `tsc --noEmit` green for backend and frontend). Fixed against the React Compiler rules shipped with `eslint-config-next` 16 (`react-hooks/set-state-in-effect`): data fetching moved to promise chains whose `setState` runs in `.then` (see `capabilities-panel.tsx` for the canonical shape), and `theme-toggle.tsx` now derives the theme from the DOM via `useSyncExternalStore` + `MutationObserver` instead of setting state on mount. Logo rendered through `components/brand-logo.tsx` (`next/image`) in all four shells.

## Stack

- Frontend: Next.js 16, React, TypeScript, Tailwind CSS v4
- Backend: Node.js, NestJS 10, TypeScript
- Database: PostgreSQL (Laragon), Prisma 5
- Jobs: Redis 5.0.14.1 (port 6380), BullMQ 5
- Realtime: Socket.IO
- Local AI: Ollama with `llama3.2:latest`
- Workspace: `C:\laragon\www\Isobash`

## Implemented structure

- `apps/frontend`: Next.js app — landing, auth, `/app` and `/admin` route groups with layouts, loading + error boundaries, live dashboard panels, surfaces (chat, research, agents, projects, files, media, billing, settings); `components/` (ui primitives + page-header, sidebar-nav, theme-toggle, feature-card, route-error, health-panel, capabilities-panel, system-health-panel) and `lib/api.ts` (`getJsonAuthed` for credentialed admin fetch) + `lib/auth-server.ts` (`requireUser`, `requireAdmin`)
- `apps/backend`: NestJS API — `src/ai` (provider bridge incl. Ollama/Gemini/OpenAI + `normalizeRequest`, streaming, tools registry), `src/chat` (conversation/message persistence, SSE streaming), `src/auth` (register/login/logout/me, bcrypt hashing, httpOnly session cookies, AuthGuard + RolesGuard with `@Roles()` + CurrentUser, MFA endpoints + 2-step login), `src/security` (TOTP, SecretCipher, AuditService, RateLimitService, RateLimitGuard, SecurityHeadersMiddleware), `src/admin` (system-health service + `@Roles('ADMIN')`-gated controller), `src/realtime` (gateway + session-scoped emitter), `src/shared/config` (typed env, fail-fast), `src/shared/storage` (externalized roots, traversal-safe), `src/shared/logging` (structured HTTP log + `x-request-id`), `src/shared/errors` (normalized error filter incl. `FORBIDDEN`, `RATE_LIMITED`), `src/prisma`, `src/queues`
- `apps/worker`: BullMQ worker
- `apps/frontend` (Phase 8 additions): `lib/auth.ts` (`SessionUser.mfaEnabled`), `lib/auth-client.ts` (mfa-aware `submitCredentials` + `verifyMfaToken`), `login-form.tsx` OTP step, `mfa-settings.tsx` TOTP panel on `/app/settings`, `next.config.ts` dev/prod CSP + security headers; hero on `app/page.tsx` now a two-column layout with Unsplash AI-workspace art + "Local-first · Cloud-ready" badge (no hardcoded status claims)
- `prisma`: schema (User/Session/Project/Task/Notification/Conversation/Message/AuditEvent) + migrations
- `scripts/`: `clean-dev.js` (preflight port cleanup), `verify-phase1.mjs`, `verify-phase3.mjs`, `verify-phase5.mjs`, `verify-phase6.mjs`, `verify-phase7.mjs`, `verify-phase8.mjs`
- `docs/`: ARCHITECTURE, LOCAL-DEVELOPMENT, PROVIDERS, README

## Backend endpoints

- `GET /health` — component health (database, redis)
- `GET /admin/system-health` — ADVANCED, admin-only: live `frontend / backend / database / redis / job-queue / ollama` components with status, detail, and latencyMs; `401` without a session, `403 FORBIDDEN` for non-admins.
- `GET /ai/providers`, `GET /ai/providers/health`, `GET /ai/models`, `GET /ai/capabilities`, `GET /ai/tools`
- `POST /ai/generate` — validated DTO; `400 VALIDATION_FAILED` on invalid input
- `POST /chat/stream` — validated DTO; NDJSON events `meta` → `delta`* → `done`/`error`; requires `x-client-session`; `400` on missing/invalid input
- `GET /chat/conversations`, `GET /chat/conversations/:id`, `DELETE /chat/conversations/:id` — client-session ownership enforced (404 otherwise)
- `POST /auth/register` — `201`, sets httpOnly `isobash_session` cookie; rate-limited (30/15min per IP); duplicate email → `409 CONFLICT`
- `POST /auth/login` — `201`, fresh session cookie; bad credentials → `401 UNAUTHORIZED`; rate-limited; MFA-enabled accounts return `{ mfaRequired: true, mfaToken }` (no cookie until verified); per-account failure lockout after 5 bad tries (6th → `429 RATE_LIMITED`; a valid password still reaches the MFA step)
- `POST /auth/mfa/verify` — TOTP completes the 2-step sign-in (per-IP budget 10/15min); `401 UNAUTHORIZED` on bad/expired code
- `POST /auth/mfa/setup` — requires the current password; returns `{ secret, otpauthUrl }`; secret stored encrypted (AES-256-GCM + `APP_SECRET`)
- `POST /auth/mfa/enable` — validates a TOTP code, enables MFA, rotates every other session
- `POST /auth/mfa/disable` — validates a TOTP code, clears `mfaSecret` / `mfaEnabledAt`
- `POST /auth/logout` — revokes the server-side session and clears the cookie; `{ ok: true }`
- `GET /auth/me` — `{ user: SessionUser | null }`; never 401, resolves the cookie to a sanitized user (includes `mfaEnabled`)

## Auth model

- `Session` rows in PostgreSQL (uuid id, 30-day `expiresAt`, revocable `revokedAt`), cookie `isobash_session` httpOnly SameSite=Lax (30-day TTL); `AuthGuard` (any session) + `RolesGuard` (`@Roles('ADMIN')`, else `403 FORBIDDEN`) plus `@CurrentUser()` ready for extended role entitlements.
- Bootstrap: the first account on an empty database registers as `ADMIN` so the admin surface is reachable; every later account defaults to `USER`. To grant admin in an existing DB, `UPDATE "User" SET role='ADMIN' WHERE email=...`.
- CORS is credentialed (`origin: true, credentials: true`) and `cookie-parser` is mounted; the frontend sends `credentials: "include"`.
- Duplicate email surfaced as 409 with `CONFLICT` code; wrong password and unknown email both return the generic `401 UNAUTHORIZED`.
- Password hashing: bcryptjs (pure JS, Windows-safe).
- TOTP MFA (RFC 6238): SHA-1 / 6 digits / 30s step / ±1 window; secret `AES-256-GCM`-encrypted at rest (`APP_SECRET` required, fail-fast); pending-login tokens in-memory (3-min TTL, 20 max attempts per token — single-instance limitation); enabling MFA rotates every other session; MFA is available to any account (not admin-only).
- Rate limits (Redis-backed, in-memory fallback): register 30/15min per IP, login 30/15min per IP, mfa verify 10/15min per IP, login-failure lockout 5/15min per email; `x-ratelimit-limit/-remaining` + `retry-after` headers; 429 → `RATE_LIMITED`. Defaults tunable via `RATE_LIMIT_*` env vars.
- Audit: `AuditEvent` rows (category `AUTH`/`AUTHORIZATION`/`ADMIN`/`SECURITY`, action, actor, ip, user-agent, JSON metadata); `login_failed` stores only a hashed email fragment. RolesGuard allow → `ADMIN/admin_access`, deny → `AUTHORIZATION/forbidden`.
- Security headers: backend middleware (nosniff, `X-Frame-Options: DENY`, referrer-policy, permissions-policy, COOP/CORP same-origin, CSP `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`, HSTS over HTTPS/prod) + frontend `next.config.ts` CSP (relaxed in dev for Turbopack). CSRF posture = same-site cookies (SameSite=Lax, HttpOnly) + no CORS wildcard.

## Realtime events

- Gateway: `ping`→`pong`, `join-room`, `task-created`, `notification`
- `chat:updated` broadcast to room `session:<clientSessionId>` after assistant message persistence (via `RealtimeService.emitToSession`)

## Error format (all responses)

```json
{ "error": { "code": "...", "message": "...", "status": 400, "requestId": "uuid", "path": "...", "timestamp": "..." } }
```

Errors: `UNAUTHORIZED`=401, `FORBIDDEN`=403 (admin gate), `CONFLICT`=409, `VALIDATION_FAILED`=400, `NOT_FOUND`=404, `RATE_LIMITED`=429.

## Runtime data (externalized)

- `DATA_ROOT=C:/laragon/www/ISOBASH-DATA` (uploads/, media/, temp/, logs/, cache/, knowledge/, generated/)
- `MODEL_ROOT=C:/laragon/www/ISOBASH-MODELS`

## Environment

`.env` is local-only, never committed. `.env.example` documents every variable. Startup validates required vars and fails fast (e.g. `OPENAI_ENABLED=true` without `OPENAI_API_KEY`).

## Verification

```bash
node scripts/verify-phase1.mjs   # 23 checks: routes, health, AI, Prisma, BullMQ + worker, Socket.IO
node scripts/verify-phase3.mjs   # 9 checks: env config, storage roots, health components, error format, realtime
node scripts/verify-phase5.mjs   # 24 checks: chat streaming, persistence, ownership, validation, tools, chat UI + auth gate
node scripts/verify-phase6.mjs   # 24 checks: register, me, duplicates, login/bad-login, logout/revocation, validation, frontend gating, admin/system-health (401 unauth, 403 non-admin, admin 200 with 6 live components) + hero panel removal
node scripts/verify-phase7.mjs   # 10 checks: RolesGuard allow/deny, AuthGuard 401, role round-trip via DB, admin link visibility/gating
node scripts/verify-phase8.mjs   # 40 checks: security headers (back+front), cookie hardening, MFA lifecycle + 2-step login, mfa per-IP 429, login lockout, audit rows
```

All exit non-zero on failure. Last run (2026-09-27, live stack): all green — 23 + 9 + 24 + 24 + 10 + 40 = 130 checks. `npm run typecheck` and `npm run lint` also green.

## Frontend conventions (Next 16 / React 19.2)

- `eslint-config-next` 16 enables the React Compiler lint rules; they are errors, not warnings, so `npm run lint` must pass before committing.
- Never call `setState` synchronously in an effect body (direct or through a wrapper function). Kick off the request and set state inside `.then`/`.catch`, as in `capabilities-panel.tsx`.
- For DOM-derived state (e.g. the `dark` class on `<html>`) read it with `useSyncExternalStore` + `MutationObserver`, with a server snapshot for SSR.
- Use `next/image` for local assets; `<img>` triggers `@next/next/no-img-element`.

## Important Windows note

The running backend process locks `node_modules\.prisma\client\query_engine-windows.dll.node`, so `npx prisma generate` fails with EPERM while the API is live. To regenerate: stop the backend dev process, run generate, restart (e.g. `npm run dev:backend` in a separate terminal from `C:\laragon\www\Isobash`).

## Start commands

From `C:\laragon\www\Isobash`: `npm run dev`

Preflight `npm run clean:dev` clears stale listeners on 3000-3005. PostgreSQL, Redis (port 6380), and Ollama must be running first.

## Services start notes

- Redis 5 (port 6380): `C:\laragon\bin\redis\redis-x64-5.0.14.1\redis-server.exe --port 6380 --bind 127.0.0.1 --dir C:\laragon\Isobash-Redis`
- Old Redis 3 service remains on 6379 (elevated) — unused by the app.
- Ollama: start the Ollama app (serves 127.0.0.1:11434).
- Gemini chat provider: DONE — `gemini.provider.ts` implemented and registered
  (GEMINI_ENABLED/GEMINI_MODEL/GEMINI_API_KEY; `gemini-3.7-flash`, stable GA on the
  free tier — `gemini-2.5-flash` is retired for newly provisioned keys and answers
  404, so it must not be used as a default anywhere). `normalizeRequest` added to
  the provider registry so `provider` or `provider:model` request routing works for
  ollama/gemini/openai. Gemini health is verified live (`/ai/providers/health`
  reports `gemini=healthy`, 1,048,576 context window).

## Next session priorities

1. Phase 7 + Phase 8 are implemented and runtime-verified (authorization + security hardening). Next per master spec: Phase 9 — the master spec is **not** in this repo, so get the Phase 9 scope from the user before writing code.
2. Nothing pending to commit — the tree is clean as of `3ce2bbd`. Keep `npm run typecheck`, `npm run lint`, and the verify scripts green before every commit.
3. Documented limitation to revisit: pending-MFA sign-in tokens are held in-memory (3-min TTL, 20 attempts) and require single-instance deployments; move to Redis if horizontal scaling is needed.
4. Continue phase-by-phase per the master spec. Do not skip phases or build fake functionality.
5. When starting: review git status and the master specification before writing code.