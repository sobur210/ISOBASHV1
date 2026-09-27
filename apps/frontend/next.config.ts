import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const productionCsp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.unsplash.com; font-src 'self'; connect-src 'self' http://localhost:3001; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; frame-src 'self'";

const devCsp =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.unsplash.com; font-src 'self' http://localhost:3001; connect-src 'self' http://localhost:3001 ws://localhost:3001; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

const csp = isProd ? productionCsp : devCsp;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...baseSecurityHeaders, { key: "Content-Security-Policy", value: csp }],
      },
    ];
  },
};

export default nextConfig;