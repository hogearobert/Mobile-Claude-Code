// Glitch Run service worker — network-first with cache fallback.
//
// Why network-first: an earlier build shipped a cache-first SW that served
// stale code (hence the old kill-switch). Network-first guarantees players
// always get the freshest build when online, while still working fully
// offline from the last successful fetch — making the menu's "Funcționează
// offline" promise actually true. The cache name is version-stamped so each
// deploy's activate step purges the previous build's entries. Bump VERSION
// (and the ?v= query) in lockstep with the index.html cache-buster.
const VERSION = 'glitchrun-157';
const CORE = [
  './',
  './index.html',
  './game.js?v=157',
  './style.css?v=157',
  './manifest.json',
  './icons/icon-192.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(VERSION).then((cache) =>
      // Best-effort precache: never let one missing/304 asset fail install.
      Promise.allSettled(CORE.map((u) => cache.add(u)))
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin pass through

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const fresh = await fetch(req);
      // Cache successful, non-opaque responses for offline reuse.
      if (fresh && fresh.ok && fresh.type === 'basic') {
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch (_) {
      // Offline — serve the cached copy if we have one.
      const hit = await cache.match(req);
      if (hit) return hit;
      // For navigations with no exact match, fall back to the app shell.
      if (req.mode === 'navigate') {
        const shell = (await cache.match('./index.html')) || (await cache.match('./'));
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
