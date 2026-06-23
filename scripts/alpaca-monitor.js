#!/usr/bin/env node
// Runs via GitHub Actions at 3:45pm ET (19:45 UTC) Mon-Fri.
// Stocks: sell at +5%, −3%, or after 5 trading days.
// Crypto: sell at +10%, −5%, or after 7 calendar days.
// Sends daily portfolio report email via Resend.

const ALPACA_BASE = 'https://paper-api.alpaca.markets';

// Stock rules
const STOCK_TAKE_PROFIT = 0.05;
const STOCK_STOP_LOSS   = -0.03;
const STOCK_MAX_DAYS    = 5;

// Crypto rules (more volatile — wider thresholds)
const CRYPTO_TAKE_PROFIT = 0.10;
const CRYPTO_STOP_LOSS   = -0.05;
const CRYPTO_MAX_DAYS    = 7;

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

function tradingDaysSince(dateStr) {
  const start = new Date(dateStr + 'T00:00:00-04:00');
  const now   = new Date();
  let count   = 0;
  const cur   = new Date(start);
  while (cur <= now) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function calendarDaysSince(dateStr) {
  const start = new Date(dateStr + 'T00:00:00Z');
  const now   = new Date();
  return Math.floor((now - start) / (24 * 60 * 60 * 1000));
}

async function getBuyDates() {
  const orders   = await alpaca('/v2/orders?status=filled&direction=desc&limit=200');
  const buyDates = {};
  for (const o of (orders || [])) {
    if (o.side !== 'buy') continue;
    // Stock orders: randy-SYMBOL-DATE
    const mStock = (o.client_order_id || '').match(/^randy-(?!crypto-)(.+)-(\d{4}-\d{2}-\d{2})$/);
    if (mStock && !buyDates[o.symbol]) { buyDates[o.symbol] = mStock[2]; continue; }
    // Crypto orders: randy-crypto-BTCUSD-DATE
    const mCrypto = (o.client_order_id || '').match(/^randy-crypto-(.+)-(\d{4}-\d{2}-\d{2})$/);
    if (mCrypto && !buyDates[o.symbol]) buyDates[o.symbol] = mCrypto[2];
  }
  return buyDates;
}

function isCrypto(pos) {
  return pos.asset_class === 'crypto';
}

function fmt(n)    { return n == null ? '--' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtPct(n) { const p = Number(n) * 100; return (p >= 0 ? '+' : '') + p.toFixed(2) + '%'; }

function buildEmail(stockPositions, cryptoPositions, sold, account, dateStr) {
  const allPositions  = [...stockPositions, ...cryptoPositions];
  const totalValue    = allPositions.reduce((s, p) => s + Number(p.market_value), 0);
  const totalCost     = allPositions.reduce((s, p) => s + Number(p.cost_basis), 0);
  const totalPL       = totalValue - totalCost;
  const totalPLPct    = totalCost > 0 ? totalPL / totalCost * 100 : 0;
  const plColor       = totalPL >= 0 ? '#16a34a' : '#dc2626';

  function posCard(p, label) {
    const plpct = Number(p.unrealized_plpc) * 100;
    const plClr = plpct >= 0 ? '#16a34a' : '#dc2626';
    const badge = label ? `<span style="font-size:10px;background:${label==='crypto'?'#7c3aed':'#1e40af'};color:#fff;border-radius:4px;padding:1px 6px;margin-left:6px;">${label.toUpperCase()}</span>` : '';
    return `
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:10px;">
        <div style="font-size:18px;font-weight:700;color:#1e3a5f;">${p.symbol}${badge}</div>
        <div style="font-size:12px;color:#6b7280;">${p.qty} ${label==='crypto'?'units':'shares'} · entry ${fmt(p.avg_entry_price)}</div>
        <div style="font-size:22px;font-weight:700;color:#111827;margin-top:6px;">${fmt(p.current_price)}</div>
        <div style="font-size:13px;color:${plClr};font-weight:600;">${fmtPct(p.unrealized_plpc)} · ${fmt(p.unrealized_pl)}</div>
      </div>`;
  }

  const stockCards  = stockPositions.length
    ? stockPositions.map(p => posCard(p, 'stock')).join('')
    : `<div style="color:#6b7280;font-size:13px;padding:6px 0;">No stock positions — will buy tomorrow morning.</div>`;

  const cryptoCards = cryptoPositions.length
    ? cryptoPositions.map(p => posCard(p, 'crypto')).join('')
    : `<div style="color:#6b7280;font-size:13px;padding:6px 0;">No crypto positions — will buy tomorrow morning.</div>`;

  const soldSection = sold.length ? `
    <div style="margin-top:18px;">
      <div style="font-size:14px;font-weight:700;color:#374151;margin-bottom:8px;">Closed Today</div>
      ${sold.map(s => {
        const clr = s.pl >= 0 ? '#16a34a' : '#dc2626';
        return `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:13px;">
          <span style="font-weight:700;">${s.symbol}</span>
          <span style="color:${clr};margin-left:8px;font-weight:600;">${s.pl >= 0 ? '+' : ''}${fmt(s.pl)}</span>
          <div style="color:#6b7280;margin-top:2px;">${s.reason}</div>
        </div>`;
      }).join('')}
    </div>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:540px;margin:0 auto;padding:24px 16px;">
    <div style="background:#1e3a5f;border-radius:14px;padding:20px 24px;margin-bottom:20px;">
      <div style="font-size:22px;font-weight:800;color:#fff;">📊 Daily Portfolio Report</div>
      <div style="font-size:13px;color:#93c5fd;margin-top:4px;">${dateStr} · Paper Trading · $1,000 Challenge</div>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:18px;">
      <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Total Portfolio Value</div>
      <div style="font-size:30px;font-weight:800;color:#111827;">${fmt(totalValue)}</div>
      <div style="font-size:13px;color:${plColor};font-weight:600;margin-top:4px;">
        ${totalPL >= 0 ? '+' : ''}${fmt(totalPL)} (${totalPLPct >= 0 ? '+' : ''}${totalPLPct.toFixed(2)}%) unrealized
      </div>
    </div>
    <div style="font-size:14px;font-weight:700;color:#1e40af;margin-bottom:8px;">📈 Stock Positions</div>
    ${stockCards}
    <div style="font-size:14px;font-weight:700;color:#7c3aed;margin-top:16px;margin-bottom:8px;">₿ Crypto Positions</div>
    ${cryptoCards}
    ${soldSection}
    <div style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;padding-top:16px;border-top:1px solid #f3f4f6;">
      Paper trading only — no real money.<br>
      Stocks: +5% / −3% / 5 days &nbsp;·&nbsp; Crypto: +10% / −5% / 7 days<br><br>
      <a href="https://rmfi-tool-app.vercel.app/randys-money.html" style="color:#3b82f6;">Open full app →</a>
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  if (!process.env.ALPACA_KEY_ID || !process.env.ALPACA_SECRET_KEY) {
    console.error('ALPACA credentials not set'); process.exit(1);
  }

  const [positions, buyDates, account] = await Promise.all([
    alpaca('/v2/positions'),
    getBuyDates(),
    alpaca('/v2/account'),
  ]);

  console.log(`Open positions: ${positions.length}`);

  const sold = [];

  for (const pos of positions) {
    const plpc   = Number(pos.unrealized_plpc);
    const crypto = isCrypto(pos);

    const takeProfit = crypto ? CRYPTO_TAKE_PROFIT : STOCK_TAKE_PROFIT;
    const stopLoss   = crypto ? CRYPTO_STOP_LOSS   : STOCK_STOP_LOSS;
    const maxDays    = crypto ? CRYPTO_MAX_DAYS     : STOCK_MAX_DAYS;

    const daysHeld = buyDates[pos.symbol]
      ? (crypto ? calendarDaysSince(buyDates[pos.symbol]) : tradingDaysSince(buyDates[pos.symbol]))
      : 0;

    let reason = null;
    if (plpc >= takeProfit)      reason = `Take profit at ${(plpc*100).toFixed(2)}% ✅`;
    else if (plpc <= stopLoss)   reason = `Stop loss at ${(plpc*100).toFixed(2)}% 🛑`;
    else if (daysHeld >= maxDays) reason = `${daysHeld} ${crypto?'calendar':'trading'} days — time's up ⏱`;

    if (reason) {
      try {
        await alpaca(`/v2/positions/${encodeURIComponent(pos.symbol)}`, { method: 'DELETE' });
        sold.push({ symbol: pos.symbol, reason, pl: Number(pos.unrealized_pl) });
        console.log(`SELL ${pos.symbol}: ${reason}`);
      } catch (e) {
        console.error(`Failed to sell ${pos.symbol}:`, e.message);
      }
    } else {
      console.log(`HOLD ${pos.symbol}: ${(plpc*100).toFixed(2)}%, day ${daysHeld} (${crypto?'crypto':'stock'})`);
    }
  }

  const remaining     = await alpaca('/v2/positions');
  const stockPos      = remaining.filter(p => !isCrypto(p));
  const cryptoPos     = remaining.filter(p => isCrypto(p));

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York'
  });

  const html = buildEmail(stockPos, cryptoPos, sold, account, dateStr);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.log('No RESEND_API_KEY — skipping email'); return; }

  const soldNote = sold.length ? ` · Sold: ${sold.map(s => s.symbol).join(', ')}` : '';
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'onboarding@resend.dev',
      to:      ['randybarclay1@gmail.com'],
      subject: `📊 Portfolio Report — ${dateStr}${soldNote}`,
      html,
    }),
  });

  const result = await emailRes.json();
  if (!emailRes.ok) { console.error('Email error:', result); process.exit(1); }
  console.log('Report email sent, ID:', result.id);
}

main().catch(e => { console.error(e); process.exit(1); });
