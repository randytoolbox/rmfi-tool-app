const HOUSE_URL  = 'https://house-stock-watcher-data.s3-us-east-2.amazonaws.com/data/all_transactions.json';
const SENATE_URL = 'https://senate-stock-watcher-data.s3-us-east-2.amazonaws.com/aggregate/all_transactions.json';

const ALIAS = { BRK: 'BRK.B', GOOG: 'GOOGL', FB: 'META' };
const SKIP  = new Set(['N/A', '--', 'NA', 'NONE', 'ETF', 'CASH', 'SP500']);

function normSym(s) {
  const clean = (s || '').replace(/[$\s]/g, '').toUpperCase();
  return ALIAS[clean] || clean;
}

// Parse a date string safely
function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');

  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  let trades = [];

  // ── Fetch House + Senate in parallel ──────────────────────────────────────
  const results = await Promise.allSettled([
    fetchSource(HOUSE_URL,  'House',  cutoff),
    fetchSource(SENATE_URL, 'Senate', cutoff),
  ]);

  results.forEach(r => { if (r.status === 'fulfilled') trades = trades.concat(r.value); });

  trades.sort((a, b) => b.ts - a.ts);
  res.json({ trades: trades.slice(0, 300), count: trades.length });
};

async function fetchSource(url, chamber, cutoff) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; randy-money/1.0)' },
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);

  const raw  = await r.json();
  const rows = Array.isArray(raw) ? raw : (raw.data || raw.transactions || []);
  const out  = [];

  for (const t of rows) {
    const dateStr = t.transaction_date || t.transactionDate || t.date || '';
    const d = parseDate(dateStr);
    if (!d || d.getTime() < cutoff) continue;

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
