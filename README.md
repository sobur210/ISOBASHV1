# ISOBASH

Your AI. Your Agents. Your Workspace.

ISOBASH is an AI operating platform: chat, reasoning, autonomous agents, memory, projects, web research, files, document intelligence, image and video generation, backed by a provider-agnostic engine that runs locally, in the cloud, or both.

## Stack

- Frontend: Next.js + React + TypeScript + Tailwind CSS
- Backend: Node.js + NestJS + TypeScript
- Database: PostgreSQL + Prisma
- Jobs: Redis + BullMQ
- Realtime: Socket.IO
- Local AI: Ollama

## Structure

```
apps/frontend    Next.js application (landing, auth, workspace, admin)
apps/backend     NestJS API, AI bridge, realtime, jobs producer
apps/worker      Dedicated BullMQ worker
packages/shared  Shared contracts (foundation)
prisma/          Database schema and migrations
scripts/         Dev tooling and runtime verification
docs/            Architecture and operational documentation
configuration/   Static configuration notes
```

Runtime data is externalized to `ISOBASH-DATA/` and `ISOBASH-MODELS/` beside the repository. The source tree stays well under the 400 MB limit.

## Quick start

1. `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Start PostgreSQL and Redis (see `docs/LOCAL-DEVELOPMENT.md`).
4. `npx prisma migrate dev`
5. `npm run dev`

`npm run dev` runs `npm run clean:dev` (clears stale listeners on dev ports) before starting frontend, backend, and worker together.

## URLs

- Frontend and public API gateway: http://localhost:3002
- Backend internal listener: http://localhost:3001
- Health: http://localhost:3002/health
- PostgreSQL: localhost:5432
- Redis: localhost:6380
- Ollama: 127.0.0.1:11434

## Verification

```bash
npm run build:frontend
npm run build:backend
npm run build:worker
npx prisma validate
node scripts/verify-phase1.mjs   # routes, health, AI, database, queue+worker, realtime
node scripts/verify-phase3.mjs   # configuration, storage, error format, health components
node scripts/verify-phase5.mjs   # chat streaming, persistence, ownership, validation, tools, chat UI
node scripts/verify-phase6.mjs   # auth: register/me/duplicates/login/logout/validation, frontend gating
node scripts/verify-phase7.mjs   # authorization: roles guard, admin gating, role round-trip
node scripts/verify-phase8.mjs   # security: headers, cookie hardening, MFA, rate limits, lockout, audit trail
```

## Status

### Current handoff note

This repository currently contains a partial admin shell feature that is implemented but not fully verified through the repo test harness. The shell is intended to be admin-only and safe by default, with only read-only diagnostic commands allowed. The current blocker is a backend Jest/TypeScript bootstrap issue: the test run fails before executing with `SyntaxError: Cannot use import statement outside a module`.

Relevant files:
- `apps/backend/src/admin/admin-shell.service.ts`
- `apps/backend/src/admin/admin.controller.ts`
- `apps/backend/src/admin/admin.module.ts`
- `apps/backend/src/admin/admin-shell.service.test.ts`
- `apps/backend/jest.config.js`

The next step is to fix the Jest TypeScript transform so the test can run and validate the safe allow-list behavior.

Phases 1–8 are implemented and runtime-verified:

- Phase 1: project foundation, route shells, Prisma schema, BullMQ worker, Socket.IO.
- Phase 2: provider-agnostic AI bridge with a real Ollama adapter.
- Phase 3: typed configuration (fail-fast), storage abstraction over externalized roots, structured request logging, normalized error format, component health, DTO validation.
- Phase 4: complete product UI architecture (design-system primitives, real-state workspace dashboard (live system + AI capability panels), research/billing surfaces, route loading/error states, responsive navigation).
- Phase 5: live chat (conversation + message persistence (Conversation/Message models), streaming orchestration (`POST /chat/stream` SSE via a provider `stream()`), ownership by client session, realtime `chat:updated` events, and a real `/app/chat` surface with a working composer).
- Phase 6: authentication (register/login/logout with bcrypt hashing and server-side sessions (httpOnly cookie), `/app` and `/admin` gated behind a real session, real login/register forms).
- Phase 7: authorization (`@Roles()` + `RolesGuard` on the admin surface, admin-only live system health, first registered account bootstrapped as `ADMIN`).
- Phase 8: security hardening (Redis-backed rate limiting and login lockout, TOTP MFA with two-step sign-in, persistent audit trail, security headers and CSP on both apps).

All empty states are truthful. Nothing is simulated before its phase makes it real.