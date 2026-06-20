const CC_TO_BINANCE = {
  'bitcoin':'BTCUSDT','ethereum':'ETHUSDT','ripple':'XRPUSDT','solana':'SOLUSDT',
  'binance-coin':'BNBUSDT','dogecoin':'DOGEUSDT','cardano':'ADAUSDT','avalanche':'AVAXUSDT',
  'polkadot':'DOTUSDT','polygon':'MATICUSDT','chainlink':'LINKUSDT','litecoin':'LTCUSDT',
  'uniswap':'UNIUSDT','cosmos':'ATOMUSDT','near-protocol':'NEARUSDT',
  'internet-computer':'ICPUSDT','filecoin':'FILUSDT','aptos':'APTUSDT',
  'arbitrum':'ARBUSDT','optimism':'OPUSDT','injective-protocol':'INJUSDT',
  'sui':'SUIUSDT','celestia':'TIAUSDT','dogwifcoin':'WIFUSDT','bonk':'BONKUSDT',
  'pepe':'PEPEUSDT','shiba-inu':'SHIBUSDT','toncoin':'TONUSDT','tron':'TRXUSDT',
  'stellar':'XLMUSDT','hedera-hashgraph':'HBARUSDT','vechain':'VETUSDT',
  'algorand':'ALGOUSDT','ethereum-classic':'ETCUSDT','bitcoin-cash':'BCHUSDT',
  'quant-network':'QNTUSDT',
};
const BINANCE_TO_CC = Object.fromEntries(Object.entries(CC_TO_BINANCE).map(([cc,bn])=>[bn,cc]));

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
  'quant-network':'QNT-USD',
};
const YAHOO_TO_CC = Object.fromEntries(Object.entries(CC_TO_YAHOO).map(([cc,y])=>[y,cc]));

export default async function handler(req, res) {
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

  // 2) Binance
  try {
    const pairs = idList.map(id => CC_TO_BINANCE[id]).filter(Boolean);
    if (pairs.length) {
      const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(pairs))}`);
      if (r.ok) {
        const tickers = await r.json();
        if (Array.isArray(tickers) && tickers.length) {
          const data = tickers.map(t => ({
            id: BINANCE_TO_CC[t.symbol] || t.symbol,
            symbol: t.symbol.replace('USDT',''),
            priceUsd: t.lastPrice,
            changePercent24Hr: t.priceChangePercent,
            volumeUsd24Hr: t.quoteVolume,
            marketCapUsd: null,
          }));
          res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
          return res.json({ data });
        }
      }
    }
  } catch {}

  // 3) Yahoo Finance crypto (same server as stock quotes — known to work from Vercel)
  try {
    const yahooSyms = idList.map(id => CC_TO_YAHOO[id]).filter(Boolean);
    if (!yahooSyms.length) throw new Error('no yahoo syms');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSyms.join(','))}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,marketCap`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; randy-money/1.0)' } });
    if (!r.ok) throw new Error('yahoo ' + r.status);
    const json = await r.json();
    const results = json?.quoteResponse?.result;
    if (!results?.length) throw new Error('no results');
    const data = results.map(q => ({
      id: YAHOO_TO_CC[q.symbol] || q.symbol,
      symbol: q.symbol.replace('-USD',''),
      priceUsd: String(q.regularMarketPrice ?? 0),
      changePercent24Hr: String(q.regularMarketChangePercent ?? 0),
      volumeUsd24Hr: String((q.regularMarketVolume ?? 0) * (q.regularMarketPrice ?? 1)),
      marketCapUsd: String(q.marketCap ?? 0),
    }));
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    return res.json({ data });
  } catch (e) {
    return res.status(502).json({ error: 'all sources failed: ' + e.message });
  }
}
