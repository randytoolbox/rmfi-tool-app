export default async function handler(req, res) {
  // Try CoinCap first (gives market cap rank)
  try {
    const r = await fetch('https://api.coincap.io/v2/assets?limit=100');
    if (r.ok) {
      const data = await r.json();
      if (data.data?.length) {
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.json(data);
      }
    }
  } catch {}

  // Fallback: Binance top pairs by volume
  try {
    const r = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    if (!r.ok) throw new Error('binance ' + r.status);
    const all = await r.json();
    const usdt = all
      .filter(t => t.symbol.endsWith('USDT') && parseFloat(t.lastPrice) > 0)
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 100);
    const data = usdt.map((t, i) => ({
      id: t.symbol.replace('USDT','').toLowerCase(),
      rank: String(i + 1),
      symbol: t.symbol.replace('USDT',''),
      name: t.symbol.replace('USDT',''),
      priceUsd: t.lastPrice,
      changePercent24Hr: t.priceChangePercent,
      volumeUsd24Hr: t.quoteVolume,
      marketCapUsd: null,
    }));
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.json({ data });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
