// Service worker for the guest review app.
//
// Design goals:
// 1. Never cache the HTML shell. Guest context (venue, table, server) lives in
//    the URL and the response varies per table — caching "/" pinned a session
//    ID across visitors in v1. We use network-first for documents.
// 2. Cache-first for static assets (fonts, icons, hashed CSS/JS) so repeat
//    loads on flaky restaurant Wi-Fi feel instant.
// 3. Survive offline with a branded fallback page. Brand assets needed by
//    that page (icons + the offline HTML itself) are precached at install.
// 4. Bump CACHE_VERSION on every deploy so stale caches evict cleanly.
// 5. No caching of POST / PUT / DELETE — those will hit /api/submissions in
//    Phase 2 and must always reach the network.

const CACHE_VERSION = 'bistro-review-v3';
const OFFLINE_URL = '/offline.html';

// Static assets to precache. Keep this list tight — Next.js serves hashed
// /_next/static assets that get cached on first request via the cache-first
// fetch handler below. We only precache what's strictly needed for the
// offline page + install card + tab favicon to render without a network.
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-icon.png',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      // Fire-and-forget per asset so a single 404 (e.g. icon temporarily missing
      // mid-deploy) doesn't kill the whole install — partial precache is still
      // better than no precache.
      return Promise.all(
        PRECACHE_URLS.map(function (url) {
          return cache.add(url).catch(function () { /* ignore missing assets */ });
        })
      );
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_VERSION; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;

  // Only handle GETs. Mutations must reach the network so the manager
  // notification path can't be silently swallowed.
  if (req.method !== 'GET') return;

  // Only same-origin. Cross-origin (Google review redirects, font CDNs in
  // dev) brings its own caching semantics that we don't want to override.
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests (HTML documents): network-first with offline fallback.
  // We never store the navigation response — see goal 1 above.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  // Everything else (static assets): cache-first, populate on miss.
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        // Only cache successful, basic (same-origin) responses. Opaque
        // responses (CORS misses) and error pages should not poison the cache.
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        var clone = res.clone();
        caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, clone); });
        return res;
      });
    })
  );
});
