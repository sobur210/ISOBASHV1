# Local Development

## Services

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- API liveness: `http://localhost:3001/health`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6380` for the verified Laragon Redis 5 runtime

## Start

Install Node.js dependencies with `npm install`. Start PostgreSQL and Redis with `npm run docker:up` when Docker Desktop is available. Then run `npx prisma generate`, apply a migration with `npx prisma migrate dev --name init`, and start the applications with `npm run dev`.

The application must report dependency failures truthfully. A passing frontend build does not prove that PostgreSQL or Redis is running.
