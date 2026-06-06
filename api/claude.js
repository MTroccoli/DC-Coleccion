export default async function handler(req, res) {
  // CORS — permite llamadas desde GitHub Pages y Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── Búsqueda por ISBN vía Google Books (sin clave) ──
    if (req.body && req.body.isbn) {
      const isbn = String(req.body.isbn).replace(/[\s-]/g, '');
      const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
      const data = await r.json();
      if (!data.items || !data.items.length) {
        return res.status(200).json({ found: false });
      }
      const v = data.items[0].volumeInfo || {};
      return res.status(200).json({
        found: true,
        title: v.subtitle ? `${v.title}: ${v.subtitle}` : (v.title || ''),
        year: v.publishedDate ? parseInt(v.publishedDate.slice(0, 4)) : null,
        publisher: v.publisher || '',
        authors: v.authors || [],
      });
    }

    // ── Reenvío a Anthropic (lo de siempre) ──
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
