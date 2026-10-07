import express, { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

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

// レビュー保存用インメモリキャッシュ（Supabase側の補助・フォールバック対応）
interface ReviewItem {
  id: string;
  game_id: string;
  user_name: string;
  user_email: string;
  rating: number;
  comment: string;
  created_at: string;
}

const reviewsStore = new Map<string, ReviewItem[]>();

// 全ゲームの平均星評価サマリー（高速レスポンスでホーム画面を爆速化）
app.get('/api/reviews/summary', (_req: Request, res: Response) => {
  const summary: Record<string, { avg: string; count: number }> = {};
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

app.get('/api/reviews', (req: Request, res: Response) => {
  const game_id = req.query.game_id as string;
  if (!game_id) return res.json([]);
  const list = reviewsStore.get(game_id) || [];
  res.json(list);
});

app.post('/api/reviews', (req: Request, res: Response) => {
  const { game_id, user_name, user_email, rating, comment } = req.body;
  if (!game_id || !rating) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  const list = reviewsStore.get(game_id) || [];
  const newReview: ReviewItem = {
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
interface GameUpdateItem {
  id: string;
  game_id: string;
  version_title: string;
  changelog: string;
  updated_at: string;
  author_email?: string;
}

const updatesStore = new Map<string, GameUpdateItem[]>();

app.get('/api/game-updates', (req: Request, res: Response) => {
  const game_id = req.query.game_id as string;
  if (!game_id) return res.json([]);
  const list = updatesStore.get(game_id) || [];
  res.json(list);
});

app.post('/api/game-updates', (req: Request, res: Response) => {
  const { game_id, version_title, changelog, author_email } = req.body;
  if (!game_id || !changelog) {
    return res.status(400).json({ error: 'Missing game_id or changelog' });
  }
  const list = updatesStore.get(game_id) || [];
  const newUpdate: GameUpdateItem = {
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
interface UserPresence {
  user_email: string;
  username: string;
  status: 'online' | 'playing' | 'idle' | 'offline';
  current_game_id?: string | null;
  current_game_title?: string | null;
  current_game_thumb?: string | null;
  current_session_seconds?: number;
  last_seen: number;
}

interface GamePlayRecord {
  game_id: string;
  game_title: string;
  game_thumb?: string;
  total_seconds: number;
  last_played_at: string;
}

const presenceStore = new Map<string, UserPresence>();
const playHistoryStore = new Map<string, Map<string, GamePlayRecord>>(); // user_email -> (game_id -> record)
const friendsStore = new Map<string, Set<string>>(); // user_email -> Set of friend_emails

// デモユーザーのプレゼンス＆プレイ履歴を設定
function seedDemoFriends() {
  const now = Date.now();
  const demoUsers: UserPresence[] = [
    {
      user_email: 'ren_dev@g-hub.io',
      username: 'Ren (レン)',
      status: 'playing',
      current_game_id: 'demo-retro-runner',
      current_game_title: 'Pixel Cyber Runner',
      current_game_thumb: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=640&q=80',
      current_session_seconds: 480,
      last_seen: now
    },
    {
      user_email: 'yuki_game@g-hub.io',
      username: 'Yuki (ユキ)',
      status: 'playing',
      current_game_id: 'demo-dungeon-quest',
      current_game_title: 'Dungeon Escape 2D',
      current_game_thumb: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=640&q=80',
      current_session_seconds: 1320,
      last_seen: now
    },
    {
      user_email: 'alex_indie@g-hub.io',
      username: 'Alex (アレックス)',
      status: 'online',
      current_game_id: null,
      current_game_title: null,
      current_session_seconds: 0,
      last_seen: now - 15000
    },
    {
      user_email: 'charlotte@g-hub.io',
      username: 'Charlotte (シャルロット)',
      status: 'offline',
      current_game_id: null,
      current_game_title: null,
      current_session_seconds: 0,
      last_seen: now - 3600000 * 3
    }
  ];

  for (const u of demoUsers) {
    presenceStore.set(u.user_email, u);
  }

  const renHistory = new Map<string, GamePlayRecord>();
  renHistory.set('demo-retro-runner', {
    game_id: 'demo-retro-runner',
    game_title: 'Pixel Cyber Runner',
    game_thumb: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=640&q=80',
    total_seconds: 5240,
    last_played_at: new Date(now - 120000).toISOString()
  });
  renHistory.set('demo-space-fighter', {
    game_id: 'demo-space-fighter',
    game_title: 'Galactic Defense',
    game_thumb: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=640&q=80',
    total_seconds: 2880,
    last_played_at: new Date(now - 86400000).toISOString()
  });
  playHistoryStore.set('ren_dev@g-hub.io', renHistory);

  const yukiHistory = new Map<string, GamePlayRecord>();
  yukiHistory.set('demo-dungeon-quest', {
    game_id: 'demo-dungeon-quest',
    game_title: 'Dungeon Escape 2D',
    game_thumb: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=640&q=80',
    total_seconds: 9400,
    last_played_at: new Date(now - 300000).toISOString()
  });
  yukiHistory.set('demo-puzzle-match', {
    game_id: 'demo-puzzle-match',
    game_title: 'Neon Crystal Block',
    game_thumb: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=640&q=80',
    total_seconds: 1800,
    last_played_at: new Date(now - 86400000 * 2).toISOString()
  });
  playHistoryStore.set('yuki_game@g-hub.io', yukiHistory);
}

seedDemoFriends();

// フレンド管理 API
app.get('/api/friends', (req: Request, res: Response) => {
  const user_email = req.query.user_email as string;
  if (!user_email) return res.json([]);
  let set = friendsStore.get(user_email);
  if (!set || set.size === 0) {
    set = new Set(['ren_dev@g-hub.io', 'yuki_game@g-hub.io', 'alex_indie@g-hub.io']);
    friendsStore.set(user_email, set);
  }
  res.json(Array.from(set));
});

app.post('/api/friends', (req: Request, res: Response) => {
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

app.delete('/api/friends', (req: Request, res: Response) => {
  const { user_email, friend_email } = req.body;
  if (!user_email || !friend_email) return res.status(400).json({ error: 'Missing emails' });
  let set = friendsStore.get(user_email);
  if (set) {
    set.delete(friend_email);
  }
  res.json({ success: true });
});

// プレゼンス更新（ハートビート）
app.post('/api/presence', (req: Request, res: Response) => {
  const { user_email, username, status, current_game_id, current_game_title, current_game_thumb, current_session_seconds } = req.body;
  if (!user_email) return res.status(400).json({ error: 'Missing user_email' });

  const record: UserPresence = {
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
    const totalSec = (existing?.total_seconds || 0) + 10; // ハートビート毎に10秒加算
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
app.get('/api/presence', (req: Request, res: Response) => {
  const emailsQuery = req.query.emails as string;
  const targetEmail = req.query.user_email as string;

  const emails = emailsQuery ? emailsQuery.split(',').map(e => e.trim()) : (targetEmail ? [targetEmail] : []);
  const now = Date.now();
  const results: Record<string, any> = {};

  // emailsが指定されていない場合は全アクティブユーザー
  const checkEmails = emails.length > 0 ? emails : Array.from(presenceStore.keys());

  for (const email of checkEmails) {
    const pres = presenceStore.get(email);
    const isOnline = pres ? (now - pres.last_seen < 60000) : false; // 60秒以内でオンライン判定

    // プレイ履歴の取得
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

// 3. G-AI (Qwen 2.5 Coder) 二重化エンドポイント
app.post('/ai', async (req: Request, res: Response) => {
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
      const data: any = await response.json();
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
