# ISOBASH Project Memory

Last updated: 2026-09-19

## Current status

- Phase 1 (project foundation): implemented and runtime-verified.
- Phase 2 (AI provider bridge): implemented and runtime-verified.
- Phase 3 (core infrastructure/services): implemented and runtime-verified.
- Phase 4 (complete product UI architecture): implemented and runtime-verified.
- Phase 5 (AI engine foundation + live chat): implemented and runtime-verified.
- Phase 6 (authentication): implemented and runtime-verified. Register/login/logout/me with bcrypt hashing and server-side sessions (httpOnly `isobash_session` cookie, 30-day TTL), `/app` and `/admin` layouts gate on a real session (redirect → `/login`), real login/register forms. Chat APIs remain client-session scoped (unchanged).
- Frontend visual redesign applied: ISOBASH brand identity (primary `#3B82F6`, accent `#0EA5FF`, dark `#111827`, light `#F8FAFC`, gray `#6B7280`), light/dark mode toggle with cookie persistence, responsive workspace and admin shells built on route layouts.
- Phase 4 UI: design-system primitives (`ui/card`, `ui/badge`, `ui/status-chip`, `ui/skeleton`), real-state workspace dashboard at `/app` (`health-panel` fetches `/health` + `/ai/providers/health` with 30s auto-refresh; `capabilities-panel` fetches `/ai/capabilities`), new surfaces `/app/research` (Phase 11) and `/app/billing` (Phase 16), route `loading.tsx`/`error.tsx` for `/app` and `/admin`, `lib/api.ts` client with normalized error extraction.
- Phase 5: live chat — `Conversation`/`Message` Prisma models (migration applied), provider `stream()` + registry streaming, `ChatService` orchestration persisting user/assistant messages, `POST /chat/stream` NDJSON/SSE streaming (meta→delta→done/error), ownership by `x-client-session` header, `DELETE`/list/detail endpoints, realtime `chat:updated` via session rooms, `/ai/tools` registry (empty), and a real `/app/chat` surface (conversation list, thread, streaming composer). Chat feature card on dashboard marked "Live now".
- Git repository initialized; all work is committed.
- All services verified live: frontend (3000), backend (3001), PostgreSQL (5432), Redis 5 (6380), Ollama (11434), BullMQ worker, Socket.IO.

## Stack

- Frontend: Next.js 16, React, TypeScript, Tailwind CSS v4
- Backend: Node.js, NestJS 10, TypeScript
- Database: PostgreSQL (Laragon), Prisma 5
- Jobs: Redis 5.0.14.1 (port 6380), BullMQ 5
- Realtime: Socket.IO
- Local AI: Ollama with `llama3.2:latest`
- Workspace: `C:\laragon\www\Isobash`

## Implemented structure

- `apps/frontend`: Next.js app — landing, auth, `/app` and `/admin` route groups with layouts, loading + error boundaries, live dashboard panels, surfaces (chat, research, agents, projects, files, media, billing, settings); `components/` (ui primitives + page-header, sidebar-nav, theme-toggle, feature-card, route-error, health-panel, capabilities-panel) and `lib/api.ts`
- `apps/backend`: NestJS API — `src/ai` (provider bridge, streaming, tools registry), `src/chat` (conversation/message persistence, SSE streaming), `src/auth` (register/login/logout/me, bcrypt hashing, httpOnly session cookies, AuthGuard + CurrentUser for Phase 7), `src/realtime` (gateway + session-scoped emitter), `src/shared/config` (typed env, fail-fast), `src/shared/storage` (externalized roots, traversal-safe), `src/shared/logging` (structured HTTP log + `x-request-id`), `src/shared/errors` (normalized error filter), `src/prisma`, `src/queues`
- `apps/worker`: BullMQ worker
- `prisma`: schema (User/Session/Project/Task/Notification/Conversation/Message) + migrations
- `scripts/`: `clean-dev.js` (preflight port cleanup), `verify-phase1.mjs`, `verify-phase3.mjs`, `verify-phase5.mjs`, `verify-phase6.mjs` (21 checks: register, me, duplicates, login/bad-login, logout/revocation, validation, frontend gating)
- `docs/`: ARCHITECTURE, LOCAL-DEVELOPMENT, PROVIDERS, README

## Backend endpoints

- `GET /health` — component health (database, redis)
- `GET /ai/providers`, `GET /ai/providers/health`, `GET /ai/models`, `GET /ai/capabilities`, `GET /ai/tools`
- `POST /ai/generate` — validated DTO; `400 VALIDATION_FAILED` on invalid input
- `POST /chat/stream` — validated DTO; NDJSON events `meta` → `delta`* → `done`/`error`; requires `x-client-session`; `400` on missing/invalid input
- `GET /chat/conversations`, `GET /chat/conversations/:id`, `DELETE /chat/conversations/:id` — client-session ownership enforced (404 otherwise)
- `POST /auth/register` — `201`, sets httpOnly `isobash_session` cookie; duplicate email → `409 CONFLICT`
- `POST /auth/login` — `201`, fresh session cookie; bad credentials → `401 UNAUTHORIZED`
- `POST /auth/logout` — revokes the server-side session and clears the cookie; `{ ok: true }`
- `GET /auth/me` — `{ user: SessionUser | null }`; never 401, resolves the cookie to a sanitized user

## Auth model

- `Session` rows in PostgreSQL (uuid id, 30-day `expiresAt`, revocable `revokedAt`), cookie `isobash_session` httpOnly SameSite=Lax (30-day TTL); `AuthGuard` + `@CurrentUser()` ready for Phase 7 role gates.
- CORS is credentialed (`origin: true, credentials: true`) and `cookie-parser` is mounted; the frontend sends `credentials: "include"`.
- Duplicate email surfaced as 409 with `CONFLICT` code; wrong password and unknown email both return the generic `401 UNAUTHORIZED`.
- Password hashing: bcryptjs (pure JS, Windows-safe).

## Realtime events

- Gateway: `ping`→`pong`, `join-room`, `task-created`, `notification`
- `chat:updated` broadcast to room `session:<clientSessionId>` after assistant message persistence (via `RealtimeService.emitToSession`)

## Error format (all responses)

```json
{ "error": { "code": "...", "message": "...", "status": 400, "requestId": "uuid", "path": "...", "timestamp": "..." } }
```

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
node scripts/verify-phase6.mjs   # 21 checks: register, me, duplicates, login/bad-login, logout/revocation, validation, frontend gating
```

All exit non-zero on failure. Last run: all green.

## Important Windows note

The running backend process locks `node_modules\.prisma\client\query_engine-windows.dll.node`, so `npx prisma generate` fails with EPERM while the API is live. To regenerate: stop the backend dev process, run generate, restart (e.g. `npm run dev:backend` in a separate terminal from `C:\laragon\www\Isobash`).

## Start commands

From `C:\laragon\www\Isobash`: `npm run dev`

Preflight `npm run clean:dev` clears stale listeners on 3000-3005. PostgreSQL, Redis (port 6380), and Ollama must be running first.

## Services start notes

- Redis 5 (port 6380): `C:\laragon\bin\redis\redis-x64-5.0.14.1\redis-server.exe --port 6380 --bind 127.0.0.1 --dir C:\laragon\Isobash-Redis`
- Old Redis 3 service remains on 6379 (elevated) — unused by the app.
- Ollama: start the Ollama app (serves 127.0.0.1:11434).

## Next session priorities

1. Phase 7: authorization (roles, entitlements, admin gating per spec §19.1) — `AuthGuard`/`@CurrentUser()` and the `role` field are in place; add role gates + operator/admin-only routes.
2. Continue phase-by-phase per the master spec. Do not skip phases or build fake functionality.
3. When starting: review git status and the master specification before writing code.