const CACHE_NAME = 'reay-budget-v1';

// Assets to cache on install — the full app shell
const PRECACHE = [
  '/',
  '/index.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
  '/icons/icon-32.png',
  '/icons/icon-16.png',
];

// --- Install: precache app shell ---
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// --- Activate: clear old caches ---
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// --- Fetch: cache-first for app shell, network-first for Supabase API ---
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Let Supabase API calls go straight to network — never cache live data
  if (url.hostname.includes('supabase.co')) {
    return; // default browser fetch
  }

  // CDN resources (React, Recharts, Tailwind) — cache after first load
  if (url.hostname === 'esm.sh' || url.hostname === 'cdn.tailwindcss.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // App shell (HTML, icons, local assets) — cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Only cache valid same-origin responses
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache =>
            cache.put(event.request, responseToCache)
          );
        }
        return response;
      }).catch(() => {
        // Offline fallback — serve index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
