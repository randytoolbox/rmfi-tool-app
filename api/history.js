export default async function handler(req, res) {
  const { id, start, end } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const url = `https://api.coincap.io/v2/assets/${encodeURIComponent(id)}/history?interval=d1&start=${start}&end=${end}`;
    const r = await fetch(url);
    const data = await r.json();
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
