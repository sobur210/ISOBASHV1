import type { NextConfig } from "next";

/**
 * The Content-Security-Policy is set per request in `proxy.ts`, which mints the
 * nonce Next.js stamps onto its inline hydration scripts. Emitting a static CSP
 * from here would shadow that nonce and block hydration.
 */

const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const internalApiOrigin = (process.env.INTERNAL_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: baseSecurityHeaders,
      },
    ];
  },
  async rewrites() {
    return {
      afterFiles: [{ source: "/:path*", destination: `${internalApiOrigin}/:path*` }],
    };
  },
};

export default nextConfig;