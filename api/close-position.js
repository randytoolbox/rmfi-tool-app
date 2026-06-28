// Closes a single Alpaca paper-trading position.
// POST /api/close-position  { symbol: "BTCUSD" }

const ALPACA_BASE = 'https://paper-api.alpaca.markets';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const keyId     = process.env.ALPACA_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY;
  if (!keyId || !secretKey) return res.status(500).json({ error: 'Alpaca credentials not configured' });

  const { symbol } = req.body || {};
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  // Alpaca uses "BTC/USD" format for crypto; normalize
  const alpacaSym = symbol.replace('/', '%2F');

  try {
    const r = await fetch(`${ALPACA_BASE}/v2/positions/${alpacaSym}`, {
      method: 'DELETE',
      headers: {
        'APCA-API-KEY-ID':     keyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
      signal: AbortSignal.timeout(10000),
    });
    const body = await r.text();
    const data = body ? JSON.parse(body) : {};
    if (!r.ok) return res.status(r.status).json({ error: data.message || `Alpaca ${r.status}` });
    return res.json({ ok: true, order: data });
  } catch (e) {
    console.error('close-position error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
