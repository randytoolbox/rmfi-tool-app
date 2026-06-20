module.exports = async function handler(req, res) {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });

  const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

  let xmlText;
  try {
    const r = await fetch(rss, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; randy-money/1.0)' },
    });
    if (!r.ok) throw new Error('status ' + r.status);
    xmlText = await r.text();
  } catch (e) {
    return res.status(502).json({ error: 'fetch failed: ' + e.message });
  }

  // Parse XML server-side with simple regex (no DOM available in Node)
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xmlText)) !== null && items.length < 8) {
    const block = m[1];

    const titleM = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const title  = (titleM?.[1] || '').replace(/\s*-\s*[^-]+$/, '').trim();
    if (!title) continue;

    // Google RSS: <link/>\nhttps://... OR <link>https://...</link>
    const linkM = block.match(/<link[^>]*\/>\s*(https?:\/\/[^\s<]+)/) ||
                  block.match(/<link[^>]*>(https?:\/\/[^<]+)<\/link>/);
    const guidM = block.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/);
    const link  = (linkM?.[1] || guidM?.[1] || '').trim();

    const dateM  = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/);
    const srcM   = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);

    items.push({
      title,
      link,
      pubDate: (dateM?.[1] || '').trim(),
      source:  (srcM?.[1]  || '').trim(),
    });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=180, stale-while-revalidate=360');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ items });
};
