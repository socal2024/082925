// api/search-doc.js
export const config = { runtime: 'nodejs' };

const EMBEDDING_MODEL = 'embedding-001';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { query } = await safeJson(req);
    if (!query) return res.status(400).json({ error: 'Please include a "query" string.' });

    const apiKey = process.env.GOOGLE_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    if (!apiKey || !supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Missing env vars' });
    }

    // 1. Embed the query
    const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`;
    const embedResp = await fetch(embedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBEDDING_MODEL, content: { parts: [{ text: query }] } })
    });
    const embedData = await embedResp.json();
    const queryEmbedding = embedData?.embedding?.values;
    if (!queryEmbedding) return res.status(500).json({ error: 'Failed to get embedding for query' });

    // 2. Use Supabase's match_documents RPC
    const rpcUrl = `${supabaseUrl}/rest/v1/rpc/match_documents`;
    const r = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query_embedding: queryEmbedding,
        match_count: 3
      })
    });
    if (!r.ok) {
      const txt = await r.text();
      return res.status(502).json({ error: 'Supabase search failed', detail: txt });
    }

    const matches = await r.json();
    return res.status(200).json({ matches });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function safeJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { return {}; }
}
