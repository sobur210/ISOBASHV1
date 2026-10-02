"use client";

import { useEffect } from "react";

/**
 * Registers the offline shell (`/sw.js`).
 *
 * Registration happens after mount rather than through an inline script because
 * the Content-Security-Policy issues a fresh nonce per request and allows only
 * `'self'` plus that nonce, so an inline registration block would be refused. A
 * client component is also the only place this can live without adding a
 * `<script>` tag to the document head.
 *
 * Failure is silent by design. A browser that does not support service workers,
 * a page served over plain HTTP on a non-loopback host, or a user who has blocked
 * registration all leave the app exactly as it behaves now — no error banner, no
 * degraded mode, because nothing is degraded: caching is an addition, never a
 * requirement.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // A new worker waits by default so a half-installed one is never swapped in
        // mid-session; this activates it on the next load instead of silently.
        if (!cancelled && registration.waiting) {
          registration.waiting.postMessage("ISOBASH_SKIP_WAITING");
        }
      })
      .catch(() => {
        // Offline support is optional. Nothing to report to the user.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}