// CoinCap ID → Binance USDT pair
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

export default async function handler(req, res) {
  const { ids } = req.query;
  if (!ids) return res.status(400).json({ error: 'ids required' });

  // Try CoinCap first
  try {
    const r = await fetch(`https://api.coincap.io/v2/assets?ids=${encodeURIComponent(ids)}&limit=50`);
    if (r.ok) {
      const data = await r.json();
      if (data.data?.length) {
        res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.json(data);
      }
    }
  } catch {}

  // Fallback: Binance (extremely reliable, no rate limits)
  try {
    const idList = ids.split(',').map(s => s.trim());
    const pairs = idList.map(id => CC_TO_BINANCE[id]).filter(Boolean);
    if (!pairs.length) throw new Error('no pairs');
    const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(pairs))}`);
    if (!r.ok) throw new Error('binance ' + r.status);
    const tickers = await r.json();
    const data = tickers.map(t => ({
      id: BINANCE_TO_CC[t.symbol] || t.symbol,
      symbol: t.symbol.replace('USDT',''),
      name: t.symbol.replace('USDT',''),
      priceUsd: t.lastPrice,
      changePercent24Hr: t.priceChangePercent,
      volumeUsd24Hr: t.quoteVolume,
      marketCapUsd: null,
    }));
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.json({ data });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
