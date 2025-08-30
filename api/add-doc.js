// api/add-doc.js
export const config = {
  runtime: 'nodejs'
};

const EMBEDDING_MODEL = 'embedding-001';

export default async function handler(req, res) {

  // 🔐 Password check (must match CHAT_RAG_PASSWORD in your .env)
  if (req.headers['x-api-pass'] !== process.env.CHAT_RAG_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { content } = await safeJson(req);
    if (!content) {
      return res.status(400).json({ error: 'Please include a "content" string.' });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    if (!apiKey || !supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Missing env vars (GOOGLE_API_KEY, SUPABASE_URL, SUPABASE_KEY)' });
    }

    // 1. Embed the content with Gemini
    const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`;
    const embedBody = {
      model: EMBEDDING_MODEL,
      content: { parts: [{ text: content }] }
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

    // 2. Insert into Supabase
    const insertUrl = `${supabaseUrl}/rest/v1/documents`;
    const r = await fetch(insertUrl, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify([{ content, embedding }])
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(502).json({ error: 'Supabase insert failed', detail: txt });
    }

    const result = await r.json();
    return res.status(200).json({ success: true, inserted: result });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unknown error' });
  }
}

// ---- helpers ----
async function safeJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}
