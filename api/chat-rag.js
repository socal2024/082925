// api/chat-rag.js
export const config = { runtime: 'nodejs' };

const GEMINI_MODEL = 'gemini-2.0-flash';
const EMBEDDING_MODEL = 'embedding-001';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { message } = await safeJson(req);
    if (!message) {
      return res.status(400).json({ error: 'Please include a "message" string.' });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    if (!apiKey || !supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Missing env vars' });
    }

    // Step 1: Embed the user query
    const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`;
    const embedResp = await fetch(embedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        content: { parts: [{ text: message }] }
      })
    });
    const embedData = await embedResp.json();
    const queryEmbedding = embedData?.embedding?.values || [];

    // Step 2: Search Supabase
    const rpcUrl = `${supabaseUrl}/rest/v1/rpc/match_documents`;
    const searchResp = await fetch(rpcUrl, {
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
    const matches = await searchResp.json();
    const context = matches.map(m => m.content).join("\n\n");

    // Step 3: Build RAG prompt
    const ragPrompt = `You are an expert commercial real estate investor with expertise in multifamily and light industrial properties, including development, investment purchases, and acting as an LP in syndications.  You advise other commercial real estate investors based on your knowledge and the context provided. 

Context:
${context}

Question: ${message}
Answer:`;

    // Step 4: Call Gemini
    const chatUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const chatResp = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: ragPrompt }] }]
      })
    });

    if (!chatResp.ok) {
      const txt = await chatResp.text();
      return res.status(502).json({ error: 'Gemini request failed', detail: txt });
    }

    const chatData = await chatResp.json();
    const reply = chatData.candidates?.[0]?.content?.parts?.[0]?.text || 'No reply';

    return res.status(200).json({ reply, matches });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unknown error' });
  }
}

async function safeJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}
