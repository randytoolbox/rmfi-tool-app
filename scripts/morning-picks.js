#!/usr/bin/env node
// Runs via GitHub Actions at 7:45am ET (11:45 UTC) Mon-Fri.
// Uses Alpaca Data API exclusively — no Yahoo Finance dependency.
// Scores watchlist on value (52W position), momentum, and contract signals.

const TO_EMAIL     = 'randybarclay1@gmail.com';
const FROM_EMAIL   = 'onboarding@resend.dev';
const SIGNALS_PATH = `${process.cwd()}/data/contract-signals.json`;
const MIN_PRICE    = 15;

const ALPACA_DATA = 'https://data.alpaca.markets';

const WATCHLIST = [
  'SPY','QQQ','DIA','IWM',
  'LMT','RTX','PLTR','CAT','XLE','BE','LUMN',
  'NVDA','MSFT','AAPL','TSLA','AMZN','META','GOOGL',
  'AMD','AVGO','IBM','DELL','CRWD',
  'OXY','CVX','HAL','MRO','WMB',
  'GLD','SLV','TLT','PYPL',
];

const NAMES = {
  SPY:'S&P 500 ETF', QQQ:'Nasdaq 100 ETF', DIA:'Dow Jones ETF', IWM:'Russell 2000 ETF',
  LMT:'Lockheed Martin', RTX:'RTX Corp', PLTR:'Palantir', CAT:'Caterpillar',
  XLE:'Energy ETF', BE:'Bloom Energy', LUMN:'Lumen Technologies',
  NVDA:'Nvidia', MSFT:'Microsoft', AAPL:'Apple', TSLA:'Tesla',
  AMZN:'Amazon', META:'Meta', GOOGL:'Alphabet',
  AMD:'AMD', AVGO:'Broadcom', IBM:'IBM', DELL:'Dell', CRWD:'CrowdStrike',
  OXY:'Occidental', CVX:'Chevron', HAL:'Halliburton', MRO:'Marathon Oil', WMB:'Williams Cos',
  GLD:'Gold ETF', SLV:'Silver ETF', TLT:'20Y Treasury ETF', PYPL:'PayPal',
};

function alpacaHeaders() {
  return {
    'APCA-API-KEY-ID':     process.env.ALPACA_KEY_ID,
    'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
  };
}

function loadContractSignals() {
  try {
    const fs  = require('fs');
    const raw = fs.readFileSync(SIGNALS_PATH, 'utf8');
    const data = JSON.parse(raw);
    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (data.generatedAt === today || data.generatedAt === yesterday) return data.signals || {};
  } catch { /* no file or stale */ }
  return {};
}

async function fetchSnapshots(symbols) {
  const r = await fetch(
    `${ALPACA_DATA}/v2/stocks/snapshots?symbols=${symbols.join(',')}&feed=iex`,
    { headers: alpacaHeaders(), signal: AbortSignal.timeout(20000) }
  );
  if (!r.ok) throw new Error(`Alpaca snapshots returned ${r.status}`);
  return r.json();
}

async function fetchYearBars(symbols) {
  const start = new Date(Date.now() - 366 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const allBars = {};
  let pageToken = null;

  do {
    const url = new URL(`${ALPACA_DATA}/v2/stocks/bars`);
    url.searchParams.set('symbols', symbols.join(','));
    url.searchParams.set('timeframe', '1Day');
    url.searchParams.set('start', start);
    url.searchParams.set('limit', '10000');
    url.searchParams.set('feed', 'iex');
    if (pageToken) url.searchParams.set('page_token', pageToken);

    const r = await fetch(url.toString(), { headers: alpacaHeaders(), signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`Alpaca bars returned ${r.status}`);
    const data = await r.json();

    for (const [sym, bars] of Object.entries(data.bars || {})) {
      if (!allBars[sym]) allBars[sym] = [];
      allBars[sym].push(...bars);
    }
    pageToken = data.next_page_token || null;
  } while (pageToken);

  return allBars;
}

async function fetchAllStocks(symbols) {
  const [snapshots, yearBars] = await Promise.all([
    fetchSnapshots(symbols),
    fetchYearBars(symbols),
  ]);

  return symbols.map(sym => {
    const snap = snapshots[sym];
    if (!snap) return null;

    const price    = snap.latestTrade?.p || snap.dailyBar?.c || snap.prevDailyBar?.c || null;
    const prevClose = snap.prevDailyBar?.c || snap.dailyBar?.o || null;
    const changePct = (price && prevClose) ? (price - prevClose) / prevClose * 100 : null;

    const bars  = yearBars[sym] || [];
    const highs = bars.map(b => b.h);
    const lows  = bars.map(b => b.l);
    const high52 = highs.length ? highs.reduce((a, b) => Math.max(a, b), -Infinity) : null;
    const low52  = lows.length  ? lows.reduce((a, b) => Math.min(a, b), Infinity)  : null;

    return { symbol: sym, name: NAMES[sym] || sym, price, changePct, high52, low52 };
  }).filter(d => d?.price > 0);
}

function score(d, contractSignals) {
  if (!d?.price) return -1;
  if (d.price < MIN_PRICE) return -1;

  let s = 0;

  // Factor 1: Value — distance from 52W high
  const fromHigh = d.high52 ? (d.price - d.high52) / d.high52 * 100 : null;
  if (fromHigh !== null) {
    if (fromHigh < -30)      s += 22;
    else if (fromHigh < -20) s += 16;
    else if (fromHigh < -10) s += 9;
    else if (fromHigh < -5)  s += 4;
    if (fromHigh > -2)       s -= 10;
  }

  // Factor 2: Momentum — previous day % change
  if (d.changePct != null) {
    if (d.changePct >= 0.5 && d.changePct <= 4) s += 10;
    else if (d.changePct > 4)                   s += 4;
    else if (d.changePct < -4)                  s -= 5;
  }

  // Factor 3: Government contract catalyst
  const signal = contractSignals?.[d.symbol];
  if (signal) s += signal.boost;

  return s;
}

function reason(d, contractSignals) {
  const parts = [];
  const fromHigh = d.high52 ? (d.price - d.high52) / d.high52 * 100 : null;
  if (fromHigh !== null && fromHigh < -8)
    parts.push(`${Math.abs(fromHigh).toFixed(0)}% below 52W high`);
  if (d.changePct != null && Math.abs(d.changePct) >= 0.3)
    parts.push(d.changePct > 0
      ? `+${d.changePct.toFixed(1)}% yesterday`
      : `dipped ${Math.abs(d.changePct).toFixed(1)}% — potential entry`);
  const signal = contractSignals?.[d.symbol];
  if (signal) {
    const via = signal.via === 'direct' ? 'gov contract win' : `downstream ${signal.via.replace('downstream-', '')} contract`;
    const amt = signal.amount ? ` $${(signal.amount / 1e6).toFixed(0)}M` : '';
    parts.push(`${via}${amt}`);
  }
  return parts.length ? parts.join(' · ') : 'top watchlist position';
}

function fmt(n) {
  if (n == null) return '--';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildHtml(picks, dateStr, contractSignals) {
  const medals = ['🥇', '🥈', '🥉'];

  const cards = picks.map((d, i) => {
    const chgClr   = (d.changePct ?? 0) >= 0 ? '#16a34a' : '#dc2626';
    const fromHigh = d.high52 ? (d.price - d.high52) / d.high52 * 100 : null;
    const hasSignal = !!contractSignals?.[d.symbol];

    return `
      <div style="background:#f9fafb;border:1px solid ${hasSignal ? '#3b82f6' : '#e5e7eb'};border-radius:12px;padding:18px 20px;margin-bottom:12px;${hasSignal ? 'box-shadow:0 0 0 2px rgba(59,130,246,0.2);' : ''}">
        <div style="font-size:22px;font-weight:800;color:#1e3a5f;">${medals[i]} ${d.symbol}${hasSignal ? '&nbsp;<span style="font-size:12px;background:#dbeafe;color:#1d4ed8;padding:2px 7px;border-radius:999px;font-weight:600;">📋 contract</span>' : ''}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:2px;">${d.name}</div>
        <div style="font-size:26px;font-weight:700;color:#111827;margin-top:10px;">${fmt(d.price)}</div>
        <div style="font-size:13px;color:${chgClr};margin-top:3px;font-weight:600;">
          ${d.changePct != null ? (d.changePct >= 0 ? '+' : '') + d.changePct.toFixed(2) + '%' : '--'} (prev day)
          ${fromHigh != null ? `<span style="color:#9ca3af;font-weight:400;margin-left:12px;">${fromHigh.toFixed(1)}% from 52W high</span>` : ''}
        </div>
        <div style="font-size:12px;color:#6b7280;margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb;">${reason(d, contractSignals)}</div>
      </div>`;
  }).join('');

  const signalSyms = Object.keys(contractSignals);
  const signalBanner = signalSyms.length ? `
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#1d4ed8;">
      📋 <strong>Contract radar:</strong> ${signalSyms.join(', ')} have recent gov contract activity
    </div>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:540px;margin:0 auto;padding:24px 16px;">
    <div style="background:#1e3a5f;border-radius:14px;padding:20px 24px;margin-bottom:20px;">
      <div style="font-size:22px;font-weight:800;color:#ffffff;">📈 Randy's Morning Picks</div>
      <div style="font-size:13px;color:#93c5fd;margin-top:4px;">${dateStr} · Pre-market brief · US equities</div>
    </div>
    ${signalBanner}
    ${cards}
    <div style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;padding-top:16px;border-top:1px solid #f3f4f6;">
      Scored on: value (52W position) · momentum · contract signals<br>
      Min price $${MIN_PRICE} · Powered by Alpaca Market Data<br>
      Not financial advice — do your own research before trading.<br><br>
      <a href="https://rmfi-tool-app.vercel.app/randys-money.html" style="color:#3b82f6;">Open full app →</a>
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.error('RESEND_API_KEY not set'); process.exit(1); }
  if (!process.env.ALPACA_KEY_ID || !process.env.ALPACA_SECRET_KEY) {
    console.error('ALPACA credentials not set'); process.exit(1);
  }

  const contractSignals = loadContractSignals();
  const signalCount = Object.keys(contractSignals).length;
  if (signalCount) console.log(`Contract signals: ${Object.keys(contractSignals).join(', ')}`);

  console.log('Fetching stock data from Alpaca...');
  const allData = await fetchAllStocks(WATCHLIST);
  console.log(`Got data for ${allData.length}/${WATCHLIST.length} symbols`);

  const scoredAll = allData.map(d => ({ ...d, _score: score(d, contractSignals) }));
  const rejected  = scoredAll.filter(d => d._score < 0).map(d => d.symbol);
  const eligible  = scoredAll.filter(d => d._score >= 0).sort((a, b) => b._score - a._score);

  console.log(`Filtered out (${rejected.length}): ${rejected.join(', ')}`);
  console.log(`Eligible (${eligible.length}): ${eligible.slice(0, 8).map(d => `${d.symbol}(${d._score})`).join(', ')}`);

  const picks = eligible.slice(0, 3);
  if (!picks.length) { console.log('No picks today — all filtered out'); return; }

  console.log('Top 3 picks:', picks.map(d => d.symbol).join(', '));

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York'
  });

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to:   [TO_EMAIL],
      subject: `📈 Morning Picks — ${dateStr}`,
      html: buildHtml(picks, dateStr, contractSignals),
    }),
  });

  const result = await emailRes.json();
  if (!emailRes.ok) { console.error('Resend error:', result); process.exit(1); }
  console.log('Email sent! ID:', result.id);
}

main().catch(e => { console.error(e); process.exit(1); });
