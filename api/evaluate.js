// Vercel Serverless Function: POST /api/evaluate
// Sends search results to Gemini for AI relevance evaluation.

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(501).json({
      error: 'Gemini API key not configured',
      detail: 'Add GEMINI_API_KEY to enable AI auto-rating.'
    });
  }

  const { query, results } = req.body;

  if (!query || !results || !results.length) {
    return res.status(400).json({ error: 'Missing query or results' });
  }

  const resultSummaries = results.map((r, i) => (
    `[${i}] Title: ${(r.title || 'Untitled').slice(0, 120)}\n` +
    `    URL: ${r.url || 'N/A'}\n` +
    `    Highlight: ${(r.highlight || 'No preview').slice(0, 200)}`
  )).join('\n\n');

  const prompt = `You are a search relevance judge for an AI research agent. Evaluate how relevant each search result is to the user's query.

QUERY: "${query}"

RESULTS:
${resultSummaries}

For each result, provide:
- "score": relevance from 0.0 to 1.0
- "verdict": "relevant", "partial", or "irrelevant"
- "reason": 5-10 word explanation

Respond with ONLY valid JSON:
{"evaluations":[{"index":0,"score":0.85,"verdict":"relevant","reason":"directly discusses the topic"}]}`;

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
      return res.status(geminiRes.status).json({ error: 'Gemini API error', detail: errText.slice(0, 200) });
    }

    const geminiData = await geminiRes.json();
    const parts = geminiData?.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find(p => p.text !== undefined);
    const textContent = textPart?.text;

    if (!textContent) {
      return res.status(502).json({ error: 'Empty response from Gemini' });
    }

    let cleaned = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleaned = jsonMatch[0];

    res.json(JSON.parse(cleaned));
  } catch (err) {
    res.status(502).json({ error: 'Failed to evaluate results', detail: err.message });
  }
};
