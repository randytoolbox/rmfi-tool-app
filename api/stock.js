module.exports = async function handler(req, res) {
  const { sym } = req.query;
  if (!sym) return res.status(400).json({ error: 'sym required' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');

  const keyId     = process.env.ALPACA_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY;

  let price = null, prevClose = null, changePct = null;

  // Try Alpaca first (works for stocks; IEX may miss some ETFs)
  if (keyId && secretKey) {
    try {
      const r = await fetch(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(sym)}&feed=iex`, {
        headers: {
          'APCA-API-KEY-ID':     keyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const data = await r.json();
        const snap = data[sym];
        if (snap) {
          price     = snap.latestTrade?.p || snap.minuteBar?.c || snap.dailyBar?.c || snap.prevDailyBar?.c || null;
          prevClose = snap.prevDailyBar?.c || snap.dailyBar?.o || price;
          changePct = price && prevClose ? (price - prevClose) / prevClose * 100 : null;
        }
      }
    } catch (_) {}
  }

  // Fall back to Yahoo Finance when Alpaca has no price (e.g. commodity ETFs on IEX)
  if (!price) {
    try {
      const yf = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(8000),
      });
      if (yf.ok) {
        const yfData = await yf.json();
        const meta   = yfData?.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice) {
          price     = meta.regularMarketPrice;
          prevClose = meta.previousClose || meta.chartPreviousClose || price;
          changePct = meta.regularMarketChangePercent ?? (price && prevClose ? (price - prevClose) / prevClose * 100 : null);
        }
      }
    } catch (_) {}
  }

  if (!price) return res.status(404).json({ error: 'Price unavailable' });

  return res.json({
    chart: {
      result: [{
        meta: {
          regularMarketPrice:         price,
          previousClose:              prevClose,
          regularMarketChangePercent: changePct,
          fiftyTwoWeekHigh:           null,
          fiftyTwoWeekLow:            null,
          shortName:                  sym,
        }
      }]
    }
  });
};
