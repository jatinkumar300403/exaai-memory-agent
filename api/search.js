// Vercel Serverless Function: POST /api/search
// Proxies search requests to Exa API with the server-side API key.

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const EXA_API_KEY = process.env.EXA_API_KEY;
  if (!EXA_API_KEY) {
    return res.status(500).json({ error: 'EXA_API_KEY not configured' });
  }

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
    res.status(502).json({ error: 'Failed to reach Exa API', detail: err.message });
  }
};
