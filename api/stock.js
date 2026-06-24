module.exports = async function handler(req, res) {
  const { sym, range = '5d', interval = '1d' } = req.query;
  if (!sym) return res.status(400).json({ error: 'sym required' });

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
  };

  // Try v8 chart endpoint first
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`;
    const r = await fetch(url, { headers });
    if (r.ok) {
      const data = await r.json();
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.json(data);
    }
  } catch (e) { /* fall through */ }

  // Fallback: v7 quote endpoint, reshape to match v8 structure
  try {
    const url2 = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`;
    const r2 = await fetch(url2, { headers });
    if (r2.ok) {
      const data = await r2.json();
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.json(data);
    }
  } catch (e) { /* fall through */ }

  res.status(502).json({ error: 'Yahoo Finance unavailable' });
};
