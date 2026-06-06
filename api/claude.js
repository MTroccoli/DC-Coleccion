export default async function handler(req, res) {
  // CORS — permite llamadas desde GitHub Pages y Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── Búsqueda por ISBN: Open Library primero, Google Books de respaldo ──
    if (req.body && req.body.isbn) {
      const isbn = String(req.body.isbn).replace(/[\s-]/g, '');

      // 1) Open Library (sin cuotas)
      try {
        const olRes = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
        const olData = await olRes.json();
        const book = olData[`ISBN:${isbn}`];
        if (book && book.title) {
          return res.status(200).json({
            found: true,
            source: 'openlibrary',
            title: book.subtitle ? `${book.title}: ${book.subtitle}` : book.title,
            year: book.publish_date ? (book.publish_date.match(/\d{4}/) || [null])[0] : null,
            publisher: (book.publishers && book.publishers[0] && book.publishers[0].name) || '',
            authors: (book.authors || []).map(a => a.name),
          });
        }
      } catch (e) { /* sigue al respaldo */ }

      // 2) Google Books (respaldo)
      try {
        const gRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
        const gData = await gRes.json();
        if (gData.items && gData.items.length) {
          const v = gData.items[0].volumeInfo || {};
          return res.status(200).json({
            found: true,
            source: 'googlebooks',
            title: v.subtitle ? `${v.title}: ${v.subtitle}` : (v.title || ''),
            year: v.publishedDate ? parseInt(v.publishedDate.slice(0, 4)) : null,
            publisher: v.publisher || '',
            authors: v.authors || [],
          });
        }
      } catch (e) { /* sin resultados */ }

      return res.status(200).json({ found: false });
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
