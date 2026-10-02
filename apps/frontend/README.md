# ISOBASH Frontend

Next.js frontend for the ISOBASH workspace.

## Local development

From the repository root:

```bash
npm install
npm run dev:web
```

The app runs at `http://localhost:3002`. Copy `.env.example` to `.env.local` and
set the backend URL if the API is not running on `http://localhost:3001`.

## Production deployment

Configure these environment variables in the hosting provider before building:

```text
NEXT_PUBLIC_API_URL=https://app.example.com
NEXT_PUBLIC_WEB_URL=https://app.example.com
INTERNAL_API_URL=http://backend:3001
```

All three values are required in production. `NEXT_PUBLIC_API_URL` is inlined
into browser JavaScript, while `INTERNAL_API_URL` is used by the Next server to
forward backend routes through the same public origin.

This is a standard Next.js Node deployment. Use the frontend directory as the
project root, or run the equivalent workspace commands from the repository root:

```bash
npm --workspace apps/frontend run build
npm --workspace apps/frontend run start
```

The start command honors the platform-provided `PORT` value. For a monorepo host,
set the build command to `npm --workspace apps/frontend run build` and the start
command to `npm --workspace apps/frontend run start`.
