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

- `src/ai` — provider-agnostic AI bridge from Phase 2: capability registry, model registry, provider registry, and real adapters (Ollama; OpenAI-compatible when configured).
- `src/shared/config` — typed environment configuration. Missing/invalid environment variables fail the process at startup (fail-fast per secrets-management policy).
- `src/shared/storage` — filesystem storage abstraction over runtime roots with path-traversal-safe resolution.
- `src/shared/logging` — structured HTTP request logging with an `x-request-id` correlation header.
- `src/shared/errors` — global exception filter that normalizes every error response.
- `src/prisma` — Prisma client lifecycle.
- `src/queues` — Redis + BullMQ queue producer with job defaults (retries, backoff, retention).
- `src/app.gateway.ts` — Socket.IO gateway for realtime events.

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

`GET /health` reports real component status — database (Prisma `SELECT 1`) and Redis (PING) — returning `ok` only when both are healthy.

## Frontend

The UI is a single app with route groups: `/` (landing), `/login`, `/register`, `/app/*` (workspace shell with sidebar + mobile navigation), and `/admin/*` (admin shell). Light and dark mode use the ISOBASH brand tokens (primary `#3B82F6`, accent `#0EA5FF`, dark `#111827`, light `#F8FAFC`, gray `#6B7280`) and persist the choice in a cookie.

### Frontend layers (Phase 4)

- `components/ui/*` — primitives: `button`, `badge`, `card`, `skeleton`, `status-chip`, `icons`.
- `components/` — composition: `page-header`, `sidebar-nav`, `theme-toggle`, `feature-card`, `route-error`, `health-panel`, `capabilities-panel`.
- `lib/api.ts` — frontend API client (base URL from `NEXT_PUBLIC_API_URL`), normalized error extraction, always reads the live backend.
- Route groups each declare `loading.tsx` (server skeleton state) and `error.tsx` (client error boundary with `retry`).
- The `/app` workspace home is a real-state dashboard: `health-panel` fetches `/health` + `/ai/providers/health` (auto-refreshing) and `capabilities-panel` fetches `/ai/capabilities`. Both render live API data truthfully — no simulated state.

### Surface boundaries

Workspace surfaces (chat, research, agents, projects, files, media, billing, settings) are route shells with truthful empty states until their dedicated phase. Error and unavailable states reflect real backend responses.

## Phase boundaries

Phases 1–4 establish the foundation and complete product UI architecture: routes, provider bridge, infrastructure services, design system, and truthful empty states. AI workflows, authentication, authorization, media, and billing are implemented in their dedicated phases — nothing is simulated before it is real.