#!/usr/bin/env node
// Backtests the alpaca-buy.js scoring algorithm against 6 months of historical data.
// Uses Alpaca Basic plan free historical bars (IEX feed).
// Run: ALPACA_KEY_ID=xxx ALPACA_SECRET_KEY=xxx node scripts/backtest.js

const ALPACA_DATA  = 'https://data.alpaca.markets';
const START_DATE   = '2025-03-25'; // 90 days
const END_DATE     = '2025-06-23';
const INITIAL_CASH = 1000;
const MAX_POS      = 3;
const BUDGET_PER   = 333;
const TAKE_PROFIT  = 0.08;
const STOP_LOSS    = -0.07;
const MAX_DAYS     = 7;

const WATCHLIST = [
  'SPY','QQQ','DIA','IWM',
  'LMT','RTX','PLTR','CAT','XLE','BE','LUMN',
  'NVDA','MSFT','AAPL','TSLA','AMZN','META','GOOGL',
  'AMD','AVGO','IBM','DELL','CRWD','FLEX','MTSI',
  'OXY','CVX','HAL','MRO','WMB',
  'GLD','SLV','TLT','PYPL',
];

async function alpacaData(path) {
  const r = await fetch(`${ALPACA_DATA}${path}`, {
    headers: {
      'APCA-API-KEY-ID':     process.env.ALPACA_KEY_ID,
      'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
    },
  });
  if (!r.ok) throw new Error(`Alpaca data ${r.status}: ${await r.text()}`);
  return r.json();
}

async function fetchAllBars(symbols, start, end) {
  const bars = {};
  const BATCH = 10;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    let url = `/v2/stocks/bars?symbols=${batch.join(',')}&timeframe=1Day&start=${start}&end=${end}&limit=10000&adjustment=all&feed=iex`;
    while (url) {
      const data = await alpacaData(url);
      for (const [sym, symBars] of Object.entries(data.bars || {})) {
        if (!bars[sym]) bars[sym] = [];
        bars[sym].push(...symBars);
      }
      url = data.next_page_token ? `${url.split('?')[0]}?${new URLSearchParams({ ...Object.fromEntries(new URL('http://x' + url).searchParams), page_token: data.next_page_token })}` : null;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return bars;
}

function getTradingDays(bars) {
  const days = new Set();
  for (const symBars of Object.values(bars)) {
    for (const b of symBars) days.add(b.t.slice(0, 10));
  }
  return [...days].sort();
}

function scoreStock(sym, dayIndex, allBars) {
  const symBars = allBars[sym];
  if (!symBars || dayIndex < 5) return -999;

  const today = symBars[dayIndex];
  const prev  = symBars[dayIndex - 1];
  if (!today || !prev) return -999;

  const price     = today.c;
  const changePct = (today.c - prev.c) / prev.c * 100;

  // Hard filter 1: no cheap/volatile stocks under $15
  if (price < 15) return -999;

  // Volume filter: skip low-conviction days (< 50% of 20-day avg volume)
  const recentBars = symBars.slice(Math.max(0, dayIndex - 20), dayIndex);
  if (recentBars.length >= 5) {
    const avgVol = recentBars.reduce((s, b) => s + b.v, 0) / recentBars.length;
    if (today.v < avgVol * 0.5) return -999;
  }

  // 52W high/low from available history up to this point
  const lookback = symBars.slice(Math.max(0, dayIndex - 252), dayIndex + 1);
  const high52   = Math.max(...lookback.map(b => b.h));
  const low52    = Math.min(...lookback.map(b => b.l));
  const fromHigh = (price - high52) / high52 * 100;
  const fromLow  = (price - low52)  / low52  * 100;

  // 5-day trend: catch falling knives vs real bounces
  const fiveDaysAgo   = symBars[dayIndex - 5];
  const fiveDayChange = fiveDaysAgo ? (price - fiveDaysAgo.c) / fiveDaysAgo.c * 100 : 0;

  // 30-day trend: detect sustained downtrends
  const thirtyDaysAgo   = symBars[Math.max(0, dayIndex - 30)];
  const thirtyDayChange = thirtyDaysAgo ? (price - thirtyDaysAgo.c) / thirtyDaysAgo.c * 100 : 0;

  // Hard filter 2: must be in positive 30-day trend (not a falling knife)
  if (thirtyDayChange <= 0) return -999;

  // Hard filter 3: 5-day trend must also be positive (no brief bounces in downtrends)
  if (fiveDayChange <= 0) return -999;

  // Up-day ratio: count green days in last 20 sessions
  const last20 = symBars.slice(Math.max(0, dayIndex - 20), dayIndex);
  let upDays = 0;
  for (let i = 1; i < last20.length; i++) {
    if (last20[i].c > last20[i - 1].c) upDays++;
  }
  const upDayRatio = last20.length > 1 ? upDays / (last20.length - 1) : 0.5;

  let s = 0;

  // Distance from 52W high (dip buying)
  if (fromHigh < -50)      s += 20;
  else if (fromHigh < -35) s += 15;
  else if (fromHigh < -20) s += 10;
  else if (fromHigh < -10) s += 5;
  if (fromHigh > -5)       s -= 10;

  // Near 52W low = still falling, no floor found yet
  if (fromLow < 10)       s -= 15;
  else if (fromLow < 20)  s -= 8;

  // Today's momentum
  if (changePct >= 1 && changePct <= 5)      s += 12;
  else if (changePct > 5 && changePct <= 10) s += 8;
  else if (changePct > 0 && changePct < 1)   s += 3;
  else if (changePct < -5)                   s -= 10;
  else if (changePct < 0)                    s -= 4;

  // 5-day trend (falling knife filter)
  if (fiveDayChange > 5)        s += 8;
  else if (fiveDayChange > 0)   s += 4;
  else if (fiveDayChange < -15) s -= 15;
  else if (fiveDayChange < -8)  s -= 8;
  else if (fiveDayChange < -3)  s -= 4;

  // 30-day trend (sustained downtrend = avoid)
  if (thirtyDayChange > 10)      s += 6;
  else if (thirtyDayChange > 0)  s += 3;
  else if (thirtyDayChange < -20) s -= 15;
  else if (thirtyDayChange < -10) s -= 8;
  else if (thirtyDayChange < -5)  s -= 4;

  // Up-day ratio: fewer than 40% green days = chronic loser
  if (upDayRatio >= 0.55)      s += 6;
  else if (upDayRatio >= 0.45) s += 2;
  else if (upDayRatio < 0.35)  s -= 12;
  else if (upDayRatio < 0.40)  s -= 6;

  return s;
}

async function main() {
  if (!process.env.ALPACA_KEY_ID || !process.env.ALPACA_SECRET_KEY) {
    console.error('Set ALPACA_KEY_ID and ALPACA_SECRET_KEY'); process.exit(1);
  }

  console.log(`Fetching historical bars for ${WATCHLIST.length} symbols...`);
  // Pull extra history for 52W scoring
  const histStart = '2023-12-01';
  const allBars   = await fetchAllBars(WATCHLIST, histStart, END_DATE);
  console.log(`Got data for ${Object.keys(allBars).length} symbols`);

  const tradingDays = getTradingDays(allBars);
  const startIdx    = tradingDays.findIndex(d => d >= START_DATE);
  const simDays     = tradingDays.slice(startIdx);

  console.log(`Simulating ${simDays.length} trading days from ${simDays[0]} to ${simDays[simDays.length-1]}\n`);

  // Build per-symbol day index maps
  const symDayIndex = {};
  for (const [sym, bars] of Object.entries(allBars)) {
    symDayIndex[sym] = {};
    bars.forEach((b, i) => { symDayIndex[sym][b.t.slice(0, 10)] = i; });
  }

  let cash      = INITIAL_CASH;
  const positions = {}; // sym -> { shares, entryPrice, entryDay, dayIndex }
  const trades    = [];
  let day = 0;

  for (const dateStr of simDays) {
    day++;

    // Check existing positions for exits
    for (const [sym, pos] of Object.entries(positions)) {
      const idx   = symDayIndex[sym]?.[dateStr];
      if (idx == null) continue;
      const price = allBars[sym][idx].c;
      const plpc  = (price - pos.entryPrice) / pos.entryPrice;
      const daysHeld = day - pos.entryDay;

      let reason = null;
      if (plpc >= TAKE_PROFIT)       reason = `Take profit ${(plpc*100).toFixed(1)}%`;
      else if (plpc <= STOP_LOSS)    reason = `Stop loss ${(plpc*100).toFixed(1)}%`;
      else if (daysHeld >= MAX_DAYS) reason = `Max days (${daysHeld})`;

      if (reason) {
        const proceeds = pos.shares * price;
        const pl       = proceeds - pos.cost;
        cash += proceeds;
        trades.push({ sym, entryDate: pos.entryDate, exitDate: dateStr, pl, plpc, reason });
        delete positions[sym];
      }
    }

    // Market regime filter: don't buy when SPY is in a 30-day downtrend
    const spyIdx  = symDayIndex['SPY']?.[dateStr];
    const spyBars = allBars['SPY'];
    let spyTrend  = 1;
    if (spyIdx != null && spyIdx >= 30) {
      const spyNow = spyBars[spyIdx].c;
      const spy30  = spyBars[spyIdx - 30].c;
      spyTrend = (spyNow - spy30) / spy30;
    }

    // Buy new positions
    const slots = MAX_POS - Object.keys(positions).length;
    if (slots > 0 && spyTrend > 0) {
      const scored = WATCHLIST
        .filter(sym => !positions[sym])
        .map(sym => {
          const idx = symDayIndex[sym]?.[dateStr];
          return { sym, score: idx != null ? scoreStock(sym, idx, allBars) : -999 };
        })
        .filter(x => x.score >= 8)
        .sort((a, b) => b.score - a.score)
        .slice(0, slots);

      for (const { sym } of scored) {
        const idx   = symDayIndex[sym]?.[dateStr];
        if (idx == null) continue;
        const price  = allBars[sym][idx].c;
        const budget = Math.min(BUDGET_PER, cash);
        if (budget < 10) continue;
        const shares = budget / price;
        cash -= budget;
        positions[sym] = { shares, entryPrice: price, cost: budget, entryDate: dateStr, entryDay: day };
      }
    }
  }

  // Close remaining open positions at last price
  const lastDay = simDays[simDays.length - 1];
  for (const [sym, pos] of Object.entries(positions)) {
    const idx   = symDayIndex[sym]?.[lastDay];
    if (idx == null) continue;
    const price    = allBars[sym][idx].c;
    const proceeds = pos.shares * price;
    const pl       = proceeds - pos.cost;
    cash += proceeds;
    trades.push({ sym, entryDate: pos.entryDate, exitDate: lastDay, pl, plpc: pl / pos.cost, reason: 'End of test' });
  }

  // Results
  const finalValue  = cash;
  const totalReturn = (finalValue - INITIAL_CASH) / INITIAL_CASH * 100;
  const winners     = trades.filter(t => t.pl > 0);
  const losers      = trades.filter(t => t.pl <= 0);
  const winRate     = trades.length ? (winners.length / trades.length * 100) : 0;
  const avgWin      = winners.length ? winners.reduce((s,t) => s + t.plpc, 0) / winners.length * 100 : 0;
  const avgLoss     = losers.length  ? losers.reduce((s,t)  => s + t.plpc, 0) / losers.length  * 100 : 0;

  console.log('═══════════════════════════════════════');
  console.log('  BACKTEST RESULTS — 6 Month Simulation');
  console.log('═══════════════════════════════════════');
  console.log(`  Period:        ${START_DATE} → ${END_DATE}`);
  console.log(`  Starting cash: $${INITIAL_CASH.toFixed(2)}`);
  console.log(`  Final value:   $${finalValue.toFixed(2)}`);
  console.log(`  Total return:  ${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`);
  console.log(`  Total trades:  ${trades.length}`);
  console.log(`  Win rate:      ${winRate.toFixed(1)}%`);
  console.log(`  Avg win:       +${avgWin.toFixed(2)}%`);
  console.log(`  Avg loss:      ${avgLoss.toFixed(2)}%`);
  console.log('');
  console.log('  TOP 5 TRADES:');
  [...trades].sort((a,b) => b.pl - a.pl).slice(0,5).forEach(t => {
    console.log(`    ${t.sym.padEnd(6)} ${t.entryDate} → ${t.exitDate}  ${t.pl >= 0 ? '+' : ''}$${t.pl.toFixed(2)} (${(t.plpc*100).toFixed(1)}%)  [${t.reason}]`);
  });
  console.log('');
  console.log('  WORST 5 TRADES:');
  [...trades].sort((a,b) => a.pl - b.pl).slice(0,5).forEach(t => {
    console.log(`    ${t.sym.padEnd(6)} ${t.entryDate} → ${t.exitDate}  ${t.pl >= 0 ? '+' : ''}$${t.pl.toFixed(2)} (${(t.plpc*100).toFixed(1)}%)  [${t.reason}]`);
  });
  console.log('');
  console.log('  MOST TRADED:');
  const freq = {};
  trades.forEach(t => { freq[t.sym] = (freq[t.sym]||0) + 1; });
  Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,5).forEach(([sym,n]) => {
    const symTrades = trades.filter(t => t.sym === sym);
    const symPL = symTrades.reduce((s,t) => s + t.pl, 0);
    console.log(`    ${sym.padEnd(6)} ${n} trades  total P&L: ${symPL >= 0 ? '+' : ''}$${symPL.toFixed(2)}`);
  });
  console.log('═══════════════════════════════════════');
}

main().catch(e => { console.error(e); process.exit(1); });
