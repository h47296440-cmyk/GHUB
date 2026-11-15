// G-HUB PWA Service Worker (Offline Games & App Shell Ready)
const CACHE_NAME = 'ghub-cache-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/play.html',
  '/studio.html',
  '/pwa.html',
  '/upload.html',
  '/profile.html',
  '/ghub-pwa.js',
  '/manifest.json',
  '/icon.svg',
  '/favicon.svg',
  '/favicon.ico',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/trend-thumbs/suika-merge.svg',
  '/trend-thumbs/orbit-survivor.svg',
  '/trend-thumbs/clicker-rush.svg',
  '/trend-thumbs/ai-dungeon.svg',
  '/src/assets/images/ghub_hero_arcade_1794550925307.jpg',
  '/src/assets/images/ghub_default_thumb_1794550924982.jpg',
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

  // API・Supabaseプロキシ・AIリクエストはネットワーク専用（オフライン時はクライアント側IndexedDBフォールバックへ委ねる）
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/supabase') || url.pathname.startsWith('/ai')) {
    return;
  }

  if (e.request.method !== 'GET') return;

  // HTMLページ遷移（/play.html?id=... や /studio.html?... などクエリ付きナビゲーションのオフライン対応）
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            const cacheKey = url.pathname === '/' ? '/' : url.pathname;
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(cacheKey, resClone);
            });
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          // 1. 完全一致
          const exact = await cache.match(e.request);
          if (exact) return exact;
          // 2. クエリパラメータを除いたベースページ (/play.html?id=xxx -> /play.html)
          const byPath = await cache.match(url.pathname, { ignoreSearch: true });
          if (byPath) return byPath;
          // 3. トップページフォールバック
          return (await cache.match('/index.html')) || (await cache.match('/'));
        })
    );
    return;
  }

  // 静的アセット: キャッシュ優先 + バックグラウンド更新 (Stale-While-Revalidate)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, resClone);
            });
          }
          return res;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
