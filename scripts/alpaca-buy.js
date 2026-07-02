#!/usr/bin/env node
// Runs via GitHub Actions at 9:35am ET (13:35 UTC) Mon-Fri.
// Scores watchlist, fills open portfolio slots (up to 3) with paper buy orders.

const ALPACA_BASE    = 'https://paper-api.alpaca.markets';
const ALPACA_DATA    = 'https://data.alpaca.markets';
const MAX_POSITIONS  = 3;
const MIN_PRICE      = 15;  // hard floor — filters falling knives / penny stocks
const TREND_DAYS     = 60;  // require 60-day uptrend (mirrors SA's 75-day sustained signal)
const CONGRESS_BOOST = 15;  // bonus points when congress members recently bought

// Full S&P 500 universe — bot scores all ~500 stocks each morning and picks the best setups.
// Loaded from scripts/sp500-symbols.js so the list can be maintained separately.
const SP500 = require('./sp500-symbols');
const WATCHLIST = SP500;

const WATCHLIST_SET    = new Set(WATCHLIST);
const TICKER_BLOCKLIST = new Set([
  'THE','AND','FOR','BUY','SELL','STOCK','SHARES','ACT',
  'THAT','WITH','FROM','THIS','THEY','HAVE','BEEN','WILL',
  'WERE','THEN','THAN','WHEN','WHAT','ALSO','INTO','OVER',
]);

const UA = 'Mozilla/5.0 (compatible; randy-money/1.0)';

// Load contract signals saved by contract-radar.js last evening (if fresh)
function loadContractSignals() {
  try {
    const fs   = require('fs');
    const raw  = fs.readFileSync(`${process.cwd()}/data/contract-signals.json`, 'utf8');
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

// Batch fetch EPS data — chunked so Yahoo doesn't rate-limit on 500 symbols
async function fetchAllFundamentals(symbols) {
  const CHUNK = 40;
  const out = {};
  for (let i = 0; i < symbols.length; i += CHUNK) {
    const chunk = symbols.slice(i, i + CHUNK);
    try {
      for (const host of ['query1', 'query2']) {
        const r = await fetch(
          `https://${host}.finance.yahoo.com/v7/finance/quote?symbols=${chunk.join(',')}`,
          { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) }
        );
        if (!r.ok) continue;
        const data = await r.json();
        for (const q of (data?.quoteResponse?.result || [])) {
          out[q.symbol] = {
            epsTrailing:  q.epsTrailingTwelveMonths ?? null,
            epsForward:   q.epsForward ?? null,
            earningsDate: q.earningsTimestamp ?? null,
          };
        }
        break;
      }
    } catch { /* non-fatal — missing EPS just skips that filter */ }
    if (i + CHUNK < symbols.length) await new Promise(r => setTimeout(r, 250));
  }
  return out;
}

// Fetch last N daily bars for multiple symbols — batched to stay under URL limits
async function fetchAllBars(symbols, limit = 260) {
  const CHUNK = 100; // Alpaca handles up to ~150 symbols per request safely
  const out = {};
  for (let i = 0; i < symbols.length; i += CHUNK) {
    const chunk = symbols.slice(i, i + CHUNK);
    try {
      const r = await fetch(
        `${ALPACA_DATA}/v2/stocks/bars?symbols=${chunk.join(',')}&timeframe=1Day&limit=${limit}&feed=iex&sort=asc`,
        {
          headers: {
            'APCA-API-KEY-ID':     process.env.ALPACA_KEY_ID,
            'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
          },
          signal: AbortSignal.timeout(20000),
        }
      );
      if (r.ok) {
        const data = await r.json();
        Object.assign(out, data?.bars || {});
      }
    } catch (e) { console.warn(`fetchAllBars chunk ${i}-${i+CHUNK} failed:`, e.message); }
    if (i + CHUNK < symbols.length) await new Promise(r => setTimeout(r, 300));
  }
  return out;
}

// Derive price + 52W high/low directly from bar data — avoids per-symbol Yahoo calls
function deriveFromBars(sym, bars) {
  if (!bars || bars.length < 5) return null;
  const last   = bars[bars.length - 1];
  const price  = last.c;
  const prev   = bars[bars.length - 2]?.c || price;
  const changePct = prev ? ((price - prev) / prev) * 100 : null;
  // Use up to last 252 bars (~1 trading year) for 52W high/low
  const yr = bars.slice(-252);
  const high52 = Math.max(...yr.map(b => b.h));
  const low52  = Math.min(...yr.map(b => b.l));
  return { symbol: sym, name: sym, price, changePct, high52, low52 };
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

// Scale position size to conviction — let high-score picks go bigger
function budgetForScore(s) {
  if (s >= 45) return 500;
  if (s >= 30) return 400;
  if (s >= 15) return 275;
  return 200;
}

// Pull tickers recently bought by congress members (last 30 days)
async function fetchCongressBuys() {
  try {
    const r = await fetch('https://rmfi-tool-app.vercel.app/api/congress', {
      signal: AbortSignal.timeout(25000),
      headers: { 'User-Agent': UA },
    });
    if (!r.ok) return new Set();
    const data  = await r.json();
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const buys  = new Set();
    for (const trade of (data.trades || [])) {
      if (trade.ts >= cutoff && trade.sym && trade.sym !== '?' && /^[A-Z.]{2,6}$/.test(trade.sym)) {
        buys.add(trade.sym);
      }
    }
    if (buys.size) console.log(`Congress recently bought: ${[...buys].join(', ')}`);
    return buys;
  } catch (e) {
    console.warn('Congress fetch failed (non-fatal):', e.message);
    return new Set();
  }
}

// Returns { total, breakdown } — breakdown is shown in the UI and emailed
function score(d, contractSignals, barsMap, fundamentals, spyTrend, congressBuys) {
  const FAIL = { total: -1, breakdown: null };
  if (!d?.price) return FAIL;
  if (d.price < MIN_PRICE) return FAIL;

  const eps = fundamentals?.[d.symbol];
  if (eps?.epsTrailing !== null && eps?.epsTrailing !== undefined && eps.epsTrailing <= 0) return FAIL;
  if (eps?.epsForward !== null && eps?.epsForward !== undefined &&
      eps?.epsTrailing !== null && eps?.epsTrailing !== undefined && eps.epsTrailing > 0) {
    if (eps.epsForward < eps.epsTrailing * 0.95) return FAIL;
  }

  // Skip stocks with earnings within 7 days — gap risk is unacceptable
  if (eps?.earningsDate) {
    const daysToEarnings = (eps.earningsDate * 1000 - Date.now()) / (24 * 60 * 60 * 1000);
    if (daysToEarnings >= 0 && daysToEarnings <= 7) return FAIL;
  }

  const bars      = barsMap[d.symbol] || [];
  const trendLong = calcTrend(bars, TREND_DAYS);
  const trend5    = calcTrend(bars, 5);
  if (trendLong !== null && trendLong <= 0) return FAIL;
  if (trend5    !== null && trend5    <= 0) return FAIL;

  let s = 0;
  const bd = {
    fromHighPts: 0, momentumPts: 0, epsPts: 0,
    relStrengthPts: 0, volPts: 0, contractPts: 0, congressPts: 0,
  };

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

  if (congressBuys?.has(d.symbol)) {
    bd.congressPts = CONGRESS_BOOST;
    s += CONGRESS_BOOST;
  }

  return { total: s, breakdown: bd };
}

async function main() {
  if (!process.env.ALPACA_KEY_ID || !process.env.ALPACA_SECRET_KEY) {
    console.error('ALPACA_KEY_ID or ALPACA_SECRET_KEY not set'); process.exit(1);
  }

  const DRY_RUN = process.env.DRY_RUN === 'true';
  if (DRY_RUN) {
    console.log('🧪 DRY RUN — scoring S&P 500, no orders will be placed');
  } else {
    const clock = await alpaca('/v2/clock');
    if (!clock.is_open) { console.log('Market closed — skipping buys'); return; }
  }

  const positions   = await alpaca('/v2/positions');
  const heldSymbols = new Set(positions.map(p => p.symbol));
  const slots       = MAX_POSITIONS - positions.length;

  if (slots <= 0) {
    console.log('Portfolio full:', [...heldSymbols].join(', ')); return;
  }

  // Fetch congress buys first — lets us add their picks to the candidate pool
  const congressBuys   = await fetchCongressBuys();
  const congressExtras = [...congressBuys].filter(s =>
    !WATCHLIST_SET.has(s) && !heldSymbols.has(s) &&
    /^[A-Z.]{2,6}$/.test(s) && !TICKER_BLOCKLIST.has(s)
  ).slice(0, 10);
  if (congressExtras.length) console.log(`Congress extras added to pool: ${congressExtras.join(', ')}`);

  const allCandidates = [...new Set([...WATCHLIST, ...congressExtras])];
  const allSymbols    = [...new Set(['SPY', ...allCandidates])];

  console.log(`Fetching bars for ${allCandidates.length} symbols (S&P 500 universe)...`);
  // Fetch bars first — bars give us price, 52W H/L, trend, volume without per-symbol calls
  const barsMap = await fetchAllBars(allSymbols, 260);
  console.log(`Got bars for ${Object.keys(barsMap).length}/${allCandidates.length} symbols`);

  // SPY regime filter — pause all buys when broad market is in downtrend
  const spyTrend = calcTrend(barsMap['SPY'], TREND_DAYS);
  if (spyTrend !== null && spyTrend <= 0) {
    console.log(`SPY ${TREND_DAYS}-day trend: ${(spyTrend * 100).toFixed(1)}% — market in downtrend, pausing all buys`);
    return;
  }
  console.log(`SPY ${TREND_DAYS}-day trend: ${spyTrend !== null ? (spyTrend * 100).toFixed(1) + '% ✓' : 'unknown (proceeding)'}`);

  // Fetch fundamentals (EPS) in chunks — non-blocking, missing EPS just skips that filter
  console.log('Fetching EPS fundamentals in batches...');
  const fundamentals = await fetchAllFundamentals(allCandidates);
  console.log(`Got fundamentals for ${Object.keys(fundamentals).length} symbols`);

  const contractSignals = loadContractSignals();
  const signalCount     = Object.keys(contractSignals).length;
  if (signalCount) {
    console.log(`Contract signals active: ${Object.keys(contractSignals).join(', ')}`);
  }

  // Derive stock data from bars — no per-symbol HTTP calls needed
  const allData = allCandidates
    .map(sym => deriveFromBars(sym, barsMap[sym]))
    .filter(Boolean);
  console.log(`Derived price data for ${allData.length}/${allCandidates.length} symbols`);

  const scored = allData
    .map(d => {
      const { total, breakdown } = score(d, contractSignals, barsMap, fundamentals, spyTrend, congressBuys);
      if (total === -1) {
        const eps = fundamentals?.[d.symbol];
        if (eps?.earningsDate) {
          const days = (eps.earningsDate * 1000 - Date.now()) / (24 * 60 * 60 * 1000);
          if (days >= 0 && days <= 7) {
            console.log(`  SKIP ${d.symbol} — earnings in ${Math.ceil(days)}d`);
          }
        }
      }
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
    const conStr = bd.congressPts > 0 ? '  🏛congress' : '';
    console.log(
      `  ${d.symbol.padEnd(6)} score:${String(d._score).padStart(3)}  $${d.price.toFixed(2).padStart(8)}` +
      `  fromHigh:${fh}%  t${TREND_DAYS}:${bd.trendLong !== null && bd.trendLong !== undefined ? (bd.trendLong*100).toFixed(1)+'%' : 'n/a'}${epsStr}${volStr}${conStr}`
    );
  }

  const picks = scored.slice(0, DRY_RUN ? 5 : slots);
  if (!picks.length) { console.log('\nNo eligible picks'); return; }

  const today = new Date().toISOString().slice(0, 10);
  console.log(DRY_RUN ? '\n🧪 DRY RUN — would place these orders tomorrow:' : '');

  const executed = [];
  for (const pick of picks) {
    const notional = budgetForScore(pick._score);
    const qty = Math.max(1, Math.floor(notional / pick.price));
    if (DRY_RUN) {
      console.log(`  WOULD BUY ${qty} x ${pick.symbol} @ ~$${pick.price.toFixed(2)} = ~$${(qty * pick.price).toFixed(2)} (score ${pick._score} → $${notional} budget)`);
      console.log(`    WHY: ${buildTradeReason(pick._breakdown)}`);
      executed.push({ symbol: pick.symbol, name: pick.name, qty, price: pick.price,
                      value: qty * pick.price, notional, score: pick._score, breakdown: pick._breakdown });
      continue;
    }
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
      console.log(`BUY ${qty} x ${pick.symbol} @ ~$${pick.price.toFixed(2)} = ~$${(qty * pick.price).toFixed(2)} (score ${pick._score} → $${notional} budget)`);
      executed.push({ symbol: pick.symbol, name: pick.name, qty, price: pick.price,
                      value: qty * pick.price, notional, score: pick._score, breakdown: pick._breakdown });
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
      congressBuy: (d._breakdown?.congressPts ?? 0) > 0,
    })),
  };
  writeFileSync(logPath, JSON.stringify(buyLog, null, 2));
  console.log(`Buy log saved → data/buy-log.json (${executed.length} trades)`);

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
  if (bd.congressPts  > 0)   parts.push(`🏛 congress recently bought (+${bd.congressPts}pts)`);
  return parts.join(' · ') || 'score criteria met';
}

async function sendTradeEmail(trades, date) {
  try {
    const tradesHtml = trades.map(t => `
      <div style="background:#0a1a2e;border-radius:8px;padding:14px 16px;margin-bottom:12px;border-left:4px solid #4ade80;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="color:#4ade80;font-weight:800;font-size:16px;">${t.symbol}</span>
          <span style="color:#a78bfa;font-size:11px;font-weight:700;">SCORE: ${t.score} · $${t.notional} budget</span>
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
