// Alienista service worker: offline styles/scripts and an offline page.
// Bump VERSION when this file's caching rules change; old shell caches are then removed.
const VERSION = 'v2';
const STATIC_CACHE = `alienista-static-${VERSION}`;
const SHELL_CACHE = `alienista-shell-${VERSION}`;
const OWN_CACHE_PREFIXES = ['attendqr-shell-', 'alienista-static-', 'alienista-shell-'];
// Never precache /login: signed-in users are redirected away from it, so it can hold another user's page.
const SHELL_ASSETS = ['/offline.html', '/manifest.json', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Delete only this worker's old caches. The scanner keeps avatar caches of its own.
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => OWN_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
        .filter((key) => key !== STATIC_CACHE && key !== SHELL_CACHE)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Build output under /_next/static/ is content-hashed, so a cached copy is always correct.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Pages always come from the network; offline, show a page that needs nothing else from the server.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.open(SHELL_CACHE).then((cache) => cache.match('/offline.html')))
    );
    return;
  }

  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
  }
});
