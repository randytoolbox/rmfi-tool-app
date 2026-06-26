module.exports = async function handler(req, res) {
  const { sym } = req.query;
  if (!sym) return res.status(400).json({ error: 'sym required' });

  const keyId     = process.env.ALPACA_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY;

  if (!keyId || !secretKey) {
    return res.status(500).json({ error: 'Alpaca credentials not configured' });
  }

  try {
    // Fetch snapshot (current price + 52W high/low) from Alpaca data API
    const r = await fetch(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(sym)}&feed=iex`, {
      headers: {
        'APCA-API-KEY-ID':     keyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });

    if (!r.ok) throw new Error(`Alpaca ${r.status}`);
    const data = await r.json();
    const snap = data[sym];
    if (!snap) return res.status(404).json({ error: 'Symbol not found' });

    const price     = snap.latestTrade?.p || snap.minuteBar?.c || snap.dailyBar?.c || snap.prevDailyBar?.c || null;
    const prevClose = snap.prevDailyBar?.c || snap.dailyBar?.o || price;
    const changePct = price && prevClose ? (price - prevClose) / prevClose * 100 : null;

    // Return in the same shape the app expects from Yahoo Finance v8
    const result = {
      chart: {
        result: [{
          meta: {
            regularMarketPrice:          price,
            previousClose:               prevClose,
            regularMarketChangePercent:  changePct,
            fiftyTwoWeekHigh:            null,
            fiftyTwoWeekLow:             null,
            shortName:                   sym,
          }
        }]
      }
    };

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.json(result);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
