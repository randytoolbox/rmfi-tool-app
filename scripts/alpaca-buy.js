#!/usr/bin/env node
// Runs via GitHub Actions at 9:35am ET (13:35 UTC) Mon-Fri.
// Scores watchlist, fills open portfolio slots (up to 3) with paper buy orders.

const ALPACA_BASE    = 'https://paper-api.alpaca.markets';
const ALPACA_DATA    = 'https://data.alpaca.markets';
const MAX_POSITIONS  = 3;
const BUDGET_PER     = 333; // ~$333 per position
const SIGNALS_PATH   = `${process.cwd()}/data/contract-signals.json`;
const MIN_PRICE      = 15;  // hard floor — filters falling knives / penny stocks
const TREND_DAYS     = 60;  // require 60-day uptrend (mirrors SA's 75-day sustained signal)

const WATCHLIST = [
  'SPY','QQQ','DIA','IWM',
  'LMT','RTX','PLTR','CAT','XLE','BE','LUMN',
  'NVDA','MSFT','AAPL','TSLA','AMZN','META','GOOGL',
  'AMD','AVGO','IBM','DELL','CRWD','FLEX','MTSI',
  'OXY','CVX','HAL','MRO','WMB',
  'GLD','SLV','TLT','PYPL','BRK.B',
];

const UA = 'Mozilla/5.0 (compatible; randy-money/1.0)';

// Load contract signals saved by contract-radar.js last evening (if fresh)
function loadContractSignals() {
  try {
    const fs   = require('fs');
    const raw  = fs.readFileSync(SIGNALS_PATH, 'utf8');
    const data = JSON.parse(raw);
    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (data.generatedAt === today || data.generatedAt === yesterday) {
      return data.signals || {};
    }
  } catch { /* no signals file or stale — skip */ }
  return {};
}

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

// Batch fetch price + 52W range + EPS in a single call
async function fetchAllFundamentals(symbols) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}`,
      { headers: { 'User-Agent': UA } }
    );
    if (!r.ok) return {};
    const data = await r.json();
    const out = {};
    for (const q of (data?.quoteResponse?.result || [])) {
      out[q.symbol] = {
        epsTrailing: q.epsTrailingTwelveMonths ?? null,
        epsForward:  q.epsForward ?? null,
      };
    }
    return out;
  } catch { return {}; }
}

// Fetch last N daily bars for multiple symbols in one request
async function fetchAllBars(symbols, limit = 70) {
  try {
    const syms = symbols.join(',');
    const r = await fetch(
      `${ALPACA_DATA}/v2/stocks/bars?symbols=${syms}&timeframe=1Day&limit=${limit}&feed=iex&sort=asc`,
      {
        headers: {
          'APCA-API-KEY-ID':     process.env.ALPACA_KEY_ID,
          'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
        },
      }
    );
    if (!r.ok) return {};
    const data = await r.json();
    return data?.bars || {};
  } catch { return {}; }
}

// Positive = uptrend, negative = downtrend, null = insufficient data
function calcTrend(bars, days) {
  if (!bars || bars.length < days) return null;
  const slice = bars.slice(-days);
  return (slice[slice.length - 1].c - slice[0].c) / slice[0].c;
}

// Volume surge: recent 2-day avg vs 20-day avg — >1.5 = above-average institutional interest
function calcVolumeSurge(bars) {
  if (!bars || bars.length < 22) return null;
  const avgVol    = bars.slice(-22, -2).reduce((s, b) => s + b.v, 0) / 20;
  if (!avgVol) return null;
  const recentVol = (bars[bars.length - 1].v + (bars[bars.length - 2]?.v || 0)) / 2;
  return recentVol / avgVol;
}

async function fetchStock(sym) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1y&interval=1mo`,
      { headers: { 'User-Agent': UA } }
    );
    if (!r.ok) return null;
    const data = await r.json();
    const meta   = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(v => v != null) || [];
    const high52 = meta.fiftyTwoWeekHigh ?? (closes.length ? Math.max(...closes) : null);
    const low52  = meta.fiftyTwoWeekLow  ?? (closes.length ? Math.min(...closes) : null);
    return { symbol: sym, name: meta.shortName || sym, price: meta.regularMarketPrice, changePct: meta.regularMarketChangePercent, high52, low52 };
  } catch { return null; }
}

// Returns { total, breakdown } — breakdown is shown in the UI and emailed
function score(d, contractSignals, barsMap, fundamentals, spyTrend) {
  const FAIL = { total: -1, breakdown: null };
  if (!d?.price) return FAIL;
  if (d.price < MIN_PRICE) return FAIL;

  const eps = fundamentals?.[d.symbol];
  if (eps?.epsTrailing !== null && eps?.epsTrailing !== undefined && eps.epsTrailing <= 0) return FAIL;
  if (eps?.epsForward !== null && eps?.epsForward !== undefined &&
      eps?.epsTrailing !== null && eps?.epsTrailing !== undefined && eps.epsTrailing > 0) {
    if (eps.epsForward < eps.epsTrailing * 0.95) return FAIL;
  }

  const bars      = barsMap[d.symbol] || [];
  const trendLong = calcTrend(bars, TREND_DAYS);
  const trend5    = calcTrend(bars, 5);
  if (trendLong !== null && trendLong <= 0) return FAIL;
  if (trend5    !== null && trend5    <= 0) return FAIL;

  let s = 0;
  const bd = { fromHighPts: 0, momentumPts: 0, epsPts: 0, relStrengthPts: 0, volPts: 0, contractPts: 0 };

  const fromHigh = d.high52 ? (d.price - d.high52) / d.high52 * 100 : null;
  bd.fromHighPct = fromHigh;
  if (fromHigh !== null) {
    if (fromHigh < -30)      { bd.fromHighPts = 20; }
    else if (fromHigh < -20) { bd.fromHighPts = 15; }
    else if (fromHigh < -10) { bd.fromHighPts = 8;  }
    else if (fromHigh < -5)  { bd.fromHighPts = 3;  }
    else if (fromHigh > -2)  { bd.fromHighPts = -10; }
    s += bd.fromHighPts;
  }

  bd.changePct = d.changePct;
  if (d.changePct != null) {
    if (d.changePct >= 0.5 && d.changePct <= 4)  bd.momentumPts = 10;
    else if (d.changePct > 4)                     bd.momentumPts = 4;
    else if (d.changePct < -4)                    bd.momentumPts = -5;
    s += bd.momentumPts;
  }

  if (eps?.epsForward !== null && eps?.epsForward !== undefined &&
      eps?.epsTrailing !== null && eps?.epsTrailing !== undefined && eps.epsTrailing > 0) {
    const revision = (eps.epsForward - eps.epsTrailing) / eps.epsTrailing;
    bd.epsRevision = revision;
    if (revision > 0.15)      bd.epsPts = 12;
    else if (revision > 0.05) bd.epsPts = 6;
    s += bd.epsPts;
  }

  bd.trendLong = trendLong;
  if (trendLong !== null && spyTrend !== null && spyTrend > 0) {
    if (trendLong > spyTrend * 1.5)  bd.relStrengthPts = 12;
    else if (trendLong > spyTrend)   bd.relStrengthPts = 6;
    s += bd.relStrengthPts;
  }

  const volSurge = calcVolumeSurge(bars);
  bd.volSurge = volSurge;
  if (volSurge !== null) {
    if (volSurge > 2.0)      bd.volPts = 10;
    else if (volSurge > 1.5) bd.volPts = 6;
    s += bd.volPts;
  }

  const signal = contractSignals?.[d.symbol];
  if (signal) {
    bd.contractPts    = signal.boost;
    bd.contractAgency = signal.agency;
    s += signal.boost;
  }

  return { total: s, breakdown: bd };
}

async function main() {
  if (!process.env.ALPACA_KEY_ID || !process.env.ALPACA_SECRET_KEY) {
    console.error('ALPACA_KEY_ID or ALPACA_SECRET_KEY not set'); process.exit(1);
  }

  const clock = await alpaca('/v2/clock');
  if (!clock.is_open) { console.log('Market closed — skipping buys'); return; }

  const positions   = await alpaca('/v2/positions');
  const heldSymbols = new Set(positions.map(p => p.symbol));
  const slots       = MAX_POSITIONS - positions.length;

  if (slots <= 0) {
    console.log('Portfolio full:', [...heldSymbols].join(', ')); return;
  }

  // Fetch recent daily bars for all symbols + SPY in one API call (70 days for 60-day trend)
  const allSymbols = [...new Set(['SPY', ...WATCHLIST])];
  console.log('Fetching recent bars + fundamentals...');
  const [barsMap, fundamentals] = await Promise.all([
    fetchAllBars(allSymbols, 70),
    fetchAllFundamentals(WATCHLIST),
  ]);

  // SPY regime filter — pause all buys when broad market is in downtrend
  const spyTrend = calcTrend(barsMap['SPY'], TREND_DAYS);
  if (spyTrend !== null && spyTrend <= 0) {
    console.log(`SPY ${TREND_DAYS}-day trend: ${(spyTrend * 100).toFixed(1)}% — market in downtrend, pausing all buys`);
    return;
  }
  console.log(`SPY ${TREND_DAYS}-day trend: ${spyTrend !== null ? (spyTrend * 100).toFixed(1) + '% ✓' : 'unknown (proceeding)'}`);

  const contractSignals = loadContractSignals();
  const signalCount     = Object.keys(contractSignals).length;
  if (signalCount) {
    console.log(`Contract signals active: ${Object.keys(contractSignals).join(', ')}`);
  }

  console.log(`Open slots: ${slots} — fetching stock data...`);
  const allData = (await Promise.all(WATCHLIST.map(fetchStock))).filter(Boolean);
  console.log(`Got data for ${allData.length}/${WATCHLIST.length} symbols`);

  const scored = allData
    .map(d => {
      const { total, breakdown } = score(d, contractSignals, barsMap, fundamentals, spyTrend);
      return { ...d, _score: total, _breakdown: breakdown };
    })
    .filter(d => d._score >= 0 && !heldSymbols.has(d.symbol))
    .sort((a, b) => b._score - a._score);

  console.log('\nTop candidates after filters:');
  for (const d of scored.slice(0, 8)) {
    const bd     = d._breakdown || {};
    const fh     = bd.fromHighPct != null ? bd.fromHighPct.toFixed(1) : 'n/a';
    const eps    = fundamentals?.[d.symbol];
    const epsStr = eps?.epsTrailing != null ? `  eps:$${eps.epsTrailing.toFixed(2)}→$${(eps.epsForward ?? eps.epsTrailing).toFixed(2)}` : '';
    const volStr = bd.volSurge != null ? `  vol:${bd.volSurge.toFixed(1)}x` : '';
    console.log(
      `  ${d.symbol.padEnd(6)} score:${String(d._score).padStart(3)}  $${d.price.toFixed(2).padStart(8)}` +
      `  fromHigh:${fh}%  t${TREND_DAYS}:${bd.trendLong !== null && bd.trendLong !== undefined ? (bd.trendLong*100).toFixed(1)+'%' : 'n/a'}${epsStr}${volStr}`
    );
  }

  const picks = scored.slice(0, slots);
  if (!picks.length) { console.log('\nNo eligible picks'); return; }

  const today = new Date().toISOString().slice(0, 10);
  console.log('');

  const executed = [];
  for (const pick of picks) {
    const qty = Math.max(1, Math.floor(BUDGET_PER / pick.price));
    try {
      await alpaca('/v2/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol:          pick.symbol,
          qty:             String(qty),
          side:            'buy',
          type:            'market',
          time_in_force:   'day',
          client_order_id: `randy-${pick.symbol}-${today}`,
        }),
      });
      console.log(`BUY ${qty} x ${pick.symbol} @ ~$${pick.price.toFixed(2)} = ~$${(qty * pick.price).toFixed(2)}`);
      executed.push({ symbol: pick.symbol, name: pick.name, qty, price: pick.price,
                      value: qty * pick.price, score: pick._score, breakdown: pick._breakdown });
    } catch (e) {
      console.error(`Order failed for ${pick.symbol}:`, e.message);
    }
  }

  // Save buy-log.json (read by randys-money.html via /api/buylog)
  const { mkdirSync, writeFileSync } = require('fs');
  const logPath = `${process.cwd()}/data/buy-log.json`;
  mkdirSync(`${process.cwd()}/data`, { recursive: true });
  const buyLog = {
    date:          today,
    generatedAt:   new Date().toISOString(),
    spyTrend:      spyTrend !== null ? parseFloat((spyTrend * 100).toFixed(2)) : null,
    trades:        executed,
    topCandidates: scored.slice(0, 8).map(d => ({
      symbol:      d.symbol,
      score:       d._score,
      price:       d.price,
      fromHighPct: d._breakdown?.fromHighPct != null ? parseFloat(d._breakdown.fromHighPct.toFixed(1)) : null,
    })),
  };
  writeFileSync(logPath, JSON.stringify(buyLog, null, 2));
  console.log(`Buy log saved → data/buy-log.json (${executed.length} trades)`);

  // Email notification when trades execute
  if (executed.length && process.env.RESEND_API_KEY) {
    await sendTradeEmail(executed, today);
  }
}

function buildTradeReason(bd) {
  if (!bd) return '';
  const parts = [];
  if (bd.fromHighPct != null) parts.push(`${bd.fromHighPct.toFixed(1)}% below 52W high (+${bd.fromHighPts}pts)`);
  if (bd.momentumPts  > 0)   parts.push(`momentum +${bd.changePct?.toFixed(2)}% (+${bd.momentumPts}pts)`);
  if (bd.volPts       > 0)   parts.push(`vol surge ${bd.volSurge?.toFixed(1)}x (+${bd.volPts}pts)`);
  if (bd.epsPts       > 0)   parts.push(`EPS est +${bd.epsRevision != null ? (bd.epsRevision*100).toFixed(0)+'%' : '?'} (+${bd.epsPts}pts)`);
  if (bd.relStrengthPts > 0) parts.push(`beating SPY (+${bd.relStrengthPts}pts)`);
  if (bd.contractPts  > 0)   parts.push(`govt contract ${bd.contractAgency||''} (+${bd.contractPts}pts)`);
  return parts.join(' · ') || 'score criteria met';
}

async function sendTradeEmail(trades, date) {
  try {
    const tradesHtml = trades.map(t => `
      <div style="background:#0a1a2e;border-radius:8px;padding:14px 16px;margin-bottom:12px;border-left:4px solid #4ade80;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="color:#4ade80;font-weight:800;font-size:16px;">${t.symbol}</span>
          <span style="color:#a78bfa;font-size:11px;font-weight:700;">SCORE: ${t.score}</span>
        </div>
        <div style="color:#e0d7ff;font-size:13px;margin-bottom:4px;">${t.qty} shares @ $${t.price.toFixed(2)} = <strong>$${t.value.toFixed(2)}</strong></div>
        <div style="color:#7a9cc0;font-size:11px;">WHY: ${buildTradeReason(t.breakdown)}</div>
      </div>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="background:#030d18;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:#071a07;border:2px solid #2d5a2d;border-radius:12px;padding:20px 24px;margin-bottom:20px;">
    <div style="font-size:22px;font-weight:800;color:#4ade80;margin-bottom:4px;">🤖 Robot Bought Today</div>
    <div style="color:#7a9cc0;font-size:13px;">${date} · Alpaca Paper Account</div>
  </div>
  ${tradesHtml}
  <div style="margin-top:20px;text-align:center;">
    <a href="https://rmfi-tool-app.vercel.app/randys-money.html#sec-robot"
       style="color:#4ade80;font-weight:700;text-decoration:none;">View in Randy's Money →</a>
  </div>
  <p style="color:#333;font-size:11px;text-align:center;margin-top:16px;">Paper trading · not real money</p>
</body></html>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    "Randy's Robot <onboarding@resend.dev>",
        to:      ['randybarclay1@gmail.com'],
        subject: `🤖 Robot bought ${trades.map(t => t.symbol).join(', ')} — ${date}`,
        html,
      }),
    });
    if (r.ok) console.log('Trade notification sent');
    else console.warn('Email send failed:', r.status);
  } catch (e) {
    console.warn('Trade email error:', e.message);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
