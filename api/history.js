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

export default async function handler(req, res) {
  const { id, start, end } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  // Try CoinCap first
  try {
    const url = `https://api.coincap.io/v2/assets/${encodeURIComponent(id)}/history?interval=d1&start=${start}&end=${end}`;
    const r = await fetch(url);
    if (r.ok) {
      const data = await r.json();
      if (data.data?.length) {
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.json(data);
      }
    }
  } catch {}

  // Fallback: Binance klines (730 daily candles)
  try {
    const pair = CC_TO_BINANCE[id];
    if (!pair) throw new Error('no binance pair for ' + id);
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1d&limit=730`);
    if (!r.ok) throw new Error('binance ' + r.status);
    const klines = await r.json();
    // Binance kline: [openTime, open, high, low, close, ...]
    const data = klines.map(k => ({ priceUsd: k[4], time: k[0], date: new Date(k[0]).toISOString() }));
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.json({ data });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
