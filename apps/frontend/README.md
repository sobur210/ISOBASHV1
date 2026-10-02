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
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_WEB_URL=https://app.example.com
```

Both values are required for production builds. `NEXT_PUBLIC_API_URL` is inlined
into browser JavaScript, so rebuild whenever it changes.

This is a standard Next.js Node deployment. Use the frontend directory as the
project root, or run the equivalent workspace commands from the repository root:

```bash
npm --workspace apps/frontend run build
npm --workspace apps/frontend run start
```

The start command honors the platform-provided `PORT` value. For a monorepo host,
set the build command to `npm --workspace apps/frontend run build` and the start
command to `npm --workspace apps/frontend run start`.
