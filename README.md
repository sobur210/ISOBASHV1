# Isobash

A starter monorepo for:
- Frontend: Next.js + React + TypeScript + Tailwind
- Backend: Node.js + NestJS + TypeScript
- Database: PostgreSQL + Prisma
- Jobs: Redis + BullMQ
- Realtime: Socket.IO

## Structure

- apps/frontend
- apps/backend
- apps/worker
- packages/shared
- prisma/
- docs/
- tests/
- scripts/
- configuration/
- docker-compose.yml

## Quick start

1. Install dependencies:
   npm install

2. Start PostgreSQL and Redis:
   npm run docker:up

3. Configure environment variables:
   - create `.env` in the project root
   - set `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/isobash?schema=public"`

4. Create database tables:
   npx prisma migrate dev --name init

5. Start the app and worker:
   npm run dev

## URLs

- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- PostgreSQL: localhost:5432
- Redis: localhost:6379

## Phase 1 routes

The frontend includes truthful foundation boundaries for `/`, `/login`, `/register`, `/app`, `/app/chat`, `/app/agents`, `/app/projects`, `/app/files`, `/app/media`, `/app/settings`, `/admin`, `/admin/users`, `/admin/analytics`, and `/admin/settings`.

These routes do not simulate AI, media, authentication, or job success. They provide the structure for the phases that implement those capabilities.

## Verification

Run `npm run build:frontend`, `npm run build:backend`, `npm run build:worker`, and `npx prisma validate`. Full runtime verification additionally requires PostgreSQL and Redis to be running.

## Notes

Phase 1 establishes the application shell, route boundaries, role/session schema foundation, API liveness endpoint, queue producer, dedicated worker process, Prisma schema, and local development documentation. Authentication, authorization, AI, media, billing, and production security are intentionally implemented in their dedicated phases.
