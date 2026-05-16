require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const EXA_API_KEY = process.env.EXA_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!EXA_API_KEY) {
  console.error('❌  EXA_API_KEY is missing. Add it to .env');
  process.exit(1);
}

// ── Rate limiter (in-memory, no dependencies) ──
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX       = 30;
const rateLimitMap = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return next();
  }

  const entry = rateLimitMap.get(ip);

  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.count = 1;
    entry.windowStart = now;
    return next();
  }

  entry.count++;

  if (entry.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'Rate limit exceeded',
      detail: `Max ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_MS / 1000}s. Retry in ${retryAfter}s.`
    });
  }

  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// ── Middleware ──
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── Proxy: POST /api/search → Exa API ──
app.post('/api/search', rateLimit, async (req, res) => {
  try {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXA_API_KEY
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (err) {
    console.error('Exa proxy error:', err.message);
    res.status(502).json({ error: 'Failed to reach Exa API', detail: err.message });
  }
});

// ── LLM-as-Judge: POST /api/evaluate ──
// Sends results + query to Gemini for autonomous relevance evaluation.
// Returns a score (0-1) and verdict for each result.
app.post('/api/evaluate', rateLimit, async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(501).json({
      error: 'Gemini API key not configured',
      detail: 'Add GEMINI_API_KEY to .env to enable AI auto-rating.'
    });
  }

  const { query, results } = req.body;

  if (!query || !results || !results.length) {
    return res.status(400).json({ error: 'Missing query or results' });
  }

  // Build a compact representation of results for the LLM
  const resultSummaries = results.map((r, i) => (
    `[${i}] Title: ${(r.title || 'Untitled').slice(0, 120)}\n` +
    `    URL: ${r.url || 'N/A'}\n` +
    `    Highlight: ${(r.highlight || 'No preview').slice(0, 200)}`
  )).join('\n\n');

  const prompt = `You are a search relevance judge for an AI research agent. Your job is to evaluate how relevant each search result is to the user's research query.

QUERY: "${query}"

RESULTS:
${resultSummaries}

For each result, provide:
- "score": a relevance score from 0.0 to 1.0 (0 = completely irrelevant, 1 = perfectly relevant)
- "verdict": one of "relevant", "partial", or "irrelevant"
- "reason": a brief 5-10 word explanation

Respond with ONLY valid JSON in this exact format, no markdown:
{"evaluations":[{"index":0,"score":0.85,"verdict":"relevant","reason":"directly discusses the topic"},{"index":1,"score":0.3,"verdict":"partial","reason":"tangentially related content"}]}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText.slice(0, 200));
      return res.status(geminiRes.status).json({
        error: 'Gemini API error',
        detail: errText.slice(0, 200)
      });
    }

    const geminiData = await geminiRes.json();

    // Extract the text response — gemini-2.5-flash returns multiple parts
    // (thinking part + text part). We need the text part specifically.
    const parts = geminiData?.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find(p => p.text !== undefined);
    const textContent = textPart?.text;

    if (!textContent) {
      console.error('Gemini response had no text part. Parts:', JSON.stringify(parts).slice(0, 300));
      return res.status(502).json({ error: 'Empty response from Gemini' });
    }

    // Parse the JSON response — handle markdown fences and extract JSON robustly
    let cleaned = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Try to extract JSON object if there's surrounding text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    const parsed = JSON.parse(cleaned);

    res.json(parsed);
  } catch (err) {
    console.error('Gemini evaluation error:', err.message);
    res.status(502).json({ error: 'Failed to evaluate results', detail: err.message });
  }
});

// ── Health check ──
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    exaKeyLoaded: !!EXA_API_KEY,
    geminiKeyLoaded: !!GEMINI_API_KEY
  });
});

app.listen(PORT, () => {
  console.log(`\n  🟢  Search Memory Agent running at http://localhost:${PORT}\n`);
  console.log(`  ├─ Exa key:    ${EXA_API_KEY.slice(0, 8)}…${EXA_API_KEY.slice(-4)} (loaded from .env)`);
  console.log(`  ├─ Gemini key: ${GEMINI_API_KEY ? GEMINI_API_KEY.slice(0, 6) + '…' + GEMINI_API_KEY.slice(-4) + ' ✓' : '❌  NOT SET (AI auto-rating disabled)'}`);
  console.log(`  ├─ Proxy:      POST /api/search → Exa API`);
  console.log(`  ├─ Evaluate:   POST /api/evaluate → Gemini 2.0 Flash`);
  console.log(`  ├─ Rate limit: ${RATE_LIMIT_MAX} req / ${RATE_LIMIT_WINDOW_MS / 1000}s per IP`);
  console.log(`  └─ Static:     ./public/\n`);
});
