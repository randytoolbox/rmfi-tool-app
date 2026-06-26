const ALPACA_BASE = 'https://paper-api.alpaca.markets';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const keyId     = process.env.ALPACA_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY;
  if (!keyId || !secretKey) {
    return res.status(500).json({ error: 'Alpaca credentials not configured' });
  }

  const headers = {
    'APCA-API-KEY-ID':     keyId,
    'APCA-API-SECRET-KEY': secretKey,
  };

  try {
    const [posRes, acctRes] = await Promise.all([
      fetch(`${ALPACA_BASE}/v2/positions`,            { headers, signal: AbortSignal.timeout(12000) }),
      fetch(`${ALPACA_BASE}/v2/account`,              { headers, signal: AbortSignal.timeout(12000) }),
    ]);

    if (!posRes.ok) {
      const body = await posRes.text().catch(() => '');
      throw new Error(`Alpaca positions returned ${posRes.status}: ${body.slice(0, 200)}`);
    }
    if (!acctRes.ok) {
      const body = await acctRes.text().catch(() => '');
      throw new Error(`Alpaca account returned ${acctRes.status}: ${body.slice(0, 200)}`);
    }

    const positions = await posRes.json();
    const account   = await acctRes.json();

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.json({
      positions: positions.map(p => ({
        symbol:       p.symbol,
        qty:          parseFloat(p.qty),
        entry:        parseFloat(p.avg_entry_price),
        price:        parseFloat(p.current_price),
        value:        parseFloat(p.market_value),
        cost:         parseFloat(p.cost_basis),
        pl:           parseFloat(p.unrealized_pl),
        plPct:        parseFloat(p.unrealized_plpc) * 100,
        side:         p.side,
      })),
      account: {
        equity:       parseFloat(account.equity),
        cash:         parseFloat(account.cash),
        buyingPower:  parseFloat(account.buying_power),
        portfolioVal: parseFloat(account.portfolio_value),
      },
    });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
