const CC_TO_YAHOO = {
  'bitcoin':'BTC-USD','ethereum':'ETH-USD','ripple':'XRP-USD','solana':'SOL-USD',
  'binance-coin':'BNB-USD','dogecoin':'DOGE-USD','cardano':'ADA-USD','avalanche':'AVAX-USD',
  'polkadot':'DOT-USD','polygon':'MATIC-USD','chainlink':'LINK-USD','litecoin':'LTC-USD',
  'uniswap':'UNI-USD','cosmos':'ATOM-USD','near-protocol':'NEAR-USD',
  'internet-computer':'ICP-USD','filecoin':'FIL-USD','aptos':'APT-USD',
  'arbitrum':'ARB-USD','optimism':'OP-USD','injective-protocol':'INJ-USD',
  'sui':'SUI-USD','toncoin':'TON-USD','tron':'TRX-USD',
  'stellar':'XLM-USD','hedera-hashgraph':'HBAR-USD','vechain':'VET-USD',
  'algorand':'ALGO-USD','ethereum-classic':'ETC-USD','bitcoin-cash':'BCH-USD',
};

module.exports = async function handler(req, res) {
  const { id, start, end } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  // 1) CoinCap
  try {
    const url = `https://api.coincap.io/v2/assets/${encodeURIComponent(id)}/history?interval=d1&start=${start}&end=${end}`;
    const r = await fetch(url);
    if (r.ok) {
      const data = await r.json();
      if (data.data?.length) {
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
        return res.json(data);
      }
    }
  } catch {}

  // 2) CryptoCompare daily history
  try {
    const ySym = CC_TO_YAHOO[id];
    const sym = ySym ? ySym.replace('-USD','') : id.toUpperCase();
    const r = await fetch(`https://min-api.cryptocompare.com/data/v2/histoday?fsym=${sym}&tsym=USD&limit=730`);
    if (r.ok) {
      const json = await r.json();
      const rows = json?.Data?.Data;
      if (rows?.length) {
        const data = rows.map(p => ({ priceUsd: String(p.close), time: p.time * 1000, date: new Date(p.time * 1000).toISOString() }))
          .filter(p => parseFloat(p.priceUsd) > 0);
        if (data.length) {
          res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
          return res.json({ data });
        }
      }
    }
  } catch {}

  // 3) Yahoo Finance v8 chart 2y daily
  try {
    const ySym = CC_TO_YAHOO[id];
    if (!ySym) throw new Error('no symbol');
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ySym}?range=2y&interval=1d`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!r.ok) throw new Error('yahoo ' + r.status);
    const json = await r.json();
    const result = json?.chart?.result?.[0];
    const timestamps = result?.timestamp || [];
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const data = timestamps
      .map((ts, i) => ({ priceUsd: String(closes[i] ?? 0), time: ts * 1000, date: new Date(ts * 1000).toISOString() }))
      .filter(p => parseFloat(p.priceUsd) > 0);
    if (!data.length) throw new Error('no data');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    return res.json({ data });
  } catch (e) {
    return res.status(502).json({ error: 'all sources failed: ' + e.message });
  }
};
