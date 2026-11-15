/*
 * Shape Stack service worker: offline play for the installed PWA.
 *
 * Template: build/sw/plugin.ts replaces the CONFIG placeholder below at build
 * time with { cacheName, base, precache } and emits the result as `<base>sw.js`.
 * No dev-server worker exists.
 *
 * Strategies (GET, same-origin, inside the base only; everything else is left
 * to the browser):
 * - Navigations: network-first with a short timeout, falling back to the
 *   precached index.html. Online players always get the latest deploy.
 * - `<base>assets/*` (content-hashed, immutable): cache-first.
 * - Anything else (manifest, icons): stale-while-revalidate.
 *
 * Update model: no skipWaiting(). A new worker precaches the new deploy into
 * its own bucket and waits until every tab / the standalone app is closed.
 * Online reloads already show the new deploy (navigation is network-first),
 * so waiting only decides which version plays offline, and the old page never
 * loses the cache it was built against. Nothing here reloads a page.
 */

const CONFIG = self.__SW_CONFIG__;

const CACHE_PREFIX = "shape-stack-";
const NAVIGATION_TIMEOUT_MS = 3000;
const INDEX_URL = `${CONFIG.base}index.html`;
const HASHED_ASSETS = `${CONFIG.base}assets/`;
/**
 * Entries are keyed by URL alone: each file has one representation. Without
 * ignoreVary a `Vary: Origin` response (vite preview, CDNs) precached by a
 * plain fetch never matches the page's `crossorigin` module script request,
 * which carries an Origin header, and the game fails to boot offline.
 */
const MATCH = { ignoreVary: true };

/** Only complete same-origin responses are stored (never errors or opaque). */
const isCacheable = (response) =>
  response !== undefined && response.ok && response.type === "basic";

/**
 * Safari refuses to serve a redirected response to a navigation; re-wrap so a
 * (misconfigured) redirect on a precached URL can't brick offline start-up.
 */
const withoutRedirect = (response) =>
  response.redirected
    ? new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    : response;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CONFIG.cacheName);
      // All-or-nothing: one failed request rejects waitUntil, the install
      // fails and this worker never activates on a half-filled bucket.
      // `cache: "reload"` bypasses the HTTP cache (Pages sends max-age=600),
      // so the bucket can't capture the previous deploy's index.html.
      await Promise.all(
        CONFIG.precache.map(async (url) => {
          const response = await fetch(new Request(url, { cache: "reload" }));
          if (!isCacheable(response)) {
            throw new Error(`Precache failed for ${url}: HTTP ${response.status}`);
          }
          await cache.put(url, withoutRedirect(response));
        }),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CONFIG.cacheName)
          .map((key) => caches.delete(key)),
      );
      // First install: take over the already-open page so it works offline
      // without a reload. Harmless on updates (no tab is open by then).
      await self.clients.claim();
    })(),
  );
});

const fetchWithTimeout = (request, ms) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("navigation timeout")), ms);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

const navigate = async (request) => {
  try {
    const response = await fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS);
    // Server errors fall back to the cached shell; 404s etc. pass through.
    if (response.status < 500) return response;
  } catch {
    // Offline, DNS failure or timeout: serve the cached shell below.
  }
  // The cached index.html is never refreshed from a navigation: it must stay
  // consistent with the hashed assets precached alongside it.
  const cache = await caches.open(CONFIG.cacheName);
  const cached = await cache.match(INDEX_URL, MATCH);
  return cached ?? Response.error();
};

const cacheFirst = async (request) => {
  const cache = await caches.open(CONFIG.cacheName);
  const cached = await cache.match(request, MATCH);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheable(response)) await cache.put(request, response.clone());
  return response;
};

const staleWhileRevalidate = async (event) => {
  const { request } = event;
  const cache = await caches.open(CONFIG.cacheName);
  const cached = await cache.match(request, MATCH);
  const network = fetch(request).then(async (response) => {
    if (isCacheable(response)) await cache.put(request, response.clone());
    return response;
  });
  if (cached) {
    // Revalidate in the background; offline that simply fails silently.
    event.waitUntil(network.catch(() => undefined));
    return cached;
  }
  return network;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(CONFIG.base)) return;

  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
  } else if (url.pathname.startsWith(HASHED_ASSETS)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(event));
  }
});
