const CC_TO_YAHOO = {
  'bitcoin':'BTC-USD','ethereum':'ETH-USD','ripple':'XRP-USD','solana':'SOL-USD',
  'binance-coin':'BNB-USD','dogecoin':'DOGE-USD','cardano':'ADA-USD','avalanche':'AVAX-USD',
  'polkadot':'DOT-USD','polygon':'MATIC-USD','chainlink':'LINK-USD','litecoin':'LTC-USD',
  'uniswap':'UNI-USD','cosmos':'ATOM-USD','near-protocol':'NEAR-USD',
  'internet-computer':'ICP-USD','filecoin':'FIL-USD','aptos':'APT-USD',
  'arbitrum':'ARB-USD','optimism':'OP-USD','injective-protocol':'INJ-USD',
  'sui':'SUI-USD','celestia':'TIA-USD','dogwifcoin':'WIF-USD','bonk':'BONK-USD',
  'pepe':'PEPE-USD','shiba-inu':'SHIB-USD','toncoin':'TON-USD','tron':'TRX-USD',
  'stellar':'XLM-USD','hedera-hashgraph':'HBAR-USD','vechain':'VET-USD',
  'algorand':'ALGO-USD','ethereum-classic':'ETC-USD','bitcoin-cash':'BCH-USD',
  'quant-network':'QNT-USD','xdc-network':'XDC-USD',
  'render-token':'RNDR-USD','kaspa':'KAS-USD','fetch-ai':'FET-USD',
};
const YAHOO_TO_CC = Object.fromEntries(Object.entries(CC_TO_YAHOO).map(([cc,y])=>[y,cc]));

module.exports = async function handler(req, res) {
  const { ids } = req.query;
  if (!ids) return res.status(400).json({ error: 'ids required' });
  const idList = ids.split(',').map(s => s.trim());

  // 1) CoinCap
  try {
    const r = await fetch(`https://api.coincap.io/v2/assets?ids=${encodeURIComponent(ids)}&limit=50`);
    if (r.ok) {
      const data = await r.json();
      if (data.data?.length) {
        res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
        return res.json(data);
      }
    }
  } catch {}

  // 2) CryptoCompare (reliable server-to-server, no API key needed)
  try {
    const syms = idList.map(id => (CC_TO_YAHOO[id] || '').replace('-USD','')).filter(Boolean);
    if (syms.length) {
      const r = await fetch(`https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${syms.join(',')}&tsyms=USD`);
      if (r.ok) {
        const json = await r.json();
        const raw = json.RAW || {};
        const data = Object.entries(raw).map(([sym, v]) => {
          const usd = v.USD || {};
          const ccId = YAHOO_TO_CC[sym + '-USD'] || sym.toLowerCase();
          return {
            id: ccId, symbol: sym,
            priceUsd: String(usd.PRICE || 0),
            changePercent24Hr: String(usd.CHANGEPCT24HOUR || 0),
            volumeUsd24Hr: String(usd.VOLUME24HOURTO || 0),
            marketCapUsd: String(usd.MKTCAP || 0),
          };
        }).filter(d => parseFloat(d.priceUsd) > 0);
        if (data.length) {
          res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
          return res.json({ data });
        }
      }
    }
  } catch {}

  // 3) Yahoo Finance v8 chart per-symbol
  try {
    const yahooSyms = idList.map(id => CC_TO_YAHOO[id]).filter(Boolean);
    if (!yahooSyms.length) throw new Error('no symbols');
    const results = [];
    for (const ySym of yahooSyms.slice(0, 10)) {
      try {
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ySym}?range=2d&interval=1d`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!r.ok) continue;
        const json = await r.json();
        const meta = json?.chart?.result?.[0]?.meta;
        if (!meta?.regularMarketPrice) continue;
        const ccId = YAHOO_TO_CC[ySym] || ySym;
        results.push({
          id: ccId, symbol: ySym.replace('-USD',''),
          priceUsd: String(meta.regularMarketPrice),
          changePercent24Hr: String(meta.regularMarketChangePercent || 0),
          volumeUsd24Hr: String(meta.regularMarketVolume || 0),
          marketCapUsd: String(meta.marketCap || 0),
        });
      } catch {}
    }
    if (results.length) {
      res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
      return res.json({ data: results });
    }
  } catch {}

  return res.status(502).json({ error: 'all sources failed' });
};
