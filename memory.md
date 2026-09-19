# ISOBASH Project Memory

Last updated: 2026-09-19

## Current status

- Phase 1 (project foundation): implemented and runtime-verified.
- Phase 2 (AI provider bridge): implemented and runtime-verified.
- Phase 3 (core infrastructure/services): implemented and runtime-verified.
- Frontend visual redesign applied: ISOBASH brand identity (primary `#3B82F6`, accent `#0EA5FF`, dark `#111827`, light `#F8FAFC`, gray `#6B7280`), light/dark mode toggle with cookie persistence, responsive workspace and admin shells built on route layouts.
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

- `apps/frontend`: Next.js app — landing, auth, `/app` and `/admin` route groups with layouts; `components/` UI primitives (button, icons, page-header, placeholder-card, sidebar-nav, theme-toggle)
- `apps/backend`: NestJS API — `src/ai` (provider bridge), `src/shared/config` (typed env, fail-fast), `src/shared/storage` (externalized roots, traversal-safe), `src/shared/logging` (structured HTTP log + `x-request-id`), `src/shared/errors` (normalized error filter), `src/prisma`, `src/queues`, `src/app.gateway.ts`
- `apps/worker`: BullMQ worker
- `prisma`: schema + applied migration
- `scripts/`: `clean-dev.js` (preflight port cleanup), `verify-phase1.mjs`, `verify-phase3.mjs`
- `docs/`: ARCHITECTURE, LOCAL-DEVELOPMENT, PROVIDERS, README

## Backend endpoints

- `GET /health` — component health (database, redis)
- `GET /ai/providers`, `GET /ai/providers/health`, `GET /ai/models`, `GET /ai/capabilities`
- `POST /ai/generate` — validated DTO; `400 VALIDATION_FAILED` on invalid input

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
```

Both exit non-zero on failure. Last run: all green.

## Start commands

From `C:\laragon\www\Isobash`: `npm run dev`

Preflight `npm run clean:dev` clears stale listeners on 3000-3005. PostgreSQL, Redis (port 6380), and Ollama must be running first.

## Services start notes

- Redis 5 (port 6380): `C:\laragon\bin\redis\redis-x64-5.0.14.1\redis-server.exe --port 6380 --bind 127.0.0.1 --dir C:\laragon\Isobash-Redis`
- Old Redis 3 service remains on 6379 (elevated) — unused by the app.
- Ollama: start the Ollama app (serves 127.0.0.1:11434).

## Next session priorities

1. Phase 4: complete product UI architecture (design real state surfaces: dashboard, chat, agents, media) — still keep empty states truthful until each feature phase.
2. Then Phase 5: backend + AI engine foundation (orchestration, streaming, tools, persistence).
3. Continue phase-by-phase per the master spec. Do not skip phases or build fake functionality.
4. When starting: review git status and the master specification before writing code.