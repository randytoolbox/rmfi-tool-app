const ALPACA = 'https://paper-api.alpaca.markets';
const KEY_ID = process.env.ALPACA_KEY_ID;
const SECRET  = process.env.ALPACA_SECRET_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5-min cache

  if (!KEY_ID || !SECRET) {
    return res.status(200).json({ equity: [], timestamps: [], baseValue: 0 });
  }

  try {
    const r = await fetch(
      `${ALPACA}/v2/account/portfolio/history?period=1M&timeframe=1D&extended_hours=false`,
      {
        headers: {
          'APCA-API-KEY-ID':     KEY_ID,
          'APCA-API-SECRET-KEY': SECRET,
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!r.ok) {
      const txt = await r.text();
      return res.status(200).json({ equity: [], timestamps: [], baseValue: 0, error: txt });
    }
    const data = await r.json();
    // Filter out zero/null entries at the start (account not yet funded)
    const equity     = data.equity     || [];
    const timestamps = data.timestamp  || [];
    const pl         = data.profit_loss || [];

    // Find first non-zero index
    let start = 0;
    while (start < equity.length && (!equity[start] || equity[start] === 0)) start++;

    return res.status(200).json({
      equity:     equity.slice(start),
      timestamps: timestamps.slice(start),
      pl:         pl.slice(start),
      baseValue:  data.base_value || equity[start] || 0,
    });
  } catch (e) {
    return res.status(200).json({ equity: [], timestamps: [], baseValue: 0, error: e.message });
  }
};
