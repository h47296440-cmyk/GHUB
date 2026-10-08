import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HF_TOKEN = process.env.HF_TOKEN || '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';

// 1. Supabaseプロキシ
app.use('/supabase', createProxyMiddleware({
  target: 'https://ddcnoghsiuxfhnwmtpyn.supabase.co',
  changeOrigin: true,
  pathRewrite: { '^/supabase': '' },
}));

// 2. JSONパーサー
app.use(express.json({ limit: '10mb' }));

// レビュー保存用インメモリキャッシュ
const reviewsStore = new Map();

// 全ゲームの平均星評価サマリー（高速レスポンスでホーム画面を爆速化）
app.get('/api/reviews/summary', (_req, res) => {
  const summary = {};
  for (const [gid, list] of reviewsStore.entries()) {
    if (list && list.length > 0) {
      const sum = list.reduce((acc, cur) => acc + (Number(cur.rating) || 5), 0);
      summary[gid] = {
        avg: (sum / list.length).toFixed(1),
        count: list.length
      };
    }
  }
  res.json(summary);
});

app.get('/api/reviews', (req, res) => {
  const { game_id } = req.query;
  if (!game_id) return res.json([]);
  const list = reviewsStore.get(game_id) || [];
  res.json(list);
});

app.post('/api/reviews', (req, res) => {
  const { game_id, user_name, user_email, rating, comment } = req.body;
  if (!game_id || !rating) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  const list = reviewsStore.get(game_id) || [];
  const newReview = {
    id: 'rev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    game_id,
    user_name: user_name || (user_email ? user_email.split('@')[0] : 'Guest'),
    user_email: user_email || '',
    rating: Number(rating),
    comment: comment || '',
    created_at: new Date().toISOString()
  };
  list.unshift(newReview);
  reviewsStore.set(game_id, list);
  res.json({ success: true, review: newReview });
});

// ゲームアップデート履歴保存用インメモリキャッシュ
const updatesStore = new Map();

app.get('/api/game-updates', (req, res) => {
  const { game_id } = req.query;
  if (!game_id) return res.json([]);
  const list = updatesStore.get(game_id) || [];
  res.json(list);
});

app.post('/api/game-updates', (req, res) => {
  const { game_id, version_title, changelog, author_email } = req.body;
  if (!game_id || !changelog) {
    return res.status(400).json({ error: 'Missing game_id or changelog' });
  }
  const list = updatesStore.get(game_id) || [];
  const newUpdate = {
    id: 'upd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    game_id,
    version_title: version_title || 'バージョン更新',
    changelog,
    updated_at: new Date().toISOString(),
    author_email: author_email || ''
  };
  list.unshift(newUpdate);
  updatesStore.set(game_id, list);
  res.json({ success: true, update: newUpdate });
});

// フレンド・プレゼンス ＆ プレイ履歴用データストア
const presenceStore = new Map();
const playHistoryStore = new Map();
const friendsStore = new Map();
const gamesStore = new Map();
const payloadsStore = new Map();

let cachedActualGames = [];
let lastDemoFriendsRefresh = 0;

// 実際のゲームリストを取得してデモフレンドのプレイ中ゲーム＆プレイ時間をランダム設定
async function refreshDemoFriendsFromActualGames() {
  try {
    const res = await fetch('https://ddcnoghsiuxfhnwmtpyn.supabase.co/rest/v1/games?select=*', {
      headers: {
        'apikey': 'sb_publishable_cSX9rcWTjbX6lWfyT1KLNQ_tUFYuXtj',
        'Authorization': 'Bearer sb_publishable_cSX9rcWTjbX6lWfyT1KLNQ_tUFYuXtj'
      }
    });

    let games = [];
    if (res.ok) {
      games = await res.json();
    }

    for (const g of gamesStore.values()) {
      if (!games.some(x => x.id === g.id)) {
        games.push(g);
      }
    }

    if (games.length > 0) {
      cachedActualGames = games;
    }
  } catch (err) {
    console.warn('実ゲーム取得エラー（キャッシュを使用）:', err);
  }

  const pool = cachedActualGames.length > 0 ? cachedActualGames : [
    { id: 'demo-retro-runner', title: 'Pixel Cyber Runner', thumbnail_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=640&q=80' },
    { id: 'demo-dungeon-quest', title: 'Dungeon Escape 2D', thumbnail_url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=640&q=80' },
    { id: 'demo-space-fighter', title: 'Galactic Defense', thumbnail_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=640&q=80' }
  ];

  const now = Date.now();
  const shuffled = [...pool].sort(() => 0.5 - Math.random());

  // Ren (レン)
  const renGame = shuffled[0] || pool[0];
  const renSessionSec = Math.floor(180 + Math.random() * 2100);
  presenceStore.set('ren_dev@g-hub.io', {
    user_email: 'ren_dev@g-hub.io',
    username: 'Ren (レン)',
    status: 'playing',
    current_game_id: renGame.id,
    current_game_title: renGame.title,
    current_game_thumb: renGame.thumbnail_url || null,
    current_session_seconds: renSessionSec,
    last_seen: now
  });

  const renHistory = new Map();
  const renPlayedPool = [...pool].sort(() => 0.5 - Math.random()).slice(0, Math.min(4, pool.length));
  if (!renPlayedPool.some(g => g.id === renGame.id)) renPlayedPool.unshift(renGame);
  renPlayedPool.forEach((g, idx) => {
    const totalSec = Math.floor(900 + Math.random() * 9900);
    const lastPlayed = new Date(now - (idx * 3600000 * 12 + Math.floor(Math.random() * 1800000))).toISOString();
    renHistory.set(g.id, {
      game_id: g.id,
      game_title: g.title,
      game_thumb: g.thumbnail_url || undefined,
      total_seconds: totalSec,
      last_played_at: lastPlayed
    });
  });
  playHistoryStore.set('ren_dev@g-hub.io', renHistory);

  // Yuki (ユキ)
  const yukiGame = (pool.length > 1 ? shuffled[1] : pool[0]) || pool[0];
  const yukiSessionSec = Math.floor(300 + Math.random() * 2700);
  presenceStore.set('yuki_game@g-hub.io', {
    user_email: 'yuki_game@g-hub.io',
    username: 'Yuki (ユキ)',
    status: 'playing',
    current_game_id: yukiGame.id,
    current_game_title: yukiGame.title,
    current_game_thumb: yukiGame.thumbnail_url || null,
    current_session_seconds: yukiSessionSec,
    last_seen: now
  });

  const yukiHistory = new Map();
  const yukiPlayedPool = [...pool].sort(() => 0.5 - Math.random()).slice(0, Math.min(4, pool.length));
  if (!yukiPlayedPool.some(g => g.id === yukiGame.id)) yukiPlayedPool.unshift(yukiGame);
  yukiPlayedPool.forEach((g, idx) => {
    const totalSec = Math.floor(1200 + Math.random() * 11000);
    const lastPlayed = new Date(now - (idx * 3600000 * 8 + Math.floor(Math.random() * 3600000))).toISOString();
    yukiHistory.set(g.id, {
      game_id: g.id,
      game_title: g.title,
      game_thumb: g.thumbnail_url || undefined,
      total_seconds: totalSec,
      last_played_at: lastPlayed
    });
  });
  playHistoryStore.set('yuki_game@g-hub.io', yukiHistory);

  // Alex (アレックス)
  const alexIsPlaying = Math.random() > 0.35;
  const alexGame = alexIsPlaying ? (shuffled[2] || shuffled[0] || pool[0]) : null;
  presenceStore.set('alex_indie@g-hub.io', {
    user_email: 'alex_indie@g-hub.io',
    username: 'Alex (アレックス)',
    status: alexIsPlaying ? 'playing' : 'online',
    current_game_id: alexGame ? alexGame.id : null,
    current_game_title: alexGame ? alexGame.title : null,
    current_game_thumb: alexGame ? (alexGame.thumbnail_url || null) : null,
    current_session_seconds: alexIsPlaying ? Math.floor(120 + Math.random() * 1500) : 0,
    last_seen: now - Math.floor(Math.random() * 20000)
  });

  const alexHistory = new Map();
  const alexPlayedPool = [...pool].sort(() => 0.5 - Math.random()).slice(0, Math.min(3, pool.length));
  if (alexGame && !alexPlayedPool.some(g => g.id === alexGame.id)) alexPlayedPool.unshift(alexGame);
  alexPlayedPool.forEach((g, idx) => {
    const totalSec = Math.floor(600 + Math.random() * 7000);
    const lastPlayed = new Date(now - (idx * 3600000 * 18 + Math.floor(Math.random() * 3600000))).toISOString();
    alexHistory.set(g.id, {
      game_id: g.id,
      game_title: g.title,
      game_thumb: g.thumbnail_url || undefined,
      total_seconds: totalSec,
      last_played_at: lastPlayed
    });
  });
  playHistoryStore.set('alex_indie@g-hub.io', alexHistory);

  // Charlotte (シャルロット) - オフライン
  presenceStore.set('charlotte@g-hub.io', {
    user_email: 'charlotte@g-hub.io',
    username: 'Charlotte (シャルロット)',
    status: 'offline',
    current_game_id: null,
    current_game_title: null,
    current_session_seconds: 0,
    last_seen: now - 3600000 * (2 + Math.floor(Math.random() * 5))
  });

  const charlotteHistory = new Map();
  const charlottePlayedPool = [...pool].sort(() => 0.5 - Math.random()).slice(0, Math.min(2, pool.length));
  charlottePlayedPool.forEach((g, idx) => {
    const totalSec = Math.floor(400 + Math.random() * 5000);
    const lastPlayed = new Date(now - (idx * 3600000 * 24 + 3600000 * 3)).toISOString();
    charlotteHistory.set(g.id, {
      game_id: g.id,
      game_title: g.title,
      game_thumb: g.thumbnail_url || undefined,
      total_seconds: totalSec,
      last_played_at: lastPlayed
    });
  });
  playHistoryStore.set('charlotte@g-hub.io', charlotteHistory);

  lastDemoFriendsRefresh = now;
}

refreshDemoFriendsFromActualGames();
setInterval(refreshDemoFriendsFromActualGames, 180000);

// ゲーム保存 & バックアップ API (投稿したゲームが見つからない問題を根本防止)
app.get('/api/games', (req, res) => {
  const game_id = req.query.id;
  if (game_id) {
    const game = gamesStore.get(game_id);
    if (game) return res.json(game);
    const cached = cachedActualGames.find(g => g.id === game_id);
    if (cached) return res.json(cached);
    return res.status(404).json({ error: 'Game not found' });
  }
  res.json(Array.from(gamesStore.values()));
});

app.post('/api/games', (req, res) => {
  const gameData = req.body;
  if (!gameData || !gameData.id) return res.status(400).json({ error: 'Missing gameData or id' });
  
  gamesStore.set(gameData.id, {
    ...gameData,
    created_at: gameData.created_at || new Date().toISOString()
  });

  if (!cachedActualGames.some(g => g.id === gameData.id)) {
    cachedActualGames.unshift(gameData);
  }

  refreshDemoFriendsFromActualGames();
  res.json({ success: true, game: gameData });
});

app.post('/api/games/payload', (req, res) => {
  const { game_id, filename, contentType, base64Data, textData } = req.body;
  if (!game_id) return res.status(400).json({ error: 'Missing game_id' });

  let buffer;
  if (base64Data) {
    buffer = Buffer.from(base64Data, 'base64');
  } else if (textData) {
    buffer = Buffer.from(textData, 'utf-8');
  } else {
    return res.status(400).json({ error: 'Missing data' });
  }

  payloadsStore.set(game_id, {
    filename: filename || 'index.html',
    contentType: contentType || (filename?.endsWith('.zip') ? 'application/zip' : 'text/html'),
    buffer
  });

  const entry_url = `/api/games/payload/${encodeURIComponent(game_id)}`;
  res.json({ success: true, entry_url });
});

app.get('/api/games/payload/:id', (req, res) => {
  const id = req.params.id;
  const payload = payloadsStore.get(id);
  if (!payload) return res.status(404).send('Game file not found');
  res.setHeader('Content-Type', payload.contentType);
  res.send(payload.buffer);
});

// オフライン用アセット配信
app.use('/offline-assets', express.static(path.join(__dirname, 'offline-assets')));

// 📥 完全オフライン用HTMLパッケージダウンロードAPI
app.get('/api/download-offline-game', async (req, res) => {
  const game_id = req.query.id;
  if (!game_id) return res.status(400).send('Missing game id');

  let game = gamesStore.get(game_id) || cachedActualGames.find(g => g.id === game_id);
  if (!game) {
    try {
      const sRes = await fetch(`https://ddcnoghsiuxfhnwmtpyn.supabase.co/rest/v1/games?id=eq.${encodeURIComponent(game_id)}&select=*`, {
        headers: {
          'apikey': 'sb_publishable_cSX9rcWTjbX6lWfyT1KLNQ_tUFYuXtj',
          'Authorization': 'Bearer sb_publishable_cSX9rcWTjbX6lWfyT1KLNQ_tUFYuXtj'
        },
        signal: AbortSignal.timeout(5000)
      });
      if (sRes.ok) {
        const arr = await sRes.json();
        if (arr && arr[0]) game = arr[0];
      }
    } catch (e) {}
  }

  if (!game) return res.status(404).send('Game not found');

  let htmlContent = '';
  const payload = payloadsStore.get(game_id);
  if (payload && payload.contentType.includes('html')) {
    htmlContent = payload.buffer.toString('utf-8');
  } else if (payload && (payload.contentType.includes('zip') || payload.contentType.includes('octet-stream'))) {
    try {
      const zip = await JSZip.loadAsync(payload.buffer);
      const files = Object.keys(zip.files);
      const htmlFile = files.find(f => f.toLowerCase().endsWith('index.html') && !zip.files[f].dir);
      if (htmlFile) {
        htmlContent = await zip.files[htmlFile].async('text');
      }
    } catch (e) {
      console.warn('Zip展開エラー:', e);
    }
  } else if (game.entry_url) {
    try {
      let fetchUrl = game.entry_url;
      if (fetchUrl.includes('supabase.co')) {
        fetchUrl = fetchUrl.replace(/https:\/\/[^/]+\.supabase\.co/, 'https://ddcnoghsiuxfhnwmtpyn.supabase.co');
      }
      const gRes = await fetch(fetchUrl);
      if (gRes.ok) {
        const ab = await gRes.arrayBuffer();
        const u8 = new Uint8Array(ab);
        if (u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4B) {
          // Zip検出
          try {
            const zip = await JSZip.loadAsync(ab);
            const files = Object.keys(zip.files);
            const htmlFile = files.find(f => f.toLowerCase().endsWith('index.html') && !zip.files[f].dir);
            if (htmlFile) {
              htmlContent = await zip.files[htmlFile].async('text');
            }
          } catch (e) {}
        } else {
          const text = new TextDecoder('utf-8').decode(u8);
          if (text.includes('<html') || text.includes('<!DOCTYPE') || text.includes('<script')) {
            htmlContent = text;
          }
        }
      }
    } catch (e) {}
  }

  if (!htmlContent) {
    htmlContent = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${game.title}</title><style>body{background:#0b0f19;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head><body><div style="text-align:center;"><h1>🎮 ${game.title}</h1><p>${game.description || ''}</p></div></body></html>`;
  }

  // オフライン用ライブラリコード読み込み
  const reactPath = path.join(__dirname, 'offline-assets/react.production.min.js');
  const reactDomPath = path.join(__dirname, 'offline-assets/react-dom.production.min.js');
  const tailwindPath = path.join(__dirname, 'offline-assets/tailwind.min.js');

  const reactCode = fs.existsSync(reactPath) ? fs.readFileSync(reactPath, 'utf-8') : '';
  const reactDomCode = fs.existsSync(reactDomPath) ? fs.readFileSync(reactDomPath, 'utf-8') : '';
  const tailwindCode = fs.existsSync(tailwindPath) ? fs.readFileSync(tailwindPath, 'utf-8') : '';

  const offlineImportMap = `
  <script type="importmap">
  {
    "imports": {
      "react": "data:text/javascript;charset=utf-8,export default window.React;export const {createElement,useState,useEffect,useRef,useMemo,useCallback,useContext,createContext,useReducer,Suspense,Fragment,Children,isValidElement,cloneElement}=window.React;",
      "react/jsx-runtime": "data:text/javascript;charset=utf-8,export const jsx=window.React.createElement;export const jsxs=window.React.createElement;export const Fragment=window.React.Fragment;",
      "react-dom": "data:text/javascript;charset=utf-8,export default window.ReactDOM;",
      "react-dom/client": "data:text/javascript;charset=utf-8,export const createRoot=window.ReactDOM.createRoot;export const hydrateRoot=window.ReactDOM.hydrateRoot;export default window.ReactDOM;",
      "https://esm.sh/react@18.2.0?dev": "data:text/javascript;charset=utf-8,export default window.React;export const {createElement,useState,useEffect,useRef,useMemo,useCallback,useContext,createContext,useReducer,Suspense,Fragment,Children,isValidElement,cloneElement}=window.React;",
      "https://esm.sh/react@18.2.0": "data:text/javascript;charset=utf-8,export default window.React;export const {createElement,useState,useEffect,useRef,useMemo,useCallback,useContext,createContext,useReducer,Suspense,Fragment,Children,isValidElement,cloneElement}=window.React;",
      "https://esm.sh/react-dom@18.2.0/client?dev": "data:text/javascript;charset=utf-8,export const createRoot=window.ReactDOM.createRoot;export const hydrateRoot=window.ReactDOM.hydrateRoot;export default window.ReactDOM;",
      "https://esm.sh/react-dom@18.2.0/client": "data:text/javascript;charset=utf-8,export const createRoot=window.ReactDOM.createRoot;export const hydrateRoot=window.ReactDOM.hydrateRoot;export default window.ReactDOM;",
      "https://esm.sh/react-dom@18.2.0": "data:text/javascript;charset=utf-8,export default window.ReactDOM;",
      "https://esm.sh/react-dom": "data:text/javascript;charset=utf-8,export default window.ReactDOM;"
    }
  }
  </script>
  `;

  const inlineLibs = `
  <script>
  /* G-HUB Offline Packager: Embedded React 18 & ReactDOM Engine & Safety Shims */
  window.__GHUB_OFFLINE = true;
  document.addEventListener('click', () => {
    if (window.AudioContext || window.webkitAudioContext) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
      } catch(e){}
    }
  }, { once: true });
  ${reactCode}
  ${reactDomCode}
  </script>
  ${offlineImportMap}
  `;

  // Tailwind CDNのスクリプトをローカルインライン版に置換
  if (htmlContent.includes('cdn.tailwindcss.com')) {
    htmlContent = htmlContent.replace(/<script[^>]*src=["'][^"']*cdn\.tailwindcss\.com[^"']*["'][^>]*><\/script>/gi, `<script>${tailwindCode}</script>`);
  }

  if (htmlContent.includes('<head>')) {
    htmlContent = htmlContent.replace('<head>', `<head>${inlineLibs}`);
  } else if (htmlContent.includes('<html>')) {
    htmlContent = htmlContent.replace('<html>', `<html><head>${inlineLibs}</head>`);
  } else {
    htmlContent = `<head>${inlineLibs}</head>${htmlContent}`;
  }

  const safeTitle = (game.title || 'game').replace(/[/\\?%*:|"<>]/g, '_');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle)}-offline.html`);
  res.send(htmlContent);
});

// 📁 元のゲームファイル (ZIP / HTML) ダウンロードAPI
app.get('/api/download-raw-game', async (req, res) => {
  const game_id = req.query.id;
  if (!game_id) return res.status(400).send('Missing game id');

  let game = gamesStore.get(game_id) || cachedActualGames.find(g => g.id === game_id);
  if (!game) {
    try {
      const sRes = await fetch(`https://ddcnoghsiuxfhnwmtpyn.supabase.co/rest/v1/games?id=eq.${encodeURIComponent(game_id)}&select=*`, {
        headers: {
          'apikey': 'sb_publishable_cSX9rcWTjbX6lWfyT1KLNQ_tUFYuXtj',
          'Authorization': 'Bearer sb_publishable_cSX9rcWTjbX6lWfyT1KLNQ_tUFYuXtj'
        },
        signal: AbortSignal.timeout(5000)
      });
      if (sRes.ok) {
        const arr = await sRes.json();
        if (arr && arr[0]) game = arr[0];
      }
    } catch (e) {}
  }

  const payload = payloadsStore.get(game_id);
  if (payload) {
    const ext = payload.contentType.includes('zip') ? '.zip' : '.html';
    const safeTitle = (game?.title || 'game').replace(/[/\\?%*:|"<>]/g, '_');
    res.setHeader('Content-Type', payload.contentType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle)}${ext}`);
    return res.send(payload.buffer);
  }

  if (game && game.entry_url) {
    return res.redirect(game.entry_url);
  }

  res.status(404).send('Raw game file not found');
});

// 💎 ゲーム内課金（アイテム購入・永続管理）API
const inGamePurchasesStore = new Map();

app.get('/api/ingame-purchases', (req, res) => {
  const game_id = req.query.game_id;
  const user_email = req.query.user_email;
  if (!game_id || !user_email) return res.json({ purchases: [], owned_items: [] });
  
  const key = `${game_id}:${user_email}`;
  const list = inGamePurchasesStore.get(key) || [];
  const ownedItemIds = Array.from(new Set(list.filter(p => !p.consumable).map(p => p.item_id)));
  res.json({
    purchases: list,
    owned_items: ownedItemIds
  });
});

app.post('/api/ingame-purchases', (req, res) => {
  const { game_id, user_email, item_id, item_name, price_coins, consumable } = req.body;
  if (!game_id || !user_email || !item_id) return res.status(400).json({ error: 'Missing required fields' });
  
  const key = `${game_id}:${user_email}`;
  const list = inGamePurchasesStore.get(key) || [];
  const record = {
    id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    game_id,
    user_email,
    item_id,
    item_name: item_name || item_id,
    price_coins: Number(price_coins) || 0,
    consumable: Boolean(consumable),
    created_at: new Date().toISOString()
  };
  list.push(record);
  inGamePurchasesStore.set(key, list);

  res.json({ success: true, transaction: record });
});

// 🪙 テストコインチャージ API
app.post('/api/charge-coins', (req, res) => {
  const { user_email, amount } = req.body;
  res.json({ success: true, user_email: user_email || 'guest', charged: Number(amount) || 100 });
});

// フレンド管理 API
app.get('/api/friends', (req, res) => {
  const user_email = req.query.user_email;
  if (!user_email) return res.json([]);
  let set = friendsStore.get(user_email);
  if (!set || set.size === 0) {
    set = new Set(['ren_dev@g-hub.io', 'yuki_game@g-hub.io', 'alex_indie@g-hub.io']);
    friendsStore.set(user_email, set);
  }
  res.json(Array.from(set));
});

app.post('/api/friends', (req, res) => {
  const { user_email, friend_email } = req.body;
  if (!user_email || !friend_email) return res.status(400).json({ error: 'Missing emails' });
  let set = friendsStore.get(user_email);
  if (!set) {
    set = new Set(['ren_dev@g-hub.io', 'yuki_game@g-hub.io']);
    friendsStore.set(user_email, set);
  }
  set.add(friend_email);
  res.json({ success: true, friends: Array.from(set) });
});

app.delete('/api/friends', (req, res) => {
  const { user_email, friend_email } = req.body;
  if (!user_email || !friend_email) return res.status(400).json({ error: 'Missing emails' });
  let set = friendsStore.get(user_email);
  if (set) {
    set.delete(friend_email);
  }
  res.json({ success: true });
}); // user_email -> (game_id -> record)

// プレゼンス更新（ハートビート）
app.post('/api/presence', (req, res) => {
  const { user_email, username, status, current_game_id, current_game_title, current_game_thumb, current_session_seconds } = req.body;
  if (!user_email) return res.status(400).json({ error: 'Missing user_email' });

  const record = {
    user_email,
    username: username || user_email.split('@')[0],
    status: status || 'online',
    current_game_id: current_game_id || null,
    current_game_title: current_game_title || null,
    current_game_thumb: current_game_thumb || null,
    current_session_seconds: Number(current_session_seconds) || 0,
    last_seen: Date.now()
  };
  presenceStore.set(user_email, record);

  // プレイ中なら履歴にも加算
  if (current_game_id && current_game_title) {
    let userHistory = playHistoryStore.get(user_email);
    if (!userHistory) {
      userHistory = new Map();
      playHistoryStore.set(user_email, userHistory);
    }
    const existing = userHistory.get(current_game_id);
    const totalSec = (existing?.total_seconds || 0) + 10;
    userHistory.set(current_game_id, {
      game_id: current_game_id,
      game_title: current_game_title,
      game_thumb: current_game_thumb || existing?.game_thumb,
      total_seconds: totalSec,
      last_played_at: new Date().toISOString()
    });
  }

  res.json({ success: true });
});

// プレゼンス＆プレイ履歴取得
app.get('/api/presence', (req, res) => {
  const emailsQuery = req.query.emails;
  const targetEmail = req.query.user_email;

  const emails = emailsQuery ? emailsQuery.split(',').map(e => e.trim()) : (targetEmail ? [targetEmail] : []);
  const now = Date.now();
  const results = {};

  const checkEmails = emails.length > 0 ? emails : Array.from(presenceStore.keys());

  for (const email of checkEmails) {
    const pres = presenceStore.get(email);
    const isOnline = pres ? (now - pres.last_seen < 60000) : false;

    const userHistoryMap = playHistoryStore.get(email);
    const historyList = userHistoryMap ? Array.from(userHistoryMap.values()).sort((a, b) => new Date(b.last_played_at).getTime() - new Date(a.last_played_at).getTime()) : [];

    results[email] = {
      user_email: email,
      username: pres?.username || email.split('@')[0],
      is_online: isOnline,
      status: isOnline ? (pres?.status || 'online') : 'offline',
      current_game: (isOnline && pres?.status === 'playing' && pres?.current_game_id) ? {
        id: pres.current_game_id,
        title: pres.current_game_title,
        thumb: pres.current_game_thumb,
        session_seconds: pres.current_session_seconds || 0
      } : null,
      last_seen: pres ? new Date(pres.last_seen).toISOString() : null,
      play_history: historyList
    };
  }

  res.json(results);
});

// 体験版プレイ制限時間（設定・取得API）
const trialsStore = new Map();

app.get('/api/game-trials', (req, res) => {
  const game_id = req.query.game_id;
  if (game_id) {
    const minutes = trialsStore.get(game_id) || 0;
    return res.json({ game_id, trial_minutes: minutes });
  }
  const result = {};
  for (const [gid, min] of trialsStore.entries()) {
    result[gid] = min;
  }
  res.json(result);
});

app.post('/api/game-trials', (req, res) => {
  const { game_id, trial_minutes } = req.body;
  if (!game_id) return res.status(400).json({ error: 'Missing game_id' });
  const min = Number(trial_minutes) || 0;
  trialsStore.set(game_id, min);
  res.json({ success: true, game_id, trial_minutes: min });
});

// 3. G-AI (Qwen 2.5 Coder) 二重化エンドポイント
app.post('/ai', async (req, res) => {
  const { systemPrompt, userPrompt, maxTokens = 1500 } = req.body;

  // --- ルートA: Hugging Face (Qwen 2.5 Coder) ---
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch('https://api-inference.huggingface.co/models/Qwen/Qwen2.5-Coder-1.5B-Instruct/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
        'x-wait-for-model': 'true'
      },
      body: JSON.stringify({
        model: 'Qwen/Qwen2.5-Coder-1.5B-Instruct',
        messages: [
          { role: 'system', content: systemPrompt || 'You are G-AI, a gaming assistant on G-HUB.' },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content;
      if (reply) return res.json({ reply });
    }
  } catch (e) {
    console.log('Hugging Face待機タイムアウト。即座にバックアップQwenへ切り替えます...');
  }

  // --- ルートB: 高速バックアップQwenサーバー ---
  try {
    console.log('⚡ バックアップQwenエンジンで即時生成中...');
    const backupRes = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt || 'You are G-AI on G-HUB. Speak in cheerful Japanese.' },
          { role: 'user', content: userPrompt }
        ],
        model: 'qwen-coder',
        seed: Math.floor(Math.random() * 10000)
      })
    });

    if (backupRes.ok) {
      const reply = await backupRes.text();
      return res.json({ reply });
    }
    throw new Error('バックアップエンジン応答なし');
  } catch (err) {
    console.error('All AI engines failed:', err);
    res.status(500).json({ error: 'AIエンジンの接続に失敗しました。もう一度お試しください。' });
  }
});

// 4. 静的ファイル配信
app.use(express.static(path.join(__dirname, '.')));

app.listen(PORT, () => {
  console.log(`G-HUB server running on port ${PORT}`);
});
