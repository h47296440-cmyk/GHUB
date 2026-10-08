// G-HUB PWA Service Worker
const CACHE_NAME = 'ghub-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/play.html',
  '/upload.html',
  '/profile.html',
  '/manifest.json',
  '/icon.svg',
  '/favicon.svg',
  '/favicon.ico',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/offline-assets/react.production.min.js',
  '/offline-assets/react-dom.production.min.js',
  '/offline-assets/tailwind.min.js',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/dist/umd/supabase.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/esbuild-wasm@0.19.11/lib/browser.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Precache partial fail:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // APIリクエストやSupabaseプロキシはネットワーク優先
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/supabase') || url.pathname.startsWith('/ai')) {
    return;
  }

  // 静的アセットはキャッシュファースト / StaleWhileRevalidate
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((res) => {
        if (res.status === 200 && e.request.method === 'GET') {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, resClone);
          });
        }
        return res;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
