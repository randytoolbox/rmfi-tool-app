const HOUSE_URL  = 'https://house-stock-watcher-data.s3-us-east-2.amazonaws.com/data/all_transactions.json';
const SENATE_URL = 'https://senate-stock-watcher-data.s3-us-east-2.amazonaws.com/aggregate/all_transactions.json';
const QUIVER_URL = 'https://api.quiverquant.com/beta/bulk/congresstrading';

const ALIAS = { BRK: 'BRK.B', GOOG: 'GOOGL', FB: 'META' };
const SKIP  = new Set(['N/A', '--', 'NA', 'NONE', 'ETF', 'CASH']);

function normSym(s) {
  const clean = (s || '').replace(/[$\s]/g, '').toUpperCase();
  return ALIAS[clean] || clean;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');

  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  let trades = [];

  // ── Try Quiver Quantitative first (fast, lightweight) ──────────────────────
  try {
    const r = await fetch(QUIVER_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; randy-money/1.0)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (r.ok) {
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length) {
        rows.forEach(t => {
          const dateStr = t.Date || t.date || t.transaction_date || '';
          const d = new Date(dateStr);
          if (isNaN(d.getTime()) || d.getTime() < cutoff) return;
          const sym = normSym(t.Ticker || t.ticker || t.symbol || '');
          if (!sym || sym.length > 5 || SKIP.has(sym)) return;
          const name = (t.Representative || t.Senator || t.representative || t.senator || t.name || '').trim();
          if (!name) return;
          const type = (t.Transaction || t.type || t.transaction_type || '').toLowerCase();
          trades.push({
            sym, date: dateStr, ts: d.getTime(), name,
            chamber: t.Chamber || t.chamber || 'Congress',
            type, amt: t.Range || t.amount || '', desc: t.asset_description || '',
          });
        });
      }
    }
  } catch (e) { /* fall through to S3 */ }

  // ── Fall back to House + Senate S3 if Quiver returned nothing ─────────────
  if (!trades.length) {
    for (const [url, chamber] of [[HOUSE_URL, 'House'], [SENATE_URL, 'Senate']]) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; randy-money/1.0)' },
          signal: AbortSignal.timeout(20000),
        });
        if (!r.ok) continue;
        const rows = await r.json();
        const arr = Array.isArray(rows) ? rows : (rows.data || rows.transactions || []);
        arr.forEach(t => {
          const dateStr = t.transaction_date || t.transactionDate || t.date || '';
          const d = new Date(dateStr);
          if (isNaN(d.getTime()) || d.getTime() < cutoff) return;
          const sym = normSym(t.ticker || t.symbol || '');
          if (!sym || sym.length > 5 || SKIP.has(sym)) return;
          const name = (t.representative || t.senator || t.name || '').trim();
          if (!name) return;
          trades.push({
            sym, date: dateStr, ts: d.getTime(), name, chamber,
            type: (t.type || t.transaction_type || '').toLowerCase(),
            amt: t.amount || '', desc: t.asset_description || '',
          });
        });
      } catch (e) { /* continue */ }
    }
  }

  trades.sort((a, b) => b.ts - a.ts);
  res.json({ trades: trades.slice(0, 300), source: trades.length ? 'ok' : 'empty' });
};
