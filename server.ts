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
