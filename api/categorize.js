// api/categorize.js — Vercel serverless proxy to OpenRouter
// The OPENROUTER_API_KEY env var is set in the Vercel dashboard and never exposed to the browser.
// Callers may pass an optional `userApiKey` (used directly; never logged) and `model` override.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, max_tokens, model, userApiKey } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const apiKey = userApiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const upstreamUrl = 'https://openrouter.ai/api/v1/chat/completions';
  const upstreamModel = model || 'mistralai/mistral-small-3.2';
  const upstreamHeaders = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://saved-posts-organizer.vercel.app',
    'X-Title': 'Instagram Saved Posts Organizer',
  };

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify({
        model: upstreamModel,
        max_tokens: max_tokens || 250,
        messages,
      }),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream request failed', detail: err.message });
  }
};
