export default async function handler(req, res) {
  const { ids } = req.query;
  if (!ids) return res.status(400).json({ error: 'ids required' });
  try {
    const r = await fetch(`https://api.coincap.io/v2/assets?ids=${encodeURIComponent(ids)}&limit=50`);
    const data = await r.json();
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
