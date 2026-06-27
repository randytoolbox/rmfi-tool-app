#!/usr/bin/env node
// Runs via GitHub Actions at 9:35am ET (13:35 UTC) Mon-Fri.
// Scores crypto watchlist, fills up to 2 slots with paper buy orders ($200 each).

const ALPACA_BASE   = 'https://paper-api.alpaca.markets';
const MAX_POSITIONS = 2;
const BUDGET_PER    = 200; // $200 per crypto position

// CoinCap IDs → Alpaca symbol pairs
const WATCHLIST = [
  { id: 'bitcoin',       sym: 'BTC/USD',  name: 'Bitcoin'       },
  { id: 'ethereum',      sym: 'ETH/USD',  name: 'Ethereum'      },
  { id: 'solana',        sym: 'SOL/USD',  name: 'Solana'        },
  { id: 'avalanche',     sym: 'AVAX/USD', name: 'Avalanche'     },
  { id: 'chainlink',     sym: 'LINK/USD', name: 'Chainlink'     },
  { id: 'litecoin',      sym: 'LTC/USD',  name: 'Litecoin'      },
  { id: 'bitcoin-cash',  sym: 'BCH/USD',  name: 'Bitcoin Cash'  },
  { id: 'dogecoin',      sym: 'DOGE/USD', name: 'Dogecoin'      },
  { id: 'uniswap',       sym: 'UNI/USD',  name: 'Uniswap'       },
  { id: 'aave',          sym: 'AAVE/USD', name: 'Aave'          },
];

async function alpaca(path, options = {}) {
  const r = await fetch(`${ALPACA_BASE}${path}`, {
    ...options,
    headers: {
      'APCA-API-KEY-ID':     process.env.ALPACA_KEY_ID,
      'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : {};
  if (!r.ok) throw Object.assign(new Error(JSON.stringify(data)), { status: r.status });
  return data;
}

async function fetchCryptoData(w) {
  try {
    const [assetRes, histRes] = await Promise.all([
      fetch(`https://api.coincap.io/v2/assets/${w.id}`),
      fetch(`https://api.coincap.io/v2/assets/${w.id}/history?interval=d1&start=${Date.now() - 365*24*3600*1000}&end=${Date.now()}`),
    ]);
    if (!assetRes.ok) return null;
    const asset = (await assetRes.json()).data;
    if (!asset) return null;

    const price       = parseFloat(asset.priceUsd);
    const changePct   = parseFloat(asset.changePercent24Hr);
    const marketCap   = parseFloat(asset.marketCapUsd);

    let high52 = null, low52 = null;
    if (histRes.ok) {
      const prices = ((await histRes.json()).data || []).map(p => parseFloat(p.priceUsd)).filter(v => !isNaN(v));
      if (prices.length) { high52 = Math.max(...prices); low52 = Math.min(...prices); }
    }

    return { sym: w.sym, name: w.name, price, changePct, marketCap, high52, low52 };
  } catch(e) {
    console.warn(`Failed fetching ${w.id}:`, e.message);
    return null;
  }
}

function score(d) {
  if (!d?.price) return -1;
  let s = 0;

  const fromHigh = d.high52 ? (d.price - d.high52) / d.high52 * 100 : null;
  if (fromHigh !== null) {
    if (fromHigh < -50) s += 20;
    else if (fromHigh < -35) s += 15;
    else if (fromHigh < -20) s += 10;
    else if (fromHigh < -10) s += 5;
    if (fromHigh > -5) s -= 10;
  }

  if (d.changePct != null) {
    if (d.changePct >= 1 && d.changePct <= 6)   s += 12;
    else if (d.changePct > 0 && d.changePct < 1) s += 6;
    else if (d.changePct > 6 && d.changePct <= 12) s += 4;
    else if (d.changePct < -8) s -= 8;
  }

  if (d.marketCap > 50e9)      s += 5;
  else if (d.marketCap > 10e9) s += 2;

  return s;
}

async function main() {
  if (!process.env.ALPACA_KEY_ID || !process.env.ALPACA_SECRET_KEY) {
    console.error('ALPACA credentials not set'); process.exit(1);
  }

  const positions    = await alpaca('/v2/positions');
  const heldSymbols  = new Set(positions.map(p => p.symbol)); // Alpaca stores as "BTCUSD"
  const cryptoHeld   = new Set(WATCHLIST.map(w => w.sym.replace('/', '')).filter(s => heldSymbols.has(s)));
  const slots        = MAX_POSITIONS - cryptoHeld.size;

  if (slots <= 0) {
    console.log('Crypto portfolio full:', [...cryptoHeld].join(', ')); return;
  }

  console.log(`Crypto slots open: ${slots} — scoring watchlist...`);

  const results = [];
  for (const w of WATCHLIST) {
    const d = await fetchCryptoData(w);
    if (d) {
      const fromHighPct = d.high52 ? (d.price - d.high52) / d.high52 * 100 : null;
      results.push({ ...d, _score: score(d), _fromHighPct: fromHighPct });
    }
    await new Promise(r => setTimeout(r, 250)); // CoinCap rate limit
  }
  console.log(`Got data for ${results.length}/${WATCHLIST.length} assets`);

  const picks = results
    .filter(d => d._score >= 0 && !cryptoHeld.has(d.sym.replace('/', '')))
    .sort((a, b) => b._score - a._score)
    .slice(0, slots);

  if (!picks.length) { console.log('No eligible crypto picks'); return; }

  const today = new Date().toISOString().slice(0, 10);

  const executed = [];
  for (const pick of picks) {
    try {
      await alpaca('/v2/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol:          pick.sym,
          notional:        String(BUDGET_PER),
          side:            'buy',
          type:            'market',
          time_in_force:   'gtc',
          client_order_id: `randy-crypto-${pick.sym.replace('/','')}-${today}`,
        }),
      });
      console.log(`BUY $${BUDGET_PER} of ${pick.sym} @ ~$${pick.price.toFixed(4)} (score: ${pick._score})`);
      executed.push({ sym: pick.sym, name: pick.name, price: pick.price, score: pick._score,
                      fromHighPct: pick._fromHighPct });
    } catch(e) {
      console.error(`Order failed for ${pick.sym}:`, e.message);
    }
  }

  if (executed.length && process.env.RESEND_API_KEY) {
    await sendCryptoTradeEmail(executed, today);
  }
}

async function sendCryptoTradeEmail(trades, date) {
  try {
    const tradesHtml = trades.map(t => `
      <div style="background:#0a1a2e;border-radius:8px;padding:14px 16px;margin-bottom:12px;border-left:4px solid #f59e0b;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="color:#f59e0b;font-weight:800;font-size:16px;">${t.sym}</span>
          <span style="color:#a78bfa;font-size:11px;font-weight:700;">SCORE: ${t.score}</span>
        </div>
        <div style="color:#e0d7ff;font-size:13px;margin-bottom:4px;">$${BUDGET_PER} notional @ ~$${t.price.toFixed(4)}</div>
        ${t.fromHighPct != null ? `<div style="color:#7a9cc0;font-size:11px;">${t.fromHighPct.toFixed(1)}% below 52W high</div>` : ''}
      </div>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="background:#030d18;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:#1a1000;border:2px solid #5a3d00;border-radius:12px;padding:20px 24px;margin-bottom:20px;">
    <div style="font-size:22px;font-weight:800;color:#f59e0b;margin-bottom:4px;">₿ Crypto Bot Bought Today</div>
    <div style="color:#7a9cc0;font-size:13px;">${date} · Alpaca Paper Account</div>
  </div>
  ${tradesHtml}
  <div style="margin-top:20px;text-align:center;">
    <a href="https://rmfi-tool-app.vercel.app/randys-money.html#sec-robot"
       style="color:#f59e0b;font-weight:700;text-decoration:none;">View in Randy's Money →</a>
  </div>
  <p style="color:#333;font-size:11px;text-align:center;margin-top:16px;">Paper trading · not real money</p>
</body></html>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    "Randy's Robot <onboarding@resend.dev>",
        to:      ['randybarclay1@gmail.com'],
        subject: `₿ Crypto bot bought ${trades.map(t => t.sym).join(', ')} — ${date}`,
        html,
      }),
    });
    if (r.ok) console.log('Crypto trade notification sent');
    else console.warn('Email send failed:', r.status);
  } catch (e) {
    console.warn('Crypto email error:', e.message);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
