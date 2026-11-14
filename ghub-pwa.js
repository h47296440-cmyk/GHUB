// G-HUB PWA & Offline Game Library Manager
(function () {
  const DB_NAME = 'ghub_offline_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'offline_games';
  const CATALOG_CACHE_KEY = 'ghub_cached_catalog_v1';

  // 1. Register Service Worker on every G-HUB page
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.warn('SW registration skipped:', err);
      });
    });
  }

  // 2. IndexedDB Helper for storing complete offline-playable HTML games inside the PWA
  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB not supported'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function saveOfflineGame(gameMeta, htmlContent) {
    if (!gameMeta || !gameMeta.id || !htmlContent) {
      throw new Error('保存に必要なゲームデータが不足しています');
    }
    const db = await openDb();
    const record = {
      id: String(gameMeta.id),
      title: String(gameMeta.title || 'Untitled Game'),
      tag: String(gameMeta.tag || 'Indie'),
      description: String(gameMeta.description || ''),
      thumbnail_url: gameMeta.thumbnail_url || '',
      author_email: gameMeta.author_email || 'creator',
      price_coins: Number(gameMeta.price_coins) || 0,
      platforms: gameMeta.platforms || 'pc,mobile',
      likes_count: Number(gameMeta.likes_count) || 0,
      play_count: Number(gameMeta.play_count) || 0,
      html: String(htmlContent),
      savedAt: new Date().toISOString(),
      sizeBytes: new Blob([String(htmlContent)]).size
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });

    // Also notify Service Worker cache to ensure play.html shell is warm
    try {
      const cache = await caches.open('ghub-cache-v3');
      await cache.add('/play.html').catch(() => {});
      await cache.add('/pwa.html').catch(() => {});
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('ghub:offline-updated', { detail: { id: record.id } }));
    return record;
  }

  async function saveOfflineGameById(gameMeta, overrideHtml) {
    if (!gameMeta || !gameMeta.id) throw new Error('ゲームIDが不明です');
    let html = overrideHtml || '';
    if (!html) {
      const res = await fetch(`/api/download-offline-game?id=${encodeURIComponent(gameMeta.id)}`);
      if (!res.ok) throw new Error('オフラインパッケージの取得に失敗しました');
      html = await res.text();
    }
    return await saveOfflineGame(gameMeta, html);
  }

  async function getOfflineGame(gameId) {
    if (!gameId) return null;
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(String(gameId));
        req.onsuccess = (e) => resolve(e.target.result || null);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (e) {
      return null;
    }
  }

  async function listOfflineGames() {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = (e) => {
          const items = e.target.result || [];
          items.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
          resolve(items);
        };
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (e) {
      return [];
    }
  }

  async function removeOfflineGame(gameId) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(String(gameId));
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e.target.error);
      });
      window.dispatchEvent(new CustomEvent('ghub:offline-updated', { detail: { id: gameId, removed: true } }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function cacheCatalogSnapshot(games) {
    try {
      if (!Array.isArray(games) || games.length === 0) return;
      const slim = games.slice(0, 120).map((g) => ({
        id: g.id,
        title: g.title,
        tag: g.tag,
        description: g.description,
        thumbnail_url: g.thumbnail_url,
        author_email: g.author_email,
        platforms: g.platforms,
        price_coins: g.price_coins,
        likes_count: g.likes_count,
        play_count: g.play_count,
        is_event: g.is_event,
        created_at: g.created_at
      }));
      localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(slim));
    } catch (e) {}
  }

  function getCachedCatalogSnapshot() {
    try {
      const raw = localStorage.getItem(CATALOG_CACHE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  // 3. Offline Connectivity Toast Indicator & Standalone Install Helper
  function ensureOfflineBar() {
    if (document.getElementById('ghub-offline-status-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'ghub-offline-status-bar';
    bar.style.cssText = 'position:fixed;bottom:14px;left:14px;z-index:99990;display:none;align-items:center;gap:8px;background:rgba(15,23,42,0.96);color:#fbbf24;border:1px solid rgba(245,158,11,0.5);padding:8px 14px;border-radius:14px;font-family:sans-serif;font-size:12px;font-weight:700;box-shadow:0 10px 25px rgba(0,0,0,0.45);backdrop-filter:blur(8px);';
    bar.innerHTML = '<span>✈️</span><span>オフラインモード — PWA保存済みゲームを遊べます</span>';
    document.body.appendChild(bar);
  }

  function syncOnlineIndicator() {
    ensureOfflineBar();
    const bar = document.getElementById('ghub-offline-status-bar');
    if (bar) {
      bar.style.display = navigator.onLine ? 'none' : 'flex';
    }
  }

  function showIOSInstallModal() {
    let modal = document.getElementById('ghub-ios-install-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ghub-ios-install-modal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:99995;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;';
      modal.innerHTML = `
        <div style="background:#111827;border:1px solid #334155;border-radius:20px;max-width:360px;width:100%;padding:22px;color:#f8fafc;font-family:sans-serif;box-shadow:0 20px 50px rgba(0,0,0,0.6);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <strong style="font-size:15px;">📲 iPhone / iPad でアプリ化</strong>
            <button type="button" onclick="document.getElementById('ghub-ios-install-modal').remove()" style="background:none;border:none;color:#94a3b8;font-size:16px;cursor:pointer;">✕</button>
          </div>
          <p style="font-size:12px;color:#cbd5e1;line-height:1.65;margin:0 0 14px 0;">
            1. Safari 下部の <strong>共有アイコン (□↑)</strong> をタップします。<br>
            2. メニュー内の <strong>「ホーム画面に追加」</strong> を選びます。<br>
            3. オフライン保存したゲームは圏外でもPWAアプリから起動できます！
          </p>
          <button type="button" onclick="document.getElementById('ghub-ios-install-modal').remove()" style="width:100%;background:#4f46e5;color:#fff;border:none;border-radius:12px;padding:10px;font-weight:700;font-size:12px;cursor:pointer;">
            閉じる
          </button>
        </div>
      `;
      document.body.appendChild(modal);
    }
  }

  function isStandalonePwa() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isIosSafari() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  document.addEventListener('DOMContentLoaded', () => {
    syncOnlineIndicator();
    window.addEventListener('online', syncOnlineIndicator);
    window.addEventListener('offline', syncOnlineIndicator);

    // Enable install button for iOS Safari users if not yet standalone
    const btn = document.getElementById('pwa-install-btn');
    if (btn && !isStandalonePwa() && isIosSafari()) {
      btn.classList.remove('hidden');
    }
  });

  window.GHUB_PWA = {
    saveOfflineGame,
    saveOfflineGameById,
    getOfflineGame,
    listOfflineGames,
    removeOfflineGame,
    cacheCatalogSnapshot,
    getCachedCatalogSnapshot,
    showIOSInstallModal,
    isStandalonePwa,
    isIosSafari
  };
})();
