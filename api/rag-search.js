// api/rag-search.js

export const config = {
  runtime: 'nodejs'
};

const EMBEDDING_MODEL = 'embedding-001';
const TIMEOUT_MS = 20000;

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { query } = await safeJson(req);
    if (!query) {
      return res.status(400).json({ error: 'Please include a "query" string.' });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    if (!apiKey || !supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Missing env vars (GOOGLE_API_KEY, SUPABASE_URL, SUPABASE_KEY)' });
    }

    // 1. Get embedding from Gemini
    const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`;

    const embedBody = {
      model: EMBEDDING_MODEL,
      content: { parts: [{ text: query }] }
    };

    const embedResp = await fetch(embedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embedBody)
    });

    if (!embedResp.ok) {
      const txt = await embedResp.text();
      return res.status(502).json({ error: 'Embedding request failed', detail: txt });
    }

    const embedData = await embedResp.json();
    const embedding = embedData?.embedding?.values;
    if (!embedding) return res.status(500).json({ error: 'No embedding returned' });

    // 2. Query Supabase for nearest neighbors
    const supabaseResp = await fetch(`${supabaseUrl}/rest/v1/rpc/match_documents`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_count: 3 // top 3 docs
      })
    });

    if (!supabaseResp.ok) {
      const txt = await supabaseResp.text();
      return res.status(502).json({ error: 'Supabase query failed', detail: txt });
    }

    const matches = await supabaseResp.json();
    return res.status(200).json({ matches });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unknown error' });
  }
}

async function safeJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}
