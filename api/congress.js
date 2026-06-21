const SENATE_URL = 'https://senate-stock-watcher-data.s3-us-east-2.amazonaws.com/aggregate/all_transactions.json';
const HOUSE_URL  = 'https://house-stock-watcher-data.s3-us-east-2.amazonaws.com/data/all_transactions.json';

const ALIAS = { BRK: 'BRK.B', GOOG: 'GOOGL', FB: 'META' };
const SKIP  = new Set(['N/A', '--', 'NA', 'NONE', 'ETF', 'CASH', 'SP500', 'N/A']);

function normSym(s) {
  const clean = (s || '').replace(/[$\s]/g, '').toUpperCase();
  return ALIAS[clean] || clean;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');

  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  let trades  = [];
  let sources = [];

  // Try Senate first — 100 members, smaller file, higher signal
  try {
    const senate = await fetchSource(SENATE_URL, 'Senate', cutoff, 18000);
    if (senate.length) { trades = trades.concat(senate); sources.push('Senate'); }
  } catch (e) { /* silent */ }

  // Try House — 435 members, larger file, attempt with remaining budget
  try {
    const house = await fetchSource(HOUSE_URL, 'House', cutoff, 22000);
    if (house.length) { trades = trades.concat(house); sources.push('House'); }
  } catch (e) { /* silent */ }

  trades.sort((a, b) => b.ts - a.ts);
  res.json({
    trades: trades.slice(0, 400),
    count:  trades.length,
    sources,
  });
};

async function fetchSource(url, chamber, cutoff, timeoutMs) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; randy-money/1.0)' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);

  const raw  = await r.json();
  const rows = Array.isArray(raw) ? raw : (raw.data || raw.transactions || []);
  const out  = [];

  for (const t of rows) {
    const dateStr = t.transaction_date || t.transactionDate || t.date || '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime()) || d.getTime() < cutoff) continue;

    const sym = normSym(t.ticker || t.symbol || '');
    if (!sym || sym.length > 5 || SKIP.has(sym)) continue;

    const name = (t.representative || t.senator || t.name || '').trim();
    if (!name) continue;

    out.push({
      sym,
      date:    dateStr,
      ts:      d.getTime(),
      name,
      chamber,
      type:    (t.type || t.transaction_type || '').toLowerCase(),
      amt:     t.amount || '',
      desc:    t.asset_description || '',
    });
  }
  return out;
}
