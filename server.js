import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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

// レビュー保存用メモリ/ファイルキャッシュ（Supabase側の補助・フォールバック対応）
const reviewsStore = new Map();

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

  // --- ルートB: 高速バックアップQwenサーバー（寝ない・0秒起動） ---
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
