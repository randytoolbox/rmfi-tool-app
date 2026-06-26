#!/usr/bin/env node
// Runs via GitHub Actions at 7:45am ET (11:45 UTC) Mon-Fri.
// Scores watchlist using 5-factor methodology (value, momentum, profitability,
// earnings growth, earnings estimate revisions) and sends email via Resend.

const TO_EMAIL     = 'randybarclay1@gmail.com';
const FROM_EMAIL   = 'onboarding@resend.dev';
const SIGNALS_PATH = `${process.cwd()}/data/contract-signals.json`;
const MIN_PRICE    = 15;  // hard floor — no penny stocks / falling knives

const WATCHLIST = [
  'SPY','QQQ','DIA','IWM',
  'LMT','RTX','PLTR','CAT','XLE','BE','LUMN',
  'NVDA','MSFT','AAPL','TSLA','AMZN','META','GOOGL',
  'AMD','AVGO','IBM','DELL','CRWD',
  'OXY','CVX','HAL','MRO','WMB',
  'GLD','SLV','TLT','PYPL','BRK.B',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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
  } catch { /* no signals file or stale */ }
  return {};
}

// Batch fetch: price + 52W range + EPS in a single call
async function fetchAllStocks(symbols) {
  const headers = {
    'User-Agent': UA,
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
  };
  const parse = data => (data?.quoteResponse?.result || []).map(q => ({
    symbol:      q.symbol,
    name:        q.shortName || q.longName || q.symbol,
    price:       q.regularMarketPrice,
    changePct:   q.regularMarketChangePercent,
    high52:      q.fiftyTwoWeekHigh,
    low52:       q.fiftyTwoWeekLow,
    epsTrailing: q.epsTrailingTwelveMonths ?? null,
    epsForward:  q.epsForward ?? null,
  }));

  // Try query2 first (more reliable from CI environments), then query1 as fallback
  for (const host of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    try {
      const r = await fetch(
        `https://${host}/v8/finance/quote?symbols=${symbols.join(',')}`,
        { headers, signal: AbortSignal.timeout(15000) }
      );
      if (!r.ok) continue;
      const data = await r.json();
      const results = parse(data);
      if (results.length > 0) return results;
    } catch { /* try next host */ }
  }
  return [];
}

function score(d, contractSignals) {
  if (!d?.price) return -1;

  // Hard filter 1: price floor
  if (d.price < MIN_PRICE) return -1;

  // Hard filter 2: profitability — ETFs (SPY, GLD, TLT) have null EPS and pass through
  if (d.epsTrailing !== null && d.epsTrailing <= 0) return -1;

  // Hard filter 3: earnings must be GROWING (consensus: SA + CANSLIM + Motley Fool + Magic Formula)
  // If analysts expect >5% earnings decline, company is deteriorating — skip it
  if (d.epsForward !== null && d.epsTrailing !== null && d.epsTrailing > 0) {
    if (d.epsForward < d.epsTrailing * 0.95) return -1;
  }

  let s = 0;

  // Factor 1: Value — discount from 52W high
  const fromHigh = d.high52 ? (d.price - d.high52) / d.high52 * 100 : null;
  if (fromHigh !== null) {
    if (fromHigh < -30) s += 20;
    else if (fromHigh < -20) s += 15;
    else if (fromHigh < -10) s += 8;
    else if (fromHigh < -5)  s += 3;
    if (fromHigh > -2) s -= 10;
  }

  // Factor 2: Momentum — previous day % change
  if (d.changePct != null) {
    if (d.changePct >= 0.5 && d.changePct <= 4) s += 10;
    else if (d.changePct > 4) s += 4;
    else if (d.changePct < -4) s -= 5;
  }

  // Factor 3: Earnings estimate revision — analysts raising forward estimates is bullish
  if (d.epsForward !== null && d.epsTrailing !== null && d.epsTrailing > 0) {
    const revision = (d.epsForward - d.epsTrailing) / d.epsTrailing;
    if (revision > 0.15) s += 12;       // analysts expect 15%+ EPS growth
    else if (revision > 0.05) s += 6;   // analysts expect 5%+ EPS growth
    else if (revision < -0.05) s -= 5;  // analysts cutting estimates
  }

  // Factor 4: Government contract catalyst
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
  if (d.epsForward !== null && d.epsTrailing !== null && d.epsTrailing > 0) {
    const rev = (d.epsForward - d.epsTrailing) / d.epsTrailing;
    if (rev > 0.15) parts.push(`analysts expect +${(rev*100).toFixed(0)}% EPS growth`);
    else if (rev > 0.05) parts.push('rising earnings estimates');
  }
  const signal = contractSignals?.[d.symbol];
  if (signal) {
    const via = signal.via === 'direct' ? 'gov contract win' : `downstream ${signal.via.replace('downstream-','')} contract`;
    const amt = signal.amount ? ` $${(signal.amount/1e6).toFixed(0)}M` : '';
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

    let epsHtml = '';
    if (d.epsTrailing !== null) {
      const arrow  = (d.epsForward ?? 0) > d.epsTrailing ? ' ▲' : ((d.epsForward ?? 0) < d.epsTrailing ? ' ▼' : '');
      const arrowColor = arrow === ' ▲' ? '#16a34a' : '#dc2626';
      const fwdStr = d.epsForward !== null ? ` → fwd $${d.epsForward.toFixed(2)}` : '';
      epsHtml = `<div style="font-size:12px;color:#6b7280;margin-top:6px;">
        EPS (TTM) $${d.epsTrailing.toFixed(2)}${fwdStr}
        ${arrow ? `<span style="color:${arrowColor};font-weight:600;">${arrow}</span>` : ''}
      </div>`;
    }

    return `
      <div style="background:#f9fafb;border:1px solid ${hasSignal ? '#3b82f6' : '#e5e7eb'};border-radius:12px;padding:18px 20px;margin-bottom:12px;${hasSignal ? 'box-shadow:0 0 0 2px rgba(59,130,246,0.2);' : ''}">
        <div style="font-size:22px;font-weight:800;color:#1e3a5f;">${medals[i]} ${d.symbol}${hasSignal ? '&nbsp;<span style="font-size:12px;background:#dbeafe;color:#1d4ed8;padding:2px 7px;border-radius:999px;font-weight:600;">📋 contract</span>' : ''}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:2px;">${d.name}</div>
        <div style="font-size:26px;font-weight:700;color:#111827;margin-top:10px;">${fmt(d.price)}</div>
        <div style="font-size:13px;color:${chgClr};margin-top:3px;font-weight:600;">
          ${d.changePct != null ? (d.changePct >= 0 ? '+' : '') + d.changePct.toFixed(2) + '%' : '--'} (prev day)
          ${fromHigh != null ? `<span style="color:#9ca3af;font-weight:400;margin-left:12px;">${fromHigh.toFixed(1)}% from 52W high</span>` : ''}
        </div>
        ${epsHtml}
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
      Scored on: value (52W position) · momentum · earnings growth · estimate revisions · contract signals<br>
      Profitable companies only (EPS &gt; 0) · Min price $${MIN_PRICE}<br>
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

  const contractSignals = loadContractSignals();
  const signalCount = Object.keys(contractSignals).length;
  if (signalCount) console.log(`Contract signals: ${Object.keys(contractSignals).join(', ')}`);

  console.log('Fetching stock data...');
  const allData = (await fetchAllStocks(WATCHLIST)).filter(d => d?.price > 0);
  console.log(`Got data for ${allData.length}/${WATCHLIST.length} symbols`);

  const scoredAll = allData.map(d => ({ ...d, _score: score(d, contractSignals) }));
  const rejected  = scoredAll.filter(d => d._score < 0).map(d => d.symbol);
  const eligible  = scoredAll.filter(d => d._score >= 0).sort((a, b) => b._score - a._score);

  console.log(`Filtered out (${rejected.length}): ${rejected.join(', ')}`);
  console.log(`Eligible (${eligible.length}): ${eligible.slice(0, 8).map(d => `${d.symbol}(${d._score})`).join(', ')}`);

  const picks = eligible.slice(0, 3);
  if (!picks.length) {
    console.log('No picks available today');
    if (!allData.length) {
      // Data fetch failed entirely — send warning email
      const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL, to: [TO_EMAIL],
          subject: `⚠️ Morning Picks — data unavailable (${dateStr})`,
          html: `<p>Could not fetch stock data from Yahoo Finance this morning. No picks were generated.</p><p><a href="https://rmfi-tool-app.vercel.app/randys-money.html">Open app →</a></p>`,
        }),
      });
      console.log('Sent data-unavailable warning email');
    }
    return;
  }

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
