# Architecture

ISOBASH is a workspace monorepo built around four apps and shared infrastructure services.

## Applications

| App | Tech | Role |
| --- | --- | --- |
| `apps/frontend` | Next.js, React, TypeScript, Tailwind CSS | Web application and product UI |
| `apps/backend` | NestJS, TypeScript | API, AI engine, realtime, jobs producer |
| `apps/worker` | Node.js, BullMQ | Dedicated background job processor |

Runtime data (uploads, media, temp, logs, cache, knowledge, and models) is externalized outside the source tree via `ISOBASH-DATA/` and `ISOBASH-MODELS/`.

## Backend layers

- `src/auth`: authentication from Phase 6: bcrypt-hashed credentials, server-side `Session` rows, httpOnly `isobash_session` cookie (SameSite=Lax, 30-day TTL), `register`/`login`/`logout`/`me`, plus `AuthGuard`, `RolesGuard` with `@Roles()`, and `@CurrentUser()` for role gates. The first account registered on an empty database is bootstrapped as `ADMIN`.
- `src/ai`: provider-agnostic AI bridge from Phase 2: capability registry, model registry, provider registry, tool registry, and real adapters (Ollama with streaming; OpenAI-compatible when configured).
- `src/chat`: conversation orchestration: persists conversations and messages to PostgreSQL, drives the AI engine, and streams tokens over SSE (`POST /chat/stream`).
- `src/realtime`: Socket.IO gateway (connection/join/ping) plus a small `RealtimeService` that emits session-scoped events such as `chat:updated`.
- `src/shared/config`: typed environment configuration. Missing/invalid environment variables fail the process at startup (fail-fast per secrets-management policy).
- `src/shared/storage`: filesystem storage abstraction over runtime roots with path-traversal-safe resolution.
- `src/shared/logging`: structured HTTP request logging with an `x-request-id` correlation header.
- `src/shared/errors`: global exception filter that normalizes every error response.
- `src/prisma`: Prisma client lifecycle.
- `src/queues`: Redis + BullMQ queue producer with job defaults (retries, backoff, retention).
- `src/security`: Phase 8: TOTP (RFC 6238), AES-256-GCM secret cipher, `AuditService` (persistent `AuditEvent` trail), `RateLimitService` + `RateLimitGuard` (Redis-backed with in-memory fallback), and `SecurityHeadersMiddleware` (mounted globally for all routes). `src/auth` gained 2-step MFA sign-in, session rotation on MFA enable, per-account login-failure lockout, and the `mfa/*` endpoints; the error filter maps `429 → RATE_LIMITED`. See `docs/SECURITY.md` for the full posture.

## Chat engine (Phase 5)

- Each conversation is tied to a `clientSessionId` (from the `x-client-session` header the browser persists in localStorage until authentication binds it to an account). Ownership is enforced on every read/delete.
- `POST /chat/stream` validates the message DTO, persists the user message, streams provider tokens as newline-delimited JSON events (`meta` → `delta`* → `done`/`error`), and persists the assistant message with provider/model/usage metadata.
- Providers expose an optional `stream(request, signal)`; the registry picks a healthy provider for the capability and falls back to buffered execution. Streaming is abortable via `AbortSignal`.
- Realtime: after persistence the gateway broadcasts `chat:updated` to the session room; the conversation list refreshes from the server (no simulated state).
- `GET /ai/tools` reports the registered tool surface (truthfully empty until the agents phase registers tools).

## Authentication (Phase 6)

- `POST /auth/register` (email, password 8–72, optional name) hashes with bcryptjs and creates a `Session` row, returning the sanitized user and setting the `isobash_session` cookie. Duplicate email → `409 CONFLICT`.
- `POST /auth/login` validates credentials (generic message for unknown email or wrong password → `401 UNAUTHORIZED`) and issues a fresh session cookie.
- `POST /auth/logout` revokes the server-side session (row gains `revokedAt`) and clears the cookie.
- `GET /auth/me` always returns `{ user }`: the cookie resolves to a sanitized `{ id, email, name, role, createdAt }` or `null`. It never 401s, so the frontend can gate on it.
- The frontend gates `/app/*` and `/admin/*` server-side: each layout calls `requireUser()`, which verifies the cookie against `/auth/me` and `redirect`s to `/login`. The login and register pages are real forms; the header shows the signed-in user and a working sign-out button.
- The `/admin` layout additionally calls `requireAdmin()`, which redirects non-`ADMIN` sessions to `/app`. The public landing hero no longer contains a platform-status panel; that surface moved into the admin dashboard as the live `SystemHealthPanel`.
- Cookies work cross-port on localhost (`SameSite=Lax`); CORS is credentialed (`origin: true, credentials: true`) and the frontend sends `credentials: "include"`.
- Chat remains scoped to the browser-local `clientSessionId`; Phase 7 authorization layers roles/entitlements on top.

## Request pipeline

Request → `RequestLoggingMiddleware` (assigns `x-request-id`) → controller → service → normalized response.
Any error passes through `AllExceptionsFilter`, which emits a stable shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "...",
    "status": 400,
    "requestId": "uuid",
    "path": "/ai/generate",
    "timestamp": "..."
  }
}
```

## Health

`GET /health` reports real component status, database (Prisma `SELECT 1`) and Redis (PING), returning `ok` only when both are healthy.

## Admin system health

`GET /admin/system-health` is guarded by `AuthGuard` + `RolesGuard` (`@Roles('ADMIN')`; valid session required, else `401 UNAUTHORIZED`, non-admin `403 FORBIDDEN`). It checks six components live in parallel, each with status, detail, and latency in ms:

- `frontend`: HTTP GET of `WEB_URL` (the Next.js server)
- `backend`: the responding API itself
- `database`: Prisma `SELECT 1`
- `redis`: Redis `PING`
- `job-queue`: BullMQ `getJobCounts()` + `getWorkers()` (reports worker liveness and job counts)
- `ollama`: HTTP GET `OLLAMA_BASE_URL/api/tags` (reports installed model count)

No values are hardcoded. Individual checks run under a 5s timeout so a single stalled dependency can never hang the panel. The admin dashboard renders this as a live auto-refreshing `SystemHealthPanel` (10s interval, `credentials: "include"`).

## Frontend

The UI is a single app with route groups: `/` (landing), `/login`, `/register`, `/app/*` (workspace shell with sidebar + mobile navigation), and `/admin/*` (admin shell). Light and dark mode use the ISOBASH brand tokens (primary `#3B82F6`, accent `#0EA5FF`, dark `#111827`, light `#F8FAFC`, gray `#6B7280`) and persist the choice in a cookie.

### Frontend layers (Phase 4)

- `components/ui/*`: primitives: `button`, `badge`, `card`, `skeleton`, `status-chip`, `icons`.
- `components/`: composition: `page-header`, `sidebar-nav`, `theme-toggle`, `feature-card`, `route-error`, `health-panel`, `capabilities-panel`.
- `lib/api.ts`: frontend API client (base URL from `NEXT_PUBLIC_API_URL`), normalized error extraction, always reads the live backend.
- Route groups each declare `loading.tsx` (server skeleton state) and `error.tsx` (client error boundary with `retry`).
- The `/app` workspace home is a real-state dashboard: `health-panel` fetches `/health` + `/ai/providers/health` (auto-refreshing) and `capabilities-panel` fetches `/ai/capabilities`. Both render live API data truthfully, with no simulated state.

### Surface boundaries

Workspace surfaces (research, agents, projects, files, media, billing, settings) are route shells with truthful empty states until their dedicated phase. Chat is live from Phase 5: the `/app/chat` surface renders persisted conversations, streams responses token-by-token, and shows real API errors. From Phase 6 all workspace and admin surfaces sit behind a real login.

### Landing hero

`components/marketing/` is the public landing surface. `marketing-navbar.tsx` holds the logo,
theme toggle, `Sign in` and `Get started free`; it has no nav links. `marketing-hero.tsx` is a
**server component** (no state, no timer) and renders one static composition from
`hero-backdrop.tsx`.

`hero-backdrop.tsx` draws the whole hero in CSS and inline SVG: a vertical
`background`→`surface` wash, stacked radial glows, a `grid-bg` masked to the edges, three
rotated `.glass` panels, gradient hairlines, blurred light trails, an angled
`perspective(1600px) rotateY(17deg)` developer panel and abstract glass/circuitry bottom-right.
There is no `<img>` and no remote background — the hero renders identically with the network
off. All colours come from design tokens, so one geometry serves both themes; the text legibility
comes from a `radial-gradient` veil of `--background` at the centre rather than a heavy global
scrim. `app/globals.css` owns the reusable `.glass`/`.grid-bg`/`.noise-bg` helpers; per-hero
one-offs are arbitrary values in `hero-backdrop.tsx`.

Two mechanics to keep in mind when styling this surface: `globals.css` defines only a `light`
custom variant, so **`dark:` variants never fire** — write `light:*` against a dark default; and
the theme script reads its cookie before `localStorage`, so setting only `localStorage` and
reloading will not switch the theme. The `Sign in` label is brand blue via `text-blue-400!
light:text-blue-600!` because the `ghost` button variant's own colour utility wins on source
order otherwise.

`hero-slider.tsx`, `hero-capabilities.tsx` and `floating-cards.tsx` are unused by the current
hero and kept only as dead code.

## Phase boundaries

Phases 1–5 establish the foundation and live chat: routes, provider bridge, infrastructure services, design system, truthful empty states, and a real streaming, persisted chat surface. Phase 6 adds real authentication (register/login/logout with server-side sessions) and gates the product UI behind it. Admin role gating ships early with the system-health surface: the public hero panel was removed and rebuilt as a live, admin-only system health panel, and `AuthGuard`+`RolesGuard` with `requireAdmin()` enforce the `ADMIN` role server- and client-side. Phase 7 generalizes this into a reusable role/entitlement layer (`@Roles()` + `RolesGuard`). Full entitlements, media, and billing follow in their dedicated phases. Nothing else is simulated before it is real.