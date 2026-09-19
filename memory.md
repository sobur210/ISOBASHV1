# Status of extraction when limit hit: COMPLETE.

# pg16 folder confirmed to contain bin, doc, include, lib,

# pgAdmin 4, StackBuilder — standard full PG16 install layout.

# No 'data' folder yet — expected, created by initdb (not run yet).

# 

# ISOBASH Project Memory

Last updated: 2026-09-17

## Current status

- Phase 1 foundation: implemented and runtime-verified.
- Phase 2 provider bridge: implemented and runtime-verified.
- Website and development servers were stopped at the end of the session.
- The current UI is only a rough foundation. The next session should redesign the colors, typography, navigation, and URL experience before adding more product features.

## Stack

- Frontend: Next.js 16, React, TypeScript, Tailwind CSS
- Backend: Node.js, NestJS, TypeScript
- Database: PostgreSQL 18, Prisma
- Jobs: Redis 5.0.14.1, BullMQ
- Realtime: Socket.IO
- Local AI: Ollama with `llama3.2:latest`
- Workspace: `C:\laragon\www\Isobash`

## Implemented structure

- `apps/frontend`: Next.js application and route shells
- `apps/backend`: NestJS API, Prisma service, Socket.IO gateway, AI provider bridge
- `apps/worker`: dedicated BullMQ worker
- `prisma`: schema and applied migration
- `docs`: architecture, local development, and provider documentation
- `packages/shared`, `scripts`, `tests`, `configuration`, `public`: foundation directories

## Frontend routes

- `/`
- `/login`
- `/register`
- `/app`
- `/app/chat`
- `/app/agents`
- `/app/projects`
- `/app/files`
- `/app/media`
- `/app/settings`
- `/admin`
- `/admin/users`
- `/admin/analytics`
- `/admin/settings`

These are truthful foundation shells. They do not pretend that authentication, chat, media, or AI features are complete.

## Backend endpoints

- `GET /health`
- `GET /ai/providers`
- `GET /ai/providers/health`
- `GET /ai/models`
- `GET /ai/capabilities`
- `POST /ai/generate`

## AI provider status

- Ollama is enabled locally.
- Base URL: `http://127.0.0.1:11434`
- Model: `llama3.2:latest`
- Language generation was tested successfully.
- OpenAI-compatible adapter exists but is disabled because no API key is configured.
- Vision, embeddings, image generation, video generation, and research are reported as unavailable. They must not be faked.

## Local services

- Website: `http://localhost:3000`
- Backend: `http://localhost:3001`
- PostgreSQL: `localhost:5432`
- Redis 5: `localhost:6380`
- The older Redis 3 service remains on `localhost:6379` and was not stopped because it runs elevated.

## Environment

The local `.env` contains the PostgreSQL password supplied during setup and must never be committed or copied into documentation.

Important values:

- `DATABASE_URL` points to PostgreSQL on port `5432`.
- `REDIS_URL` points to Redis on port `6380`.
- `OLLAMA_ENABLED=true`.
- `OLLAMA_MODEL=llama3.2:latest`.

## Verification completed

- Prisma client generated.
- Prisma migration `20260917234452_phase1` applied successfully.
- Real Prisma query succeeded.
- PostgreSQL service accepted connections.
- Redis returned `PONG`.
- BullMQ processed a real queue job.
- NestJS API health returned `200`.
- Frontend routes returned `200`.
- Frontend, backend, and worker builds passed.
- Ollama health returned healthy.
- Real local AI generation returned `ISOBASH local provider works.`.

## Start commands

From `C:\laragon\www\Isobash`:

```bash
npm run dev
```

This starts the frontend, backend, and worker together. PostgreSQL, Redis, and Ollama should already be running.

## Next session priorities

1. Redesign the frontend visual language before expanding functionality.
2. Replace the rough green foundation palette with a deliberate product identity.
3. Improve typography, spacing, navigation, page hierarchy, and route naming.
4. Review the homepage and workspace shell on desktop and mobile.
5. Keep all empty states truthful; do not add fake AI, media, or authentication success.
6. Continue only after reviewing the current repository and this memory file.

# Current task: Run initdb to create data directory, then start

# Postgres server and confirm it's listening.

