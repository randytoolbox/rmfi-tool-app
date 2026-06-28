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

// Binance USDT pairs — free public API, no key, very reliable for major coins
const CC_TO_BINANCE = {
  'bitcoin':'BTCUSDT','ethereum':'ETHUSDT','ripple':'XRPUSDT','solana':'SOLUSDT',
  'binance-coin':'BNBUSDT','dogecoin':'DOGEUSDT','cardano':'ADAUSDT','avalanche':'AVAXUSDT',
  'polkadot':'DOTUSDT','chainlink':'LINKUSDT','litecoin':'LTCUSDT',
  'uniswap':'UNIUSDT','cosmos':'ATOMUSDT','near-protocol':'NEARUSDT',
  'filecoin':'FILUSDT','aptos':'APTUSDT','injective-protocol':'INJUSDT',
  'sui':'SUIUSDT','dogwifcoin':'WIFUSDT','shiba-inu':'SHIBUSDT',
  'toncoin':'TONUSDT','tron':'TRXUSDT','stellar':'XLMUSDT',
  'hedera-hashgraph':'HBARUSDT','vechain':'VETUSDT','algorand':'ALGOUSDT',
  'ethereum-classic':'ETCUSDT','bitcoin-cash':'BCHUSDT',
  'render-token':'RNDRUSDT','fetch-ai':'FETUSDT',
};
const BINANCE_TO_CC = Object.fromEntries(Object.entries(CC_TO_BINANCE).map(([cc,b])=>[b,cc]));

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ── Macro data ────────────────────────────────────────────────────────────
  if (req.query.macro) {
    const results = {};
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/global', { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const d = await r.json();
        results.btcDominance    = d.data?.market_cap_percentage?.bitcoin;
        results.totalMktCap     = d.data?.total_market_cap?.usd;
        results.mktCapChange24h = d.data?.market_cap_change_percentage_24h_usd;
      }
    } catch {}
    try {
      const r = await fetch('https://api.alternative.me/fng/', { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const d = await r.json();
        results.fearGreed      = parseInt(d.data[0].value);
        results.fearGreedLabel = d.data[0].value_classification;
      }
    } catch {}
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.json(results);
  }

  const { ids } = req.query;
  if (!ids) return res.status(400).json({ error: 'ids required' });
  const idList = ids.split(',').map(s => s.trim());

  // 1) Binance public ticker — no API key, very reliable, handles major coins
  try {
    const binanceSyms = idList.map(id => CC_TO_BINANCE[id]).filter(Boolean);
    if (binanceSyms.length) {
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(binanceSyms))}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const tickers = await r.json();
        const data = (Array.isArray(tickers) ? tickers : [tickers]).map(t => {
          const ccId = BINANCE_TO_CC[t.symbol] || t.symbol.replace('USDT','').toLowerCase();
          return {
            id:                ccId,
            symbol:            t.symbol.replace('USDT',''),
            priceUsd:          String(t.lastPrice),
            changePercent24Hr: String(t.priceChangePercent),
            volumeUsd24Hr:     String(t.quoteVolume),
            marketCapUsd:      '0',
          };
        }).filter(d => parseFloat(d.priceUsd) > 0);
        if (data.length) {
          res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
          return res.json({ data });
        }
      }
    }
  } catch {}

  // 2) CryptoCompare (reliable server-to-server, no API key needed)
  try {
    const syms = idList.map(id => (CC_TO_YAHOO[id] || '').replace('-USD','')).filter(Boolean);
    if (syms.length) {
      const r = await fetch(`https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${syms.join(',')}&tsyms=USD`, {
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const json = await r.json();
        const raw = json.RAW || {};
        const data = Object.entries(raw).map(([sym, v]) => {
          const usd  = v.USD || {};
          const ccId = YAHOO_TO_CC[sym + '-USD'] || sym.toLowerCase();
          return {
            id: ccId, symbol: sym,
            priceUsd:          String(usd.PRICE || 0),
            changePercent24Hr: String(usd.CHANGEPCT24HOUR || 0),
            volumeUsd24Hr:     String(usd.VOLUME24HOURTO || 0),
            marketCapUsd:      String(usd.MKTCAP || 0),
          };
        }).filter(d => parseFloat(d.priceUsd) > 0);
        if (data.length) {
          res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
          return res.json({ data });
        }
      }
    }
  } catch {}

  // 3) CoinCap v2 (may be rate-limited but worth trying)
  try {
    const r = await fetch(`https://api.coincap.io/v2/assets?ids=${encodeURIComponent(ids)}&limit=50`, {
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const data = await r.json();
      if (data.data?.length) {
        res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
        return res.json(data);
      }
    }
  } catch {}

  // 4) Yahoo Finance v7/quote batch (last resort)
  try {
    const yahooSyms = idList.map(id => CC_TO_YAHOO[id]).filter(Boolean);
    if (!yahooSyms.length) throw new Error('no symbols');
    const url = `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${yahooSyms.join(',')}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com/' },
      signal: AbortSignal.timeout(9000),
    });
    if (r.ok) {
      const json = await r.json();
      const results = (json?.quoteResponse?.result || []).map(q => {
        const ccId = YAHOO_TO_CC[q.symbol] || q.symbol;
        return {
          id:                ccId,
          symbol:            q.symbol.replace('-USD',''),
          priceUsd:          String(q.regularMarketPrice || 0),
          changePercent24Hr: String(q.regularMarketChangePercent || 0),
          volumeUsd24Hr:     String(q.regularMarketVolume || 0),
          marketCapUsd:      '0',
        };
      }).filter(d => parseFloat(d.priceUsd) > 0);
      if (results.length) {
        res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
        return res.json({ data: results });
      }
    }
  } catch {}

  return res.status(502).json({ error: 'all sources failed' });
};
