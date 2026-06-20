module.exports = async function handler(req, res) {
  // 1) CoinCap
  try {
    const r = await fetch('https://api.coincap.io/v2/assets?limit=100');
    if (r.ok) {
      const data = await r.json();
      if (data.data?.length) {
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
        return res.json(data);
      }
    }
  } catch {}

  // 2) CryptoCompare top 100 by market cap
  try {
    const r = await fetch('https://min-api.cryptocompare.com/data/top/mktcapfull?limit=100&tsym=USD');
    if (r.ok) {
      const json = await r.json();
      const coins = json.Data || [];
      const data = coins.map((c, i) => {
        const info = c.CoinInfo || {};
        const raw  = c.RAW?.USD || {};
        return {
          id: info.Name?.toLowerCase() || '',
          rank: String(i + 1),
          symbol: info.Name || '',
          name: info.FullName || info.Name || '',
          priceUsd: String(raw.PRICE || 0),
          changePercent24Hr: String(raw.CHANGEPCT24HOUR || 0),
          volumeUsd24Hr: String(raw.VOLUME24HOURTO || 0),
          marketCapUsd: String(raw.MKTCAP || 0),
        };
      }).filter(d => parseFloat(d.priceUsd) > 0);
      if (data.length) {
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
        return res.json({ data });
      }
    }
  } catch {}

  return res.status(502).json({ error: 'all sources failed' });
};
