const HOUSE_URL  = 'https://house-stock-watcher-data.s3-us-east-2.amazonaws.com/data/all_transactions.json';
const SENATE_URL = 'https://senate-stock-watcher-data.s3-us-east-2.amazonaws.com/aggregate/all_transactions.json';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');

  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const SKIP = new Set(['N/A', '--', 'NA', 'NONE', 'ETF']);
  const ALIAS = { BRK: 'BRK.B', GOOG: 'GOOGL', FB: 'META' };
  const allTrades = [];

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

        let sym = (t.ticker || t.symbol || '').replace(/[$\s]/g, '').toUpperCase();
        if (!sym || SKIP.has(sym) || sym.length > 5) return;
        sym = ALIAS[sym] || sym;

        const name = (t.representative || t.senator || t.name || '').trim();
        if (!name) return;

        allTrades.push({
          sym,
          date: dateStr,
          ts: d.getTime(),
          name,
          chamber,
          type: (t.type || t.transaction_type || '').toLowerCase(),
          amt:  t.amount || '',
          desc: t.asset_description || '',
        });
      });
    } catch (e) {
      // continue with whatever we got from the other chamber
    }
  }

  allTrades.sort((a, b) => b.ts - a.ts);

  res.json({ trades: allTrades.slice(0, 300) });
};
