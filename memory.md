# ISOBASH Project Memory

Last updated: 2026-09-30

## Current status

### Active handoff: admin shell feature (2026-10-02)

- Feature implementation is in place for the admin-only shell runner and UI panel.
- Files involved: `apps/backend/src/admin/admin-shell.service.ts`, `apps/backend/src/admin/admin.controller.ts`, `apps/backend/src/admin/admin.module.ts`, `apps/frontend/components/admin-shell-panel.tsx`, and `apps/frontend/app/admin/settings/page.tsx`.
- The feature is intentionally read-only and restricted to a safe allow-list: `pwd`, `ls`, `whoami`, `date`, `hostname`, `git status`, simple diagnostics, and similarly low-risk commands. Dangerous shell chaining, pipes, redirects, and destructive actions are blocked.
- The remaining blocker is the backend Jest/TypeScript bootstrap, not the feature logic itself. The test command fails before running any assertions with: `SyntaxError: Cannot use import statement outside a module`.
- Relevant config to inspect: `apps/backend/jest.config.js`.
- The next developer should fix the Jest TypeScript transform so the admin-shell test in `apps/backend/src/admin/admin-shell.service.test.ts` runs under the repo’s real config and validates the allow-list behavior.

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
- Phase 5: live chat, `Conversation`/`Message` Prisma models (migration applied), provider `stream()` + registry streaming, `ChatService` orchestration persisting user/assistant messages, `POST /chat/stream` NDJSON/SSE streaming (meta→delta→done/error), ownership by `x-client-session` header, `DELETE`/list/detail endpoints, realtime `chat:updated` via session rooms, `/ai/tools` registry (empty), and a real `/app/chat` surface (conversation list, thread, streaming composer). Chat feature card on dashboard marked "Live now".
- Phase 7 (authorization): `@Roles()` + `RolesGuard` gate the admin surface (`AdminController` = `@UseGuards(AuthGuard, RolesGuard)` + `@Roles('ADMIN')`); AuthGuard + RolesGuard + AuditService exported via AuthModule re-exporting SecurityModule; `admin.guard.ts` deleted; `verify-phase7.mjs` 10/10 (incl. DB role round-trip + admin link visibility).
- Phase 8 (security hardening): rate limiting (Redis-backed w/ in-memory fallback), admin TOTP MFA (RFC 6238, secret AES-256-GCM at rest with `APP_SECRET`, 2-step login, session rotation on enable), persistent `AuditEvent` audit trail, security headers (backend + frontend CSP), CSRF posture (SameSite=Lax + httpOnly), 429→`RATE_LIMITED`. `verify-phase8.mjs` 40/40; phase6 24/24 + phase7 10/10 regressions green.
- Everything through Phase 8 is committed (`3ce2bbd`); the working tree is clean. `.env.example` is tracked (the `.env.*` rule used to swallow it), `.env` stays local-only, and the two duplicate brand PNGs at the repo root are ignored because the app assets are already tracked.
- Phase 10 (agents): implemented and runtime-verified, `Agent`/`AgentRun`/`AgentStep`/`MemoryEntry` models (migration `20260927203610_phase10_agents_memory`), `src/agents` (config CRUD + a real plan/execute/synthesise runner), `src/memory` (typed store with keyword search and per-kind stats), `src/projects` (projects + ordered tasks), and five governed tools. `verify-phase10.mjs` 66-67 (the total moves with the live model plan). Phases 1/3/5/6/7/8 stay green (23 + 9 + 24 + 24 + 10 + 40 = 130).
- Phase 11 (research): implemented and runtime-verified, `ResearchSession`/`ResearchSource`/`ResearchCitation` models (migrations `20260928004147_phase11_research`, `..._final_url`, `..._no_evidence`), `src/research` (search + SSRF-hardened retrieval + citation-checked synthesis), `components/research-panel.tsx` on the real `/app/research` surface. `verify-phase11.mjs` 35/35 with `RESEARCH_ALLOW_PRIVATE_HOSTS=true` and 29/29 in the default hardened mode. Regressions green: 23 + 9 + 24 + 24 + 10 + 40 + 66 (phase10 total varies 66/67 by the live model plan).
- Phase 12 (files, documents, knowledge): implemented and runtime-verified, `StoredFile`/`FileChunk` models plus the `FileStatus` enum (migrations `20260928200344_phase12_files`, `20260928201518_phase12_file_chunk_count`), `src/files` (validation → storage → extraction → chunking → embedding → retrieval), embedding support added to the AI bridge, and `components/files-panel.tsx` on the real `/app/files` surface. `verify-phase12.mjs` 64/64. Regressions green: 23 + 9 + 24 + 24 + 10 + 40 + 67 + 35 (+29 hardened).
- Phase 13 (media, image generation): implemented, runtime-verified, and **live**, `ImageGeneration`/`MediaAsset` models plus the `MediaGenerationStatus`/`MediaKind` enums (migrations `20260929030415_phase13_media`, `20260929031024_phase13_media_warning`), `src/media` (capabilities, generation runs, owner-scoped checksum-verified byte route), `components/media-panel.tsx` on the real `/app/media` surface, and two extra renderers so the site can really draw (`pollinations.provider.ts`, plus `gpt-image-1` on `OpenAiProvider`). `verify-phase13.mjs` 86/86 with 5 reported skips, including a live third-party render stored, served and deleted. Regressions green: 23 + 9 + 24 + 24 + 10 + 40 + 67 + 29 + 64 + 86 = 376.
- **The image success path could not be exercised against a live provider in this environment:** Gemini answers `RATE_LIMITED` with `Quota exceeded for metric: generate_content_free_tier_requests, limit: 0` for `gemini-3.1-flash-image`, i.e. this key's free tier has a zero image quota. That failure is recorded honestly (FAILED with the provider's own code, no asset, no substituted model), and the byte sniffer plus the whole storage/read/delete path are verified against real fixtures, but `ImageGenerationService.store()` turning a live provider payload into a row has not run. Re-run `verify:phase13` on a key with image quota and the provider branch of the script takes over from the fixture.
- Phase 15 (video providers, credits, provider-scoped render queues): implemented and runtime-verified, `verify:phase15.mjs` **54/54** (`npm run verify:phase15`). Adds the Magic Hour adapter (`ai/magic-hour-video.provider.ts` + `magic-hour.pricing.ts`, base URL honours `MAGICHOUR_VIDEO_BASE_URL` so the verifier drives it against a fixture exactly as phase13 does for Gemini), the provider credit ledger (`provider-credit.service.ts`, `ProviderCreditEntry`/`ProviderCreditSnapshot`, migration `20260930011549_phase15_magichour_credits`), and **one BullMQ queue per render provider** (`isobash-video-render.<provider>`, migration `20260930023621_phase15_video_queue`; dot, not colon: BullMQ rejects `:` in queue names).
- **Video renders must not share the generic `isobash-queue`.** `apps/worker/src/main.ts` is a stub that logs and completes every job it sees, including `video-render`, and the 3001 API's own worker could pick the job up and fail it with `NO_ELIGIBLE_MODEL` when it has no key for that provider. Both happened during Phase 15 and together they looked like a broken adapter. `QueueService.addJob(..., queueName)` and `createWorker(..., queueName)` now carry the name through, `getJobCounts`/`getWorkers` aggregate over every queue the process touched, and `AiRouterService.resolveVideoProvider(model?)` resolves the renderer *before* enqueueing so the producer always knows whose queue to use; a worker is only created for a provider this process can really render, and a generation falls back to in-process execution when there is no renderer or no Redis.
- The last three failing checks of a Phase 15 run were **the desktop being out of memory, not code**: at100% CPU with ~616 MB free, requests took 8-20 s, Redis answered `no response within 5000ms`, and the supervisor cycled 3000/3001. Re-running once the box was quiet gave 54/54 with no source change. The Magic Hour fixture now records `state.requests` (every method+path it served) and the three provider-facing checks print it on failure, so "the fixture was never called" is diagnosable from the summary line alone.
- **Another writer is active in this tree again.** On 2026-09-30 ~11:42 an `npm run build:frontend`
  ran that was not mine, `apps/backend/src/ai/gemini.provider.ts` changed under a running
  `tsc --noEmit` (one pass failed on a `HEALTH_PROBE_MAX_OUTPUT_TOKENS` reference ten lines
  away from where the error pointed; the next pass was clean), and the browser was driving the
  app throughout. That rebuild also took 3000 down for ~10 minutes, which failed all 14 frontend
  checks of `verify:phase1` while its backend/queue/realtime checks passed. Re-check `git status`
  and mtimes, and treat a frontend `fetch failed` storm as "the web is mid-rebuild", not a
  regression.
- All services verified live: frontend (3000), backend (3001), PostgreSQL (5432), Redis 5 (6380), Ollama (11434), BullMQ worker, Socket.IO.
- Frontend lint/typecheck are clean again (eslint 0 errors, 0 warnings; `tsc --noEmit` green for backend and frontend). Fixed against the React Compiler rules shipped with `eslint-config-next` 16 (`react-hooks/set-state-in-effect`): data fetching moved to promise chains whose `setState` runs in `.then` (see `capabilities-panel.tsx` for the canonical shape), and `theme-toggle.tsx` derives the theme from the DOM via `useSyncExternalStore` + `MutationObserver` instead of setting state on mount. Logo rendered through `components/brand-logo.tsx` (`next/image`) in all four shells.
- **Someone else is editing this working tree concurrently.** At 2026-09-28 23:53-00:00 (during the Phase 13 verification run) `theme-toggle.tsx`, `hero-slider.tsx`, `marketing-hero.tsx`, `marketing-navbar.tsx` and `globals.css` were rewritten by another writer. Their `theme-toggle.tsx` was an older `setMounted`/`setIsLight` implementation, which I replaced with the `useSyncExternalStore` form above, and their `hero-slider.tsx` passed a `totalSlides` prop that the component never used, which I removed from the component and from `marketing-hero.tsx` (the dots already derive from `HERO_SLIDES`). Re-check `git status` and file mtimes before assuming a diff is yours.

## Stack

- Frontend: Next.js 16, React, TypeScript, Tailwind CSS v4
- Backend: Node.js, NestJS 10, TypeScript
- Database: PostgreSQL (Laragon), Prisma 5
- Jobs: Redis 5.0.14.1 (port 6380), BullMQ 5
- Realtime: Socket.IO
- Local AI: Ollama with `llama3.2:latest` (chat) and `nomic-embed-text:latest` (embeddings)
- Workspace: `C:\laragon\www\Isobash`

## Implemented structure

- `apps/frontend`: Next.js app, landing, auth, `/app` and `/admin` route groups with layouts, loading + error boundaries, live dashboard panels, surfaces (chat, research, agents, projects, files, media, billing, settings); `components/` (ui primitives + page-header, sidebar-nav, theme-toggle, feature-card, route-error, health-panel, capabilities-panel, system-health-panel) and `lib/api.ts` (`getJsonAuthed` for credentialed admin fetch) + `lib/auth-server.ts` (`requireUser`, `requireAdmin`)
- `apps/backend`: NestJS API: `src/ai` (provider bridge incl. Ollama/Gemini/OpenAI + `normalizeRequest`, streaming, tools registry), `src/chat` (conversation/message persistence, SSE streaming), `src/auth` (register/login/logout/me, bcrypt hashing, httpOnly session cookies, AuthGuard + RolesGuard with `@Roles()` + CurrentUser, MFA endpoints + 2-step login), `src/security` (TOTP, SecretCipher, AuditService, RateLimitService, RateLimitGuard, SecurityHeadersMiddleware), `src/admin` (system-health service + `@Roles('ADMIN')`-gated controller), `src/realtime` (cookie-identified gateway, room authorization, session + user-scoped emitters), `src/agents` (agent config + run engine), `src/memory`, `src/projects`, `src/research` (Brave search, SSRF-hardened retrieval, citation-checked synthesis), `src/files` (upload validation, storage, extraction, chunking, embedding, BM25 + cosine knowledge search), `src/media` (image generation runs, byte sniffing, media library), `src/shared/config` (typed env, fail-fast), `src/shared/storage` (externalized roots, traversal-safe), `src/shared/logging` (structured HTTP log + `x-request-id`), `src/shared/errors` (normalized error filter incl. `FORBIDDEN`, `RATE_LIMITED`), `src/prisma`, `src/queues`
- `apps/worker`: BullMQ worker
- `apps/frontend` (Phase 8 additions): `lib/auth.ts` (`SessionUser.mfaEnabled`), `lib/auth-client.ts` (mfa-aware `submitCredentials` + `verifyMfaToken`), `login-form.tsx` OTP step, `mfa-settings.tsx` TOTP panel on `/app/settings`, `next.config.ts` dev/prod CSP + security headers; hero on `app/page.tsx` now a two-column layout with Unsplash AI-workspace art + "Local-first · Cloud-ready" badge (no hardcoded status claims)
- `prisma`: schema (User/Session/Project/Task/Notification/Conversation/Message/AuditEvent + Agent/AgentRun/AgentStep/MemoryEntry + ResearchSession/ResearchSource/ResearchCitation + StoredFile/FileChunk + ImageGeneration/MediaAsset) + migrations
- `scripts/`: `clean-dev.js` (preflight port cleanup), `verify-phase1.mjs`, `verify-phase3.mjs`, `verify-phase5.mjs`, `verify-phase6.mjs`, `verify-phase7.mjs`, `verify-phase8.mjs`, `verify-phase10.mjs`, `verify-phase11.mjs`, `verify-phase12.mjs`, `verify-phase13.mjs`, `db-generate.mjs`
- `docs/`: ARCHITECTURE, LOCAL-DEVELOPMENT, PROVIDERS, README

## Backend endpoints

- `GET /health`: component health (database, redis)
- `GET /admin/system-health`: ADVANCED, admin-only: live `frontend / backend / database / redis / job-queue / ollama` components with status, detail, and latencyMs; `401` without a session, `403 FORBIDDEN` for non-admins.
- `GET /ai/providers`, `GET /ai/providers/health`, `GET /ai/models`, `GET /ai/capabilities`, `GET /ai/tools`
- `POST /ai/generate`: validated DTO; `400 VALIDATION_FAILED` on invalid input
- `POST /chat/stream`: validated DTO; NDJSON events `meta` → `delta`* → `done`/`error`; requires `x-client-session`; `400` on missing/invalid input
- `GET /chat/conversations`, `GET /chat/conversations/:id`, `DELETE /chat/conversations/:id`: client-session ownership enforced (404 otherwise)
- `POST /auth/register`: `201`, sets httpOnly `isobash_session` cookie; rate-limited (30/15min per IP); duplicate email → `409 CONFLICT`
- `POST /auth/login`: `201`, fresh session cookie; bad credentials → `401 UNAUTHORIZED`; rate-limited; MFA-enabled accounts return `{ mfaRequired: true, mfaToken }` (no cookie until verified); per-account failure lockout after 5 bad tries (6th → `429 RATE_LIMITED`; a valid password still reaches the MFA step)
- `POST /auth/mfa/verify`: TOTP completes the 2-step sign-in (per-IP budget 10/15min); `401 UNAUTHORIZED` on bad/expired code
- `POST /auth/mfa/setup`: requires the current password; returns `{ secret, otpauthUrl }`; secret stored encrypted (AES-256-GCM + `APP_SECRET`)
- `POST /auth/mfa/enable`: validates a TOTP code, enables MFA, rotates every other session
- `POST /auth/mfa/disable`: validates a TOTP code, clears `mfaSecret` / `mfaEnabledAt`
- `POST /auth/logout`: revokes the server-side session and clears the cookie; `{ ok: true }`
- `GET /auth/me`: `{ user: SessionUser | null }`; never 401, resolves the cookie to a sanitized user (includes `mfaEnabled`)
- `GET /projects`, `GET /projects/:id`, `POST /projects`, `PATCH /projects/:id`, `DELETE /projects/:id`: owner-scoped, `404` across users; list includes tasks plus `agents`/`conversations`/`memories` counts
- `POST /projects/:id/tasks`, `PATCH /projects/tasks/:taskId`, `DELETE /projects/tasks/:taskId`: tasks append with an incrementing `order`; re-applying the current status is `400`; task ownership resolved through the project
- `GET /agents`, `GET /agents/:id`, `POST /agents`, `PATCH /agents/:id`, `DELETE /agents/:id`: unknown tool names `400`, `maxSteps` 1-12, `projectId` must be owned by the caller, delete cascades runs/steps/agent memories
- `POST /agents/:id/runs`: `201` with the run in `PENDING`/`PLANNING`; execution continues in-process; rate-limited 20/15min per user
- `GET /agents/:id/runs`, `GET /agents/runs/:runId`, `POST /agents/runs/:runId/cancel`: run + steps; cancelling a finished run is `400`
- `GET /memory`, `GET /memory/stats`, `POST /memory`, `DELETE /memory/:id`: keyword filter, per-kind counts, `content` max 2000 chars, rate-limited 120/15min
- `GET /research/capabilities`: `{ search: {available, provider, detail}, retrieval: {available, privateHostsAllowed, maxSources, maxCharactersPerSource, fetchTimeoutMs, detail} }`, reported honestly (no key = `available:false` with the reason)
- `GET /research`, `GET /research/:id`, `POST /research`, `DELETE /research/:id`: owner-scoped (404 across users), delete cascades sources+citations; `POST` rate-limited 20/15min per user, question 1-2000 chars, ≤6 absolute http(s) URLs, `projectId` must be owned
- `GET /files/capabilities`: the honest contract: `{ upload: {maxBytes, maxFilesPerUser, maxTotalBytesPerUser, types, detail}, extraction: {text, markdown, csv, json, html, pdf, images:false, officeAndArchives:false, maxExtractedCharacters, maxChunksPerFile, chunkSize, chunkOverlap, detail}, embeddings: {available, provider, model, dimensions, detail}, knowledge: {…} }`
- `GET /files`, `GET /files/:id`, `GET /files/:id/text` (`?limit=`, floored at 200), `GET /files/:id/download`, `POST /files` (multipart `file` + optional `projectId`), `POST /files/:id/reindex`, `DELETE /files/:id`: owner-scoped, 404 across users; upload rate-limited 30/15min; `kind`/`status`/`projectId`/`limit` list filters
- `GET /knowledge/search` (`q`, `limit`, `kind`, `projectId`), `GET /knowledge/stats`: search rate-limited 60/15min; response is `{query, terms, mode: keyword|vector|hybrid, detail, hits[], candidatesConsidered, tookMs}` and each hit carries `matchedBy` plus its keyword and vector scores
- New error codes from this phase: `UNSUPPORTED_MEDIA_TYPE`, `EMPTY_FILE`, `CONTENT_SIGNATURE_MISMATCH`, `FILE_TOO_LARGE`, `DUPLICATE_FILE`
- `GET /media/capabilities`: the honest contract: `generation {available, allProvidersHealthy, providers[{provider,status,healthDetail,circuit,stats}], models[{id,provider,autoSelectable,aliasOf}], aspectRatios, maxPromptCharacters, maxImagesPerRequest, maxImageBytes, maxAssetsPerUser, maxTotalBytesPerUser, generationsPerHour, detail}`, `moderation {enforced:'provider-reported', detail}`, `video {available:false, detail}`, `lastFailure` (this account's most recent real failure) and `usage {assets, storedBytes, generations}`
- `GET /media/generations`, `GET /media/generations/:id`, `POST /media/generations`, `POST /media/generations/:id/cancel`, `DELETE /media/generations/:id`: owner-scoped (404 across users); `POST` rate-limited 20/15min per IP, prompt ≤`MEDIA_MAX_PROMPT_CHARS`, aspect ratio from the allow-list, `count` 1-8, `projectId` must be owned; the response never contains `relativePath`
- `GET /media/assets`, `GET /media/assets/:id`, `GET /media/assets/:id/file` (`?download=` switches to an attachment), `DELETE /media/assets/:id`: bytes are SHA-256 verified on read (`500 ASSET_CORRUPT` when the file on disk no longer matches) and never leave an absolute path; deleting a generation removes its stored blobs too
- New error codes from this phase: `ASSET_CORRUPT`, `MEDIA_QUOTA_EXCEEDED` (413), plus the provider codes recorded on a failed run (`PROVIDER_REFUSED`, `EMPTY_PROVIDER_RESPONSE`, `GENERATION_FAILED`, `NO_ELIGIBLE_MODEL`, and whatever the provider returned, e.g. `RATE_LIMITED`)

## Auth model

- `Session` rows in PostgreSQL (uuid id, 30-day `expiresAt`, revocable `revokedAt`), cookie `isobash_session` httpOnly SameSite=Lax (30-day TTL); `AuthGuard` (any session) + `RolesGuard` (`@Roles('ADMIN')`, else `403 FORBIDDEN`) plus `@CurrentUser()` ready for extended role entitlements.
- Bootstrap: the first account on an empty database registers as `ADMIN` so the admin surface is reachable; every later account defaults to `USER`. To grant admin in an existing DB, `UPDATE "User" SET role='ADMIN' WHERE email=...`.
- CORS is credentialed (`origin: true, credentials: true`) and `cookie-parser` is mounted; the frontend sends `credentials: "include"`.
- Duplicate email surfaced as 409 with `CONFLICT` code; wrong password and unknown email both return the generic `401 UNAUTHORIZED`.
- Password hashing: bcryptjs (pure JS, Windows-safe).
- TOTP MFA (RFC 6238): SHA-1 / 6 digits / 30s step / ±1 window; secret `AES-256-GCM`-encrypted at rest (`APP_SECRET` required, fail-fast); pending-login tokens in-memory (3-min TTL, 20 max attempts per token, a single-instance limitation); enabling MFA rotates every other session; MFA is available to any account (not admin-only).
- Rate limits (Redis-backed, in-memory fallback): register 30/15min per IP, login 30/15min per IP, mfa verify 10/15min per IP, login-failure lockout 5/15min per email; `x-ratelimit-limit/-remaining` + `retry-after` headers; 429 → `RATE_LIMITED`. Defaults tunable via `RATE_LIMIT_*` env vars.
- Audit: `AuditEvent` rows (category `AUTH`/`AUTHORIZATION`/`ADMIN`/`SECURITY`, action, actor, ip, user-agent, JSON metadata); `login_failed` stores only a hashed email fragment. RolesGuard allow → `ADMIN/admin_access`, deny → `AUTHORIZATION/forbidden`.
- Security headers: backend middleware (nosniff, `X-Frame-Options: DENY`, referrer-policy, permissions-policy, COOP/CORP same-origin, CSP `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`, HSTS over HTTPS/prod) + frontend `next.config.ts` CSP (relaxed in dev for Turbopack). CSRF posture = same-site cookies (SameSite=Lax, HttpOnly) + no CORS wildcard.

## Realtime events

- Gateway: `ping`→`pong`, `join-room`, `task-created`, `notification`
- `chat:updated` broadcast to room `session:<clientSessionId>` after assistant message persistence (via `RealtimeService.emitToSession`)
- Phase 10: the socket is identified from its session cookie on connect; `join-room` authorizes `user:<own id>` and unclaimed `session:<id>` and answers `joined-room` with `{ room, joined, reason }` (identity resolution is awaited before any message is judged, so an owner's first message is not denied by a race)
- `agent:run` progress to room `user:<id>` via `RealtimeService.emitToUser` (PLANNING, RUNNING + per-step status, COMPLETED/FAILED/CANCELLED)
- `file:update` to room `user:<id>` for indexing progress (`PENDING`/`PROCESSING`, then `READY` with chunk count, characters and whether embedding succeeded), and the frontend still polls, as it does for agent runs
- `media:generation` to room `user:<id>` for each generation transition (`PENDING`/`RUNNING` + per-asset `assetId`, then `COMPLETED`/`FAILED`/`CANCELLED` with the code and error), and the media panel polls the open run, as it does for agent runs

## Error format (all responses)

```json
{ "error": { "code": "...", "message": "...", "status": 400, "requestId": "uuid", "path": "...", "timestamp": "..." } }
```

Errors: `UNAUTHORIZED`=401, `FORBIDDEN`=403 (admin gate), `CONFLICT`=409, `VALIDATION_FAILED`=400, `NOT_FOUND`=404, `RATE_LIMITED`=429, `FILE_TOO_LARGE`=413 (upload, named explicitly so multer's size error is not reported as a generic validation slip), plus the Phase 12 upload codes above.

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
node scripts/verify-phase10.mjs  # 66-67 checks: tool catalogue, projects/tasks + ownership, memory store, agent CRUD validation, a real agent run (model plan -> tool -> synthesis, rows + audits in Postgres), cancellation, socket.io room authorization
node scripts/verify-phase11.mjs  # 35 checks (RESEARCH_ALLOW_PRIVATE_HOSTS=true) / 29 hardened: capabilities contract, session CRUD, real page retrieval (local fixture), redirect following, script/style stripping, verified citations, honest NO_SOURCES/ANSWER_UNCITED failures, SSRF refusal, ownership, cascade
node scripts/verify-phase12.mjs  # 64 checks: capabilities contract, upload validation (allow-list, no-extension, empty, NUL bytes, byte-signature mismatches in both directions), real extraction for md/csv/json/html/pdf, honest non-indexing of images and ZIP-based office documents, dedupe, traversal-name sanitising, owner scoping (404 not 403), project attach, chunking, keyword + vector search with the relevance floor, reindex, cascade + disk delete, audit rows
node scripts/verify-phase13.mjs  # 82 checks (+5 reported skips): auth on every media route, the capabilities contract, validation (empty/over-long prompt, bad ratio, count 0 and over the ceiling, path-shaped model, foreign project, missing prompt), a real run that terminates, a pinned unknown model failing with the provider's own answer, cancel, 404-not-403 ownership, the storage path (fixture bytes served back byte-for-byte, sniffed type, nosniff, inline vs attachment disposition, checksum corruption refused, cascade, row removal), the byte sniffer against hand-built PNG/GIF/JPEG/WebP containers and three refusals, and the full generation path end to end against a Gemini-shaped fixture reached through GEMINI_API_BASE_URL (COMPLETED, sniffed type and dimensions, size/checksum, disk blob, byte-for-byte serving, library listing, count: 2, and the text-only / refusal / provider-error failure directions)
```

All exit non-zero on failure. Last run (2026-09-29, live stack on 3000/3001): all green, 23 + 9 + 24 + 24 + 10 + 40 + 66 + 29 + 64 + 62 = 351 checks. `npm run typecheck` and `npm run lint` also green.

The verify scripts honour `API_URL`/`WEB_URL`, which is how Phase 10 was verified against a
freshly built API on port 3006 while the SYSTEM-owned supervisor on 3001 kept running the
previous build (see the services note below).

## Phase 10 (agents, governed tools, memory, projects)

- Models added: `Agent` (config: instructions, `providerModel`, `maxSteps`, `toolNames`, `memoryEnabled`, optional `projectId`), `AgentRun` (state machine, `plan` JSON, `provider`/`model`, `stepsExecuted`, `cancelRequestedAt`, `error`), `AgentStep` (per-step status/duration/error, unique on `runId+position`), `MemoryEntry` (kind FACT/PREFERENCE/SUMMARY/NOTE, source, `sourceId`, `lastAccessedAt`). `Task` gained `order`/`result`/`agentRunId`; `Conversation` gained `userId`/`projectId`. Migration `20260927203610_phase10_agents_memory`, applied.
- Runner (`agents/agent-runner.service.ts`): `PENDING → PLANNING → RUNNING → COMPLETED|FAILED|CANCELLED`, executed in-process (BullMQ relocation is Phase 15). The plan is a **real model call in JSON mode**; an unusable plan fails the run with `PLAN_INVALID` plus the raw output. No synthetic fallback plan. One bounded repair attempt re-prompts with the rejection reason (small models often name a tool that does not exist); after that the run fails honestly. Provider/model are recorded on the run before validation so a `PLAN_INVALID` run still says which model misbehaved. `stepsExecuted` counts attempts, not successes. Cancellation is cooperative (AbortController checked between steps) and a cancelled run keeps its partial transcript. A completed run writes a `SUMMARY` memory tagged `source='agent_run'`, `sourceId=<runId>`.
- Tool registry is now governed: allow-list → argument-size ceiling → `authorize` → `validate` → `Promise.race` timeout → audit (`agent_tool_invoked` / `agent_tool_failed`). Five tools ship: `datetime.now`, `math.evaluate` (own recursive-descent parser, no `eval`), `memory.search`, `memory.write`, `task.create` (refuses when the agent has no project, re-checks project ownership). Agents cannot reference unknown tools: they are validated against the live registry, ≤12 tools, `maxSteps` 1-12.
- Memory validation errors are `400 BAD_REQUEST`; project/task/agent/memory reads are owner-scoped and return 404 (not 403) across users.
- Socket.io is now authorization-aware: the session cookie is resolved to an identity once per socket, `join-room` only allows `user:<own id>` and an unclaimed `session:<clientSessionId>`, and the decision is returned as `{ event: 'joined-room', data: { room, joined, reason } }`. `RealtimeService.emitToUser` publishes `agent:run` progress to `user:<id>`.
- **Nest Socket.IO gotcha:** the platform adapter emits a returned `{ event, data }` object on `event` with `data` as the payload and *ignores the ack callback* (see `node_modules/@nestjs/platform-socket.io/adapters/io-adapter.js`). Returning `{ event, room, joined }` silently sends `undefined`; every response must nest its fields under `data`, and clients must await an emitted event rather than an ack.

## Phase 11 (retrieval-backed research with checked citations)

- Models added: `ResearchSession` (state machine `PENDING → SEARCHING → RETRIEVING → ANSWERING → COMPLETED|FAILED`, `answer`, `noEvidence`, `retrieval`, `queries`, `provider`/`model`, `error`, timestamps), `ResearchSource` (requested `url`, `finalUrl` after redirects, `title`, `host`, `status`, `detail`, `httpStatus`, extracted `content`, `characters`, `origin`), `ResearchCitation` (unique `sessionId+marker`, `quote`, `verified`). Migrations `20260928004147_phase11_research`, `20260928005322_phase11_research_final_url`, `20260928011043_phase11_research_no_evidence`, applied.
- `SearchService` is a real Brave call (`BRAVE_SEARCH_API_KEY`); with no key it returns `available:false` **with the reason** and research falls back to caller-supplied URLs. It never invents results.
- `WebRetrievalService` is the SSRF boundary: DNS-resolves the host, checks every returned address against loopback/private/link-local/CGNAT/multicast/ULA ranges (IPv4-mapped IPv6 included), re-checks on each of ≤3 redirect hops, refuses non-http(s) schemes, credential-bearing URLs, non html/text content types, bodies over 2 MB, and enforces `RESEARCH_FETCH_TIMEOUT_MS`. `RESEARCH_ALLOW_PRIVATE_HOSTS=true` exists only for fixture verification.
- The answer is synthesised **only** from the fetched text, in JSON mode, and every citation quote is matched (whitespace-tolerant) against that text: a quote that cannot be found is stored with `verified:false` rather than presented as evidence. A model that answers without a marker gets exactly one repair attempt, then the run fails `ANSWER_UNCITED`. No uncited answer is ever stored. `verdict:"not_covered"` is honoured as an honest "the sources do not answer this" (answer kept, `citations` emptied, `noEvidence:true`) so it cannot smuggle in an uncited answer.
- Failures are recorded, never dropped: a refused/dead URL becomes a `ResearchSource` row with `status:FAILED` and `detail:"CODE: message"`. Nothing retrievable → run fails with `NO_SOURCES: <first real reason>`, and no answer is invented.
- `realtime.emitToUser(userId,'research:update',{sessionId,status,…})` publishes progress; the frontend polls the open session (same pattern as the agent run) and renders verified vs unverified citations.
- Verification: `RESEARCH_ALLOW_PRIVATE_HOSTS=true` → 35/35 (real fetch, redirect followed, script/style stripped, 2/2 citations verified, model recorded); default hardened mode → 29/29 (loopback and 169.254.169.254 refused with `PRIVATE_ADDRESS`, no answer written).

## Phase 12 (files, documents, and the knowledge index)

- Models added: `StoredFile` (uploader-chosen `originalName` that is **never** used as a path, server-generated `relativePath`, `kind` decided from the bytes, `sha256` unique per user, `FileStatus PENDING → PROCESSING → READY|FAILED`, `error` for failure and `warning` for a partial index, `extractable`, `extractedText`, `characters`, `chunkCount`, `truncated`, `embeddingModel`/`embeddedAt`, optional `projectId`), `FileChunk` (1-based `ordinal`, `content`, `tokenEstimate`, JSONB `embedding`). Migrations `20260928200344_phase12_files` and `20260928201518_phase12_file_chunk_count` (the second only adds the denormalised `chunkCount`), applied. Chunks cascade with their file.
- Validation is the security boundary (`files/file-kinds.ts`): extension allow-list, then **byte signature in both directions**. A text file renamed `.pdf`/`.png`/`.zip` is refused, and a PDF renamed `.txt` is refused too, because a PDF is frequently valid UTF-8 as a byte stream, so a signature check written only as "does it look like some other format" would store it as text. Text formats must decode as UTF-8 (NUL bytes refused). Filenames are sanitised for display only; the stored path is always `user-<id>/<YYYY-MM>/<uuid>.<ext>`, so a traversal-shaped name cannot escape the upload root. Per-user file count, total-byte quota, per-file ceiling, and exact-duplicate (`sha256`) rejection all return typed codes (`UNSUPPORTED_MEDIA_TYPE`, `EMPTY_FILE`, `CONTENT_SIGNATURE_MISMATCH`, `FILE_TOO_LARGE`, `DUPLICATE_FILE`).
- Extraction is real, and says what it cannot do (`document-extractor.service.ts`): text/markdown/log as UTF-8, CSV through an RFC-4180-ish reader (quoted commas and embedded newlines survive) flattened to `header: value` rows, JSON flattened to `path: value` lines, HTML to text, PDF through **pdf.js** (`pdf-parse`) including the text layer. Images and ZIP-based office documents are stored and downloadable with `extractable:false` and a `warning`. OCR is not available and a PDF with no text layer says so instead of indexing nothing quietly. `extractHtmlText` is now shared with Phase 11 web retrieval (`shared/text/document-text.ts`) and also drops `nav`/`footer`/`header`/`aside` chrome, which otherwise dilutes every similarity score.
- Indexing runs in the background after the bytes are stored: `PENDING → PROCESSING → READY|FAILED`, chunks replaced atomically per file, progress published on `file:update` to `user:<id>`. The stored `embeddingModel` is the model that actually answered the batch, not the configured string.
- Retrieval is two real scorers, never one faked as the other (`knowledge.service.ts`): BM25 keyword ranking with document frequencies read from PostgreSQL, plus in-process cosine over the stored embeddings (no pgvector dependency), fused 50/50. Every hit carries `matchedBy` (`keyword`/`vector`/`hybrid`) with both scores, and the response states in `detail` whether vector similarity ran and how many chunks it covered. Owner-scoped: another user's file answers **404, not 403**.
- **Calibrated relevance floor:** a query that means nothing still scores 0.40-0.51 cosine against every chunk, so a dense search with no floor always answers and "nothing matches" becomes indistinguishable from "here is the least irrelevant chunk". `FILES_MIN_VECTOR_SIMILARITY` (0.55) plus `FILES_MIN_VECTOR_MARGIN` (0.06, the best must lead the rest) are set from measured nomic-embed-text numbers: genuine matches measured 0.58-0.70, nonsense 0.40-0.51. Both the floor and the count that cleared it are reported.
- Embeddings came from the AI bridge: optional `embed()` on the provider contract, `AiRouterService.embed()` with the same failover as chat, and `embed()` implementations for Ollama (`/api/embed`), Gemini (`:embedContent`) and OpenAI (`/embeddings`). `nomic-embed-text` was pulled locally so the vector path is verified for real rather than only its absence.
- Every read is owner-scoped, absolute paths never leave the process, the download header is ASCII-quoted, and multer's size limit is enforced **while the body is still being read** (`413 FILE_TOO_LARGE`, named explicitly in the error filter so it is not reported as a generic validation slip).
- Verification: `verify-phase12.mjs` 64/64 against a real PostgreSQL and a real embedding model, including a hand-built single-page PDF with a valid xref table so pdf.js extraction is exercised rather than asserted. It asserts the honest-reporting property in both directions: with embeddings available, `mode` must be `hybrid`/`vector`; without one, the response must say vector similarity did not run.

## Phase 13 (media: image generation and the media library)

- Models added: `ImageGeneration` (state machine `PENDING → RUNNING → COMPLETED|FAILED|CANCELLED`, `prompt`, nullable `aspectRatio`, `requestedCount`, `error`/`errorCode`, `warning` for a partial result, the provider's own `finishReason`, `provider`/`model`, token counts, `cancelRequestedAt`, timestamps, optional `projectId`), `MediaAsset` (server-generated `relativePath`, `kind`, `mimeType`, `sizeBytes`, `width`/`height`, `sha256`, provider `note`, copied `prompt`/`aspectRatio`, optional `generationId`/`projectId`). Migrations `20260929030415_phase13_media` and `20260929031024_phase13_media_warning` (the second adds the `warning` column), applied.
- `ImageGenerationService` (`media/image-generation.service.ts`): `PENDING → RUNNING → COMPLETED|FAILED|CANCELLED`, executed in-process (BullMQ relocation is Phase 15, which is why `cancel` is honoured at checkpoints rather than by aborting a provider call already in flight). Four rules hold: an asset row exists only after its bytes are on disk; a run is COMPLETED only when at least one image was really produced; a provider refusal, a quota refusal and a crash are all FAILED carrying the provider's own code and message; a short result is COMPLETED **and** says so in `warning`, so a partial is never read as a full one. A failed run keeps `provider`/`model` null. It never claims a model answered.
- **The stored type and dimensions are read from the bytes, not from the provider's claim** (`media/media-images.ts`): PNG from IHDR, GIF from the logical screen descriptor, WebP only when the RIFF payload is really `WEBP` (VP8X/VP8L/VP8), JPEG by walking marker segments to the frame header. Anything else (a text payload, a truncated file, a non-WebP RIFF) is refused, and unmeasurable dimensions stay `null` instead of being guessed from the requested aspect ratio.
- `capabilities` is the honest contract and separates two things that are easy to conflate: `available` means a provider is registered and not `unconfigured`, while `allProvidersHealthy` is reported separately precisely because each adapter derives health from the capability it was written for, so a healthy Gemini there is a statement about its *text* model. Being registered is never presented as proof the key can pay. `lastFailure` carries what this account actually got back. `moderation.enforced` is the literal string `provider-reported`; ISOBASH runs no classifier and does not claim to have screened anything. `video.available` is `false` with the reason, never implied.
- Bytes are served only through `GET /media/assets/:id/file`: authenticated, owner-scoped (404, not 403), SHA-256 re-checked against the file on disk so a damaged blob is reported (`500 ASSET_CORRUPT`) rather than served, `nosniff`, `no-store`, and an ASCII-quoted `content-disposition` built from the server-generated id. Absolute paths never leave the process and `relativePath` is never in an API response. A stored path is always `user-<id>/<YYYY-MM>/<uuid>.<ext>`.
- Frontend: `components/media-panel.tsx` on the real `/app/media` surface: prompt/aspect/count/model/project form that is disabled with the reason when no provider is registered, live polling of an open run (never reported finished at the moment the request is accepted), per-run status with the provider's error and any partial-result warning, a capability card that shows provider status, circuit and limits, the moderation and video answers, and `lastFailure`, plus a media library grid with the real bytes, sniffed dimensions, size, download and delete. `lib/api.ts` gained the media client (`mediaAssetUrl` / `mediaAssetDownloadUrl` for the byte route).
- **Two security-header changes were required to render the bytes at all**, both narrow: the media file route overrides the global `Cross-Origin-Resource-Policy: same-origin` with `same-site` (the app is a different port, hence cross-origin, so `same-origin` blocked every thumbnail), and the frontend CSP `img-src` gained the API origin (it was already in `connect-src`) plus `blob:`. `next/image` is deliberately *not* used for these: its optimizer fetches server-side without cookies and would get a 401, so the panel uses `<img>` with the same `eslint-disable` pattern as `hero-slider.tsx`.
- Runs execute in this process and are single-instance, exactly like agent runs and file indexing, until Phase 15.
- **Three renderers can be registered** for `image-generation`, and the router picks between them: `gemini`
  (`gemini-3.1-flash-image`, needs image quota, and this key has none), `pollinations`
  (`POLLINATIONS_ENABLED=true`, key-less public endpoint, **anonymous quota ≈ 1 image per window per IP**: the first
  request returns a real JPEG, the next answers `402`, which is classified `RATE_LIMITED`), and `openai`
  (`OPENAI_IMAGE_ENABLED`, `gpt-image-1`, needs a key with credit). The Pollinations adapter sends the prompt in the
  path, asks for real pixels at the requested aspect ratio, uses a per-image seed so `count: 3` is three different
  renders, caps the body at 25 MB and the wait at 120 s, and reports the provider's own status (`402/429 →
  RATE_LIMITED`, `401/403 → INVALID_API_KEY`, `404 → MODEL_NOT_AVAILABLE`, `5xx → PROVIDER_OVERLOADED`). Its
  `content-type` is treated as a *claim*: the media service sniffs the bytes, so a wrong header cannot become a wrong
  `mimeType`. Enabling it is opt-in because it renders prompts on someone else's infrastructure.
- **Image failover is allowed but never silent** (`isImageFailoverAllowed` in `ai/routing.types.ts`): when the caller
  pinned nothing, a provider that refuses (zero quota, bad key, retired model) no longer ends the run if another
  eligible renderer exists, because a deployment with a working second renderer must be able to draw. The substitution
  is disclosed: the response carries `failovers[]`, the run stores it in `warning`, and a failed run names *every*
  renderer tried (`Every eligible renderer was tried: …`) instead of only the last one. A pinned `provider:model` is
  still strict and never touches another provider, and the **text** path keeps the old no-failover-on-quota rule.
- Verification: `verify-phase13.mjs` 86/86 with 5 skips reported loudly. The skipped checks are the hourly-quota check
   (needs `MEDIA_MAX_GENERATIONS_PER_HOUR=2` at start) and, when no live renderer can pay, the two live checks. **The
   completion path is executed on every run**: `gemini.provider.ts` resolves its endpoint from `GEMINI_API_BASE_URL`
   (defaulting to Google, the same override style as `OLLAMA_BASE_URL`/`OPENAI_BASE_URL`, with no branch on it), and the
   verifier starts a second API instance on a spare port against a fixture that answers with real PNG bytes in Gemini's
   shape. That pass asserts, with the shipped code: the run reaches `COMPLETED`, records provider/model/finish reason,
   attaches exactly one asset, stores `image/png` at 6x4 read from the bytes while the *request* said `1:1`, records the
   true size and SHA-256, keeps the provider's note, exposes no path, writes the correct PostgreSQL row and a real blob
   under `MEDIA_ROOT`, serves the bytes back byte-for-byte with the sniffed type and length, lists it in the library,
   sends `responseModalities: ["TEXT","IMAGE"]` with the prompt verbatim, stores two assets for `count: 2`, fails
   correctly on a text-only answer (`EMPTY_PROVIDER_RESPONSE`), a provider refusal (`PROVIDER_REFUSED` +
   `IMAGE_SAFETY`) and a provider HTTP error (`PROVIDER_REQUEST_FAILED`), never leaving an asset behind, and cleans
   every rendered file up again so a run leaves `MEDIA_ROOT` empty. A **live** third-party render is checked too when
   one can pay, and the live-provider failure direction is always verified: a run that produces nothing is FAILED with
   the provider's own code, keeps its message, writes no asset, names no model, and shows up as `lastFailure`.

## Frontend conventions (Next 16 / React 19.2)
- `eslint-config-next` 16 enables the React Compiler lint rules; they are errors, not warnings, so `npm run lint` must pass before committing.
- Never call `setState` synchronously in an effect body (direct or through a wrapper function). Kick off the request and set state inside `.then`/`.catch`, as in `capabilities-panel.tsx`. The rule is stricter than it looks: a `try { … } finally { setState(…) }` is flagged too, because the `finally` can complete synchronously if the call before the first `await` throws. Promise chains (`.then(...).catch(...).finally(...)`) are fine.
- For DOM-derived state (e.g. the `dark` class on `<html>`) read it with `useSyncExternalStore` + `MutationObserver`, with a server snapshot for SSR.
- Use `next/image` for local assets; `<img>` triggers `@next/next/no-img-element`. The one exception is bytes that must arrive with the session cookie (media assets): the optimizer fetches server-side without credentials, so those use `<img>` plus the `eslint-disable` line, as in `marketing/hero-slider.tsx`.
- The frontend CSP is strict (`img-src 'self' data: https://images.unsplash.com`). Anything new that renders an image from another origin has to add that origin to `img-src` in `next.config.ts`, and the backend's own `Cross-Origin-Resource-Policy: same-origin` will block a cross-port image load until the serving route relaxes it to `same-site`.

## Important Windows note

The running backend process locks `node_modules\.prisma\client\query_engine-windows.dll.node`, so `npx prisma generate` fails with EPERM while the API is live. `scripts/db-generate.mjs` (root script `npm run db:generate:live`) works around it: it generates to a temporary output directory, copies the generated files into `node_modules/.prisma/client`, and deliberately leaves the locked query engine in place. Use it instead of stopping the SYSTEM-owned service.

## Start commands

From `C:\laragon\www\Isobash`: `npm run dev`

Preflight `npm run clean:dev` clears stale listeners on 3000-3005. PostgreSQL, Redis (port 6380), and Ollama must be running first.

## Services start notes

- Redis 5 (port 6380): `C:\laragon\bin\redis\redis-x64-5.0.14.1\redis-server.exe --port 6380 --bind 127.0.0.1 --dir C:\laragon\Isobash-Redis`
- Old Redis 3 service remains on 6379 (elevated), unused by the app.
- Ollama: start the Ollama app (serves 127.0.0.1:11434).
- Gemini chat provider: DONE, `gemini.provider.ts` implemented and registered
  (GEMINI_ENABLED/GEMINI_MODEL/GEMINI_API_KEY; `gemini-3.7-flash`, stable GA on the
  free tier. `gemini-2.5-flash` is retired for newly provisioned keys and answers
  404, so it must not be used as a default anywhere). `normalizeRequest` added to
  the provider registry so `provider` or `provider:model` request routing works for
  ollama/gemini/openai. Gemini health is verified live (`/ai/providers/health`
  reports `gemini=healthy`, 1,048,576 context window).
- **The running stack is owned by the SYSTEM account** (supervisor pid from the
  `ISOBASH-Service` scheduled task), so `npm run service:restart` and `taskkill` on the
  api/web pids fail with "Access is denied" from a normal shell, and the api keeps running
  the **previous build** until it is restarted. To exercise new backend code without
  elevation: `npm run build:backend`, then `PORT=3006 node apps/backend/dist/main.js` and
  run the verifiers with `API_URL=http://localhost:3006`. Restart the real stack with
  `npm run service:restart:elevated` (accept the UAC prompt) when the elevated path is
  available.
- **The supervisor kills a service that misses its health probe** (`PROBE_FAILURE_THRESHOLD`
  consecutive failures → `SIGTERM` + backoff restart), so a slow box turns into a visible
  restart loop: on 2026-09-29 PostgreSQL bounced, the api's probe failed, the web got slow
  enough (26 s for the first `/`) to miss its probe too, and both cycled while
  `GET /` returned `fetch failed` from the verifiers. Diagnosis order that worked:
  `node scripts/service.mjs status` (state/restarts/lastError), then
  `netstat -ano | findstr ":300"`, then `C:\laragon\www\ISOBASH-DATA\logs\service\web.log`.
  An **orphan `next start-server.js` can survive on port 3005** after a restart and hold
  memory until it is killed; check for it before concluding the web is simply slow. Once
  the database is back, the supervisor recovers on its own. No elevated restart is needed.
- Do not leave a hand-started `PORT=3006` API running while the verifiers run: the extra
  Node process plus the supervisor's own children are enough to push the web past its probe
  timeout. Stop it when the 3001 build already contains the change.
- **Never run `next build` while the managed web service is running.** The supervisor's
  `next start` holds `.next` open; a production build rewrites `.next` underneath it, so the
  live process keeps serving from a manifest that no longer matches the files on disk. The
  symptom is a `500` from pages that are correct in a clean build, and it is not fixed by
  waiting: on 2026-09-29 this left the web on 3000 serving an inconsistent bundle until the
  supervisor was restarted. Stop the stack (or build to a separate dist dir) first, and prefer
  `tsc --noEmit` + `eslint` for a type/lint check that needs no build at all. To confirm a
  build is good without disturbing the live service, start a throwaway instance on a spare
  port (`PORT=3999 npx next start -p 3999`) and probe it.
- The backend is safer than the frontend here but not immune: `nest build` writes into the
  same `dist/` the 3001 process is executing, so a build can interleave with a live request.
  Same rule applies, and `npm run build:backend` is what the 3001 process needs reloaded by.

## Next session priorities

1. Phases 1-8, 10, 11, 12 and 13 are implemented and runtime-verified (351 checks, all green).
   Phase 14 (video) is implemented too and `verify:phase14` is **59/59** (3 skips by design).
   Phase 15 (Magic Hour video provider, provider credit ledger, provider-scoped render queues)
   is implemented and **54/54**; typecheck, lint, backend unit tests (8 suites / 103) and the
   `verify:phase1` queue regression (23/23) are green on top of it.
   One open item on 13: its "prompt verbatim" image check now conflicts with the concurrent
   `NO_TEXT_CLAUSE` suffix (`apps/backend/src/media/image-styles.ts`), which is another writer's
   in-flight feature. That is their call to reconcile, not a regression to paper over.
   The master spec is **not** in this repo, so the remaining phases are defined by the surface
   pages: billing (16), admin center (17). The dashboard phase labels in
   `apps/frontend/app/app/page.tsx` were reconciled with the real order during Phase 12. Check
   them again before labelling anything new.
2. Agent runs, file indexing and image generation are **still in-process**; only video is on a
   worker queue today. Moving them onto BullMQ is the outstanding Phase 15 item: a restart
   mid-run cannot lose a run once a run lives in the queue. `QueueService.addJob`/`createWorker`
   already take a queue name, so give each of them a provider-free job type on a dedicated
   queue (one worker in `apps/worker/src/main.ts`) rather than the generic `isobash-queue`, or
   the same stub-vs-real-worker collision Phase 15 just fixed will come back. The runner bodies
   move as-is.
3. Documented limitations to revisit: pending-MFA sign-in tokens are in-memory (3-min TTL,
   20 attempts) and need Redis for horizontal scaling; agent runs, file indexing and image
   generation are single-instance. XLSX/PPTX/DOCX are stored but not parsed (they are ZIP
   containers; no claim is made that they are), and there is no OCR for scanned PDFs. The
   Gemini key in `.env` has a **zero free-tier image quota** (`Quota exceeded for metric:
   generate_content_free_tier_input_token_count, limit: 0`, verified against all four
   registered image models on 2026-09-29), so no *live* provider render is possible here.
   The completion path is nonetheless executed for real on every verification run: the
   provider's base URL honours `GEMINI_API_BASE_URL` (same seam as `OLLAMA_BASE_URL` /
   `OPENAI_BASE_URL`, unset in normal use, no branch in the provider), so
   `verify-phase13.mjs` starts a second API instance on a spare port pointed at a fixture
   that speaks Gemini's response shape. Everything else is the shipped code: adapter,
   router, generation service, sniffer, storage, read route, delete route, and the
   text-only / refusal / provider-error directions. A key with image quota is still
   needed before a *live* third-party render can be claimed.
4. Phase 14 (video) is implemented and covered by `npm run verify:phase14` (`scripts/verify-phase14.mjs`,
   59 checks). The sniffer, storage, byte-range route, lifecycle, validation, cancellation and
   deletion run for real. No provider is configured in this environment, so
   `capabilities.video.available` correctly stays `false` with its reason until something
   genuinely renders a video; the render path is exercised for real against a second API
   instance pointed at a Pollinations-shaped fixture, exactly as `verify-phase13.mjs` does for
   Gemini. **59/59 pass.** The 19 checks that were failing for a long time were never a code
   problem: they all hit the long-running 3000/3001 processes, which predated the video routes
   and had a wiped `.next`. A `service:restart:elevated` cleared all of them at once.
5. **Restart 3001 before trusting behaviour there.** `nest build` rewrites the `dist/` the live
   process already loaded, so a fix on disk is not live until the process restarts. To verify
   without a UAC prompt, boot a spare instance (`PORT=3006 node apps/backend/dist/main.js`) and
   run the verifiers with `API_URL=http://localhost:3006`, then stop it again — an extra Node
   process can otherwise push the web past its probe timeout.
6. `@StrictBoolean()` had a real bug worth remembering: it returned `undefined` for anything
   that was not `"true"`/`"false"`, and `@IsOptional()` skips validation on `undefined`, so a
   nonsense flag was indistinguishable from an absent one and was silently accepted as off. It
   now returns the value unchanged so `@IsBoolean()` can actually refuse it. Any future
   boolean DTO field must be declared `boolean | string` (see the decorator's docstring) or it
   loses this protection.
7. Continue phase-by-phase per the master spec. Do not skip phases or build fake functionality.
8. When starting: review git status and the master specification before writing code.