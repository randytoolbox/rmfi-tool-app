export default async function handler(req, res) {
  try {
    const r = await fetch('https://api.coincap.io/v2/assets?limit=100');
    const data = await r.json();
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
