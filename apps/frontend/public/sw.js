/*
 * ISOBASH service worker.
 *
 * Scope: make the product still be *visible* when the network is gone, without
 * ever showing stale data as if it were live. Three rules follow from that:
 *
 *  1. **API responses are never cached.** Every product surface reads live state
 *     from the backend through the gateway, and a cached `/ai/capabilities` or
 *     `/media/assets` response would render as a real number that is no longer
 *     true. Offline, those requests fail, and the UI reports that honestly.
 *  2. **Only public pages are cached as documents.** `/`, `/about`, `/blog`,
 *     `/login` and `/register` carry no session-specific content, so caching one
 *     cannot leak an authenticated page to the next person at the same machine.
 *     Every `/app/*` and `/admin/*` route is deliberately excluded: those pages
 *     are rendered for a signed-in user, and serving a saved copy would be
 *     showing somebody else's workspace.
 *  3. **Offline falls back to a page that explains itself.** `/offline.html` says
 *     what still works and what needs the local services, instead of a blank page
 *     or a browser error that says nothing.
 *
 * Static build assets (`/_next/static/*`) are content-hashed and therefore safe to
 * serve cache-first, which is what makes a previously-visited page render offline
 * at all.
 */

const CACHE = "isobash-shell-v1";
const PRECACHE = ["/offline.html", "/manifest.webmanifest", "/logo.png"];

/** Documents that carry no session-specific content. */
const PUBLIC_PATHS = new Set(["/", "/about", "/blog", "/login", "/register"]);

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname === "/logo.png" ||
    url.pathname === "/manifest.webmanifest"
  );
}

/** Anything the gateway forwards to the backend, or any authenticated surface. */
function isPrivate(url) {
  if (PUBLIC_PATHS.has(url.pathname)) return false;
  return (
    url.pathname.startsWith("/app") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth") ||
    url.pathname.startsWith("/ai") ||
    url.pathname.startsWith("/chat") ||
    url.pathname.startsWith("/files") ||
    url.pathname.startsWith("/knowledge") ||
    url.pathname.startsWith("/media") ||
    url.pathname.startsWith("/research") ||
    url.pathname.startsWith("/memory") ||
    url.pathname.startsWith("/projects") ||
    url.pathname.startsWith("/agents") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/billing") ||
    url.pathname.startsWith("/health")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  // Lets a future settings surface drop the cache without a redeploy.
  if (event.data === "ISOBASH_SKIP_WAITING") self.skipWaiting();
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstDocument(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await cache.match("/offline.html");
    if (offline) return offline;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET is ever intercepted. A POST is a mutation: replaying or caching one
  // would be a correctness and privacy problem, not a performance win.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Private surfaces are never cached as documents; offline they get the
    // explanatory page rather than a stale signed-in view.
    if (isPrivate(url)) {
      event.respondWith(
        fetch(request).catch(async () => {
          const offline = await caches.match("/offline.html");
          return (
            offline ||
            new Response("<h1>Offline</h1>", {
              status: 503,
              headers: { "content-type": "text/html; charset=utf-8" },
            })
          );
        }),
      );
      return;
    }
    event.respondWith(networkFirstDocument(request));
    return;
  }

  // Everything else that is not a private surface and not a static asset is simply
  // passed through untouched, so nothing unexpected is ever served from a cache.
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request).catch(() => fetch(request)));
  }
});