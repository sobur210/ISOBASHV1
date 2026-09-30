# Local Development

## Services

| Service | Location | Notes |
| --- | --- | --- |
| Web | `http://localhost:3000` | Next.js dev server |
| API | `http://localhost:3001` | NestJS API |
| API health | `http://localhost:3001/health` | Reports database + Redis component status |
| PostgreSQL | `localhost:5432` | Laragon PostgreSQL 18 |
| Redis | `localhost:6380` | Laragon Redis 5 (`C:\laragon\bin\redis\redis-x64-5.0.14.1`) |
| Local AI | `http://127.0.0.1:11434` | Ollama with `llama3.2:latest` |

## Start

1. Install dependencies: `npm install`
2. Start PostgreSQL and Redis. PostgreSQL runs as a Laragon service. Redis 5 runs on port `6380`:
   ```bash
   "C:\laragon\bin\redis\redis-x64-5.0.14.1\redis-server.exe" --port 6380 --bind 127.0.0.1 --dir C:\laragon\Isobash-Redis
   ```
3. Start Ollama: run the Ollama application (serving on `127.0.0.1:11434`).
4. Apply the database schema: `npx prisma migrate dev` (after copying `.env.example` to `.env`).
5. Start the full stack: `npm run dev`

`npm run dev` runs a preflight step (`npm run clean:dev`) that stops stale Node processes still holding app ports before launching frontend, backend, and worker together.

## Runtime data

Runtime data lives outside the source directory:

- `ISOBASH-DATA/`: `uploads/`, `media/`, `temp/`, `logs/`, `cache/`, `knowledge/`, `generated/`
- `ISOBASH-MODELS/`: local model files

These roots are resolved from `DATA_ROOT`, `UPLOAD_ROOT`, `MEDIA_ROOT`, `TEMP_ROOT`, `LOGS_ROOT`, `CACHE_ROOT`, `KNOWLEDGE_ROOT`, and `MODEL_ROOT` in `.env`, defaulting to directories beside the repository.

## Verification

Run the runtime check against a live stack:

```bash
node scripts/verify-phase1.mjs   # routes, health, AI, database, queue+worker, realtime
node scripts/verify-phase3.mjs   # configuration, storage, error format, health components, realtime
node scripts/verify-phase5.mjs   # chat streaming, persistence, ownership, validation, tools, chat UI + auth gate
node scripts/verify-phase6.mjs   # auth: register/me/duplicates/login/logout/validation + frontend gating
```

All scripts report pass/fail per check and exit non-zero on any failure. The application must report dependency failures truthfully. A passing frontend build does not prove that PostgreSQL or Redis is running.

## Authentication (Phase 6)

Accounts are stored in PostgreSQL (`User` with bcrypt hash, `Session` with 30-day expiry). Register/login/httpOnly-cookie flows: sign in or register at `http://localhost:3000/login` / `/register`. Once signed in, `/app/*` and `/admin/*` render; signed-out visits redirect to `/login`. A logout button in the header revokes the session server-side.

## Environment

`.env` is local-only and never committed. `.env.example` documents every variable, including `DATABASE_URL`, `REDIS_URL`, Ollama configuration, and the runtime-data roots.