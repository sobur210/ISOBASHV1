"use client";

import { useEffect } from "react";

/**
 * Registers the offline shell (`/sw.js`) in production, and only production.
 *
 * Development runs through a live server where a cache-first worker would pin
 * every chunk to the build that first cached it; this component removes any such
 * worker instead, so an edit shows up on the next load rather than the next
 * refresh.
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

    // Development must never be served from the worker. It answers
    // `/_next/static/*` cache-first and never revalidates, and turbopack's
    // development chunk names are stable across edits, so a changed hero (or
    // any module) keeps rendering the previous build until a manual refresh.
    // Offline caching is a production concern, so in dev we instead remove any
    // worker and cache a previous session left behind — otherwise it keeps
    // controlling the page and the stale behaviour survives the fix.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .then(() => ("caches" in window ? caches.keys() : Promise.resolve<string[]>([])))
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => {
          // Best effort: a failed teardown just means the old worker lingers.
        });
      return;
    }

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