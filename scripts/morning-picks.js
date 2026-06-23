#!/usr/bin/env node
// Runs via GitHub Actions at 7:45am ET (11:45 UTC) Mon-Fri.
// Fetches stock data, scores top 3, sends email via Resend.

const TO_EMAIL   = 'randybarclay1@gmail.com';
const FROM_EMAIL = 'onboarding@resend.dev';

const WATCHLIST = [
  'SPY','QQQ','DIA','IWM',
  'LMT','RTX','PLTR','CAT','XLE','BE','LUMN',
  'NVDA','MSFT','AAPL','TSLA','AMZN','META','GOOGL',
  'AMD','AVGO','IBM','DELL','CRWD',
  'OXY','CVX','HAL','MRO','WMB',
  'GLD','SLV','TLT','PYPL','BRK.B',
];

const UA = 'Mozilla/5.0 (compatible; randy-money/1.0)';

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

function score(d) {
  if (!d?.price) return -1;
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
  return s;
}

function reason(d) {
  const parts = [];
  const fromHigh = d.high52 ? (d.price - d.high52) / d.high52 * 100 : null;
  if (fromHigh !== null && fromHigh < -8) parts.push(`${Math.abs(fromHigh).toFixed(0)}% below 52W high`);
  if (d.changePct != null && Math.abs(d.changePct) >= 0.3)
    parts.push(d.changePct > 0 ? `+${d.changePct.toFixed(1)}% yesterday` : `dipped ${Math.abs(d.changePct).toFixed(1)}% — potential entry`);
  const fromLow = d.low52 ? (d.price - d.low52) / d.low52 * 100 : null;
  if (fromLow !== null && fromLow < 15) parts.push('near 52W low — oversold zone');
  return parts.length ? parts.join(' · ') : 'top watchlist position';
}

function fmt(n) {
  if (n == null) return '--';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildHtml(picks, dateStr) {
  const medals = ['🥇', '🥈', '🥉'];
  const cards = picks.map((d, i) => {
    const chgClr  = (d.changePct ?? 0) >= 0 ? '#16a34a' : '#dc2626';
    const fromHigh = d.high52 ? (d.price - d.high52) / d.high52 * 100 : null;
    return `
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:12px;">
        <div style="font-size:22px;font-weight:800;color:#1e3a5f;">${medals[i]} ${d.symbol}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:2px;">${d.name}</div>
        <div style="font-size:26px;font-weight:700;color:#111827;margin-top:10px;">${fmt(d.price)}</div>
        <div style="font-size:13px;color:${chgClr};margin-top:3px;font-weight:600;">
          ${d.changePct != null ? (d.changePct >= 0 ? '+' : '') + d.changePct.toFixed(2) + '%' : '--'} (prev day)
          ${fromHigh != null ? `<span style="color:#9ca3af;font-weight:400;margin-left:12px;">${fromHigh.toFixed(1)}% from 52W high</span>` : ''}
        </div>
        <div style="font-size:12px;color:#6b7280;margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb;">${reason(d)}</div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:540px;margin:0 auto;padding:24px 16px;">
    <div style="background:#1e3a5f;border-radius:14px;padding:20px 24px;margin-bottom:20px;">
      <div style="font-size:22px;font-weight:800;color:#ffffff;">📈 Randy's Morning Picks</div>
      <div style="font-size:13px;color:#93c5fd;margin-top:4px;">${dateStr} · Pre-market brief · US equities</div>
    </div>
    ${cards}
    <div style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;padding-top:16px;border-top:1px solid #f3f4f6;">
      Picks scored by 52W position, momentum &amp; watchlist signals.<br>
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

  console.log('Fetching stock data...');
  const allData = (await Promise.all(WATCHLIST.map(fetchStock))).filter(Boolean);
  console.log(`Got data for ${allData.length}/${WATCHLIST.length} symbols`);

  const picks = allData
    .map(d => ({ ...d, _score: score(d) }))
    .filter(d => d._score >= 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 3);

  if (!picks.length) { console.log('No picks available today'); return; }

  console.log('Top picks:', picks.map(d => d.symbol).join(', '));

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
      html: buildHtml(picks, dateStr),
    }),
  });

  const result = await emailRes.json();
  if (!emailRes.ok) { console.error('Resend error:', result); process.exit(1); }
  console.log('Email sent! ID:', result.id);
}

main().catch(e => { console.error(e); process.exit(1); });
