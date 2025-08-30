// api/chat.js
export const config = {
  runtime: 'nodejs20.x'
};

const MODEL = 'gemini-2.0-flash'; // fast & cheap; good default
const TIMEOUT_MS = 20000;

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server not configured: missing GOOGLE_API_KEY' });
    }

    const { message } = await safeJson(req);
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Please include a string "message" in the JSON body.' });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: message }]
        }
      ]
    };

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const r = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }).catch((e) => {
      // fetch throws on abort; normalize it
      if (e.name === 'AbortError') throw new Error('Upstream timeout');
      throw e;
    });
    clearTimeout(id);

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return res.status(502).json({ error: 'Gemini error', status: r.status, detail: text });
    }

    const data = await r.json();

    // Gemini REST response shape: candidates[0].content.parts[].text
    const answer =
      data?.candidates?.[0]?.content?.parts?.map((p) => p?.text).join('') ??
      '(No response text)';

    return res.status(200).json({ reply: answer });
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
