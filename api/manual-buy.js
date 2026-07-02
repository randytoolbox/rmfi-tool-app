const ALPACA = 'https://paper-api.alpaca.markets';
const KEY_ID = process.env.ALPACA_KEY_ID;
const SECRET = process.env.ALPACA_SECRET_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!KEY_ID || !SECRET) return res.status(200).json({ success: false, error: 'Alpaca credentials not configured' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const symbol  = (body?.symbol || '').toUpperCase().trim();
  const notional = Number(body?.notional || 0);
  const reason  = (body?.reason || 'Manual buy').slice(0, 200);

  if (!symbol || !/^[A-Z.]{1,6}$/.test(symbol)) return res.status(200).json({ success: false, error: 'Invalid symbol' });
  if (notional < 1 || notional > 100000) return res.status(200).json({ success: false, error: 'Amount must be $1–$100,000' });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const r = await fetch(`${ALPACA}/v2/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID':     KEY_ID,
        'APCA-API-SECRET-KEY': SECRET,
        'Content-Type':        'application/json',
      },
      body: JSON.stringify({
        symbol,
        notional:       String(notional),
        side:           'buy',
        type:           'market',
        time_in_force:  'day',
        client_order_id: `randy-human-${symbol}-${today}`,
      }),
      signal: AbortSignal.timeout(8000),
    });

    const data = await r.json();
    if (!r.ok) return res.status(200).json({ success: false, error: data.message || JSON.stringify(data) });

    // Log to buy-log so the monitor and dashboard track it
    try {
      const fs   = require('fs');
      const path = `${process.cwd()}/data/buy-log.json`;
      const log  = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : { date: today, trades: [], topCandidates: [] };
      log.trades = log.trades || [];
      log.trades.push({
        symbol, notional, reason,
        source:    'human',
        orderId:   data.id,
        placedAt:  new Date().toISOString(),
      });
      fs.writeFileSync(path, JSON.stringify(log, null, 2));
    } catch { /* non-fatal — order already placed */ }

    return res.status(200).json({ success: true, symbol, notional, reason, orderId: data.id });
  } catch (e) {
    return res.status(200).json({ success: false, error: e.message });
  }
};
