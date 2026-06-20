export default async function handler(req, res) {
  const { sym, range = '5d', interval = '1d' } = req.query;
  if (!sym) return res.status(400).json({ error: 'sym required' });
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; randy-money/1.0)' }
    });
    const data = await r.json();
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
