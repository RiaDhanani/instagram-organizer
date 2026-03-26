// api/websearch.js — Vercel serverless proxy to OpenRouter (Perplexity sonar for web search)
// Uses the same OPENROUTER_API_KEY as categorize.js — no separate OpenAI key needed.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { input } = req.body;

  if (!input || typeof input !== 'string') {
    return res.status(400).json({ error: 'input string required' });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://saved-posts-organizer.vercel.app',
        'X-Title': 'Instagram Saved Posts Organizer',
      },
      body: JSON.stringify({
        model: 'perplexity/sonar',
        messages: [{ role: 'user', content: input }],
      }),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream request failed', detail: err.message });
  }
};
