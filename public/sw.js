// NZ Sport Club Service Worker - Caching only (push handled by OneSignal)

const CACHE_VERSION = 'v3.0.0';
const CACHE_NAME = `nz-sport-club-${CACHE_VERSION}`;

const STATIC_ASSETS = ['/', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((names) =>
        Promise.all(names.filter(n => n.startsWith('nz-sport-club-') && n !== CACHE_NAME).map(n => caches.delete(n)))
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api') || url.origin !== self.location.origin) return;

  if (['image', 'style', 'font'].includes(event.request.destination)) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return resp;
        })
      )
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
