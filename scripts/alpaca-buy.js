#!/usr/bin/env node
// Runs via GitHub Actions at 9:35am ET (13:35 UTC) Mon-Fri.
// Scores watchlist, fills open portfolio slots (up to 3) with paper buy orders.

const ALPACA_BASE    = 'https://paper-api.alpaca.markets';
const ALPACA_DATA    = 'https://data.alpaca.markets';
const MAX_POSITIONS  = 3;
const BUDGET_PER     = 333; // ~$333 per position
const SIGNALS_PATH   = `${process.cwd()}/data/contract-signals.json`;
const MIN_PRICE      = 15;  // hard floor — filters falling knives / penny stocks

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

// Fetch last N daily bars for multiple symbols in one request
async function fetchAllBars(symbols, limit = 35) {
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

function score(d, contractSignals, barsMap) {
  if (!d?.price) return -1;

  // Hard filters (same as backtest v5+)
  if (d.price < MIN_PRICE) return -1;

  const bars    = barsMap[d.symbol] || [];
  const trend30 = calcTrend(bars, 30);
  const trend5  = calcTrend(bars, 5);
  if (trend30 !== null && trend30 <= 0) return -1;  // must be in 30-day uptrend
  if (trend5  !== null && trend5  <= 0) return -1;  // must be in 5-day uptrend

  let s = 0;
  const fromHigh = d.high52 ? (d.price - d.high52) / d.high52 * 100 : null;
  if (fromHigh !== null) {
    if (fromHigh < -30) s += 20;
    else if (fromHigh < -20) s += 15;
    else if (fromHigh < -10) s += 8;
    else if (fromHigh < -5)  s += 3;
    if (fromHigh > -2) s -= 10;
  }
  if (d.changePct != null) {
    if (d.changePct >= 0.5 && d.changePct <= 4) s += 10;
    else if (d.changePct > 4) s += 4;
    else if (d.changePct < -4) s -= 5;
  }
  // Government contract catalyst boost
  const signal = contractSignals?.[d.symbol];
  if (signal) s += signal.boost;
  return s;
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

  // Fetch recent daily bars for all symbols + SPY in one API call
  const allSymbols = [...new Set(['SPY', ...WATCHLIST])];
  console.log('Fetching recent bars for trend/regime analysis...');
  const barsMap = await fetchAllBars(allSymbols, 35);

  // SPY regime filter — pause all buys when broad market is in 30-day downtrend
  const spyTrend = calcTrend(barsMap['SPY'], 30);
  if (spyTrend !== null && spyTrend <= 0) {
    console.log(`SPY 30-day trend: ${(spyTrend * 100).toFixed(1)}% — market in downtrend, pausing all buys`);
    return;
  }
  console.log(`SPY 30-day trend: ${spyTrend !== null ? (spyTrend * 100).toFixed(1) + '% ✓' : 'unknown (proceeding)'}`);

  const contractSignals = loadContractSignals();
  const signalCount     = Object.keys(contractSignals).length;
  if (signalCount) {
    console.log(`Contract signals active: ${Object.keys(contractSignals).join(', ')}`);
  }

  console.log(`Open slots: ${slots} — fetching stock data...`);
  const allData = (await Promise.all(WATCHLIST.map(fetchStock))).filter(Boolean);
  console.log(`Got data for ${allData.length}/${WATCHLIST.length} symbols`);

  const scored = allData
    .map(d => ({ ...d, _score: score(d, contractSignals, barsMap) }))
    .filter(d => d._score >= 0 && !heldSymbols.has(d.symbol))
    .sort((a, b) => b._score - a._score);

  console.log('\nTop candidates after filters:');
  for (const d of scored.slice(0, 8)) {
    const t30 = calcTrend(barsMap[d.symbol], 30);
    const t5  = calcTrend(barsMap[d.symbol], 5);
    const fh  = d.high52 ? ((d.price - d.high52) / d.high52 * 100).toFixed(1) : 'n/a';
    console.log(
      `  ${d.symbol.padEnd(6)} score:${String(d._score).padStart(3)}  $${d.price.toFixed(2).padStart(8)}` +
      `  fromHigh:${fh}%  t30:${t30 !== null ? (t30*100).toFixed(1)+'%' : 'n/a'}  t5:${t5 !== null ? (t5*100).toFixed(1)+'%' : 'n/a'}`
    );
  }

  const picks = scored.slice(0, slots);
  if (!picks.length) { console.log('\nNo eligible picks'); return; }

  const today = new Date().toISOString().slice(0, 10);
  console.log('');

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
    } catch (e) {
      console.error(`Order failed for ${pick.symbol}:`, e.message);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
