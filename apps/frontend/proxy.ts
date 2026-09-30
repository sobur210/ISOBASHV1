import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request CSP nonce.
 *
 * Next.js inlines React's hydration payload and any inline script the app
 * renders. With a static `script-src 'self'` those are all refused, the app
 * never hydrates, and every client control (the theme toggle included) is
 * inert. A fresh nonce per request is the only way to keep `script-src` strict.
 */
function buildCsp(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  const apiOrigin = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${apiOrigin} https://images.unsplash.com`,
    `media-src 'self' blob: ${apiOrigin}`,
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}${isDev ? ` ${apiOrigin.replace(/^http/, "ws")}` : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-src 'self'",
  ];

  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Next.js parses the nonce back out of this request header while rendering
  // and stamps it onto every script and style tag it emits.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Prefetches and static assets never render markup, so they need no CSP.
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
