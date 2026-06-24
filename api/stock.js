module.exports = async function handler(req, res) {
  const { sym, range = '5d', interval = '1d' } = req.query;
  if (!sym) return res.status(400).json({ error: 'sym required' });

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  try {
    // Yahoo Finance now requires session cookie + crumb
    const sessionRes = await fetch('https://finance.yahoo.com', {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    });
    const rawCookie = (sessionRes.headers.get('set-cookie') || '').split(';')[0];

    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, 'Cookie': rawCookie },
    });
    const crumb = crumbRes.ok ? await crumbRes.text() : '';

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}${crumb ? '&crumb=' + encodeURIComponent(crumb) : ''}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Cookie': rawCookie, 'Accept': 'application/json' },
    });

    if (r.ok) {
      const data = await r.json();
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.json(data);
    }

    // Fallback: query2
    const r2 = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}${crumb ? '&crumb=' + encodeURIComponent(crumb) : ''}`,
      { headers: { 'User-Agent': UA, 'Cookie': rawCookie, 'Accept': 'application/json' } }
    );
    if (r2.ok) {
      const data = await r2.json();
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.json(data);
    }
  } catch (e) { /* fall through */ }

  res.status(502).json({ error: 'Yahoo Finance unavailable' });
};
