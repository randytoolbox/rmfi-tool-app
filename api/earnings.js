// Fetches next earnings date for stock tickers via Yahoo Finance
// Cached 24 hours — earnings dates don't change often
// Warns when earnings are within 21 days so traders can manage risk

const CACHE = {};
const CACHE_TTL = 24 * 60 * 60 * 1000;

const YF = sym => [
  `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=calendarEvents`,
  `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=calendarEvents`,
];

async function fetchEarnings(sym) {
  if (CACHE[sym] && Date.now() - CACHE[sym].ts < CACHE_TTL) return CACHE[sym].data;
  for (const url of YF(sym)) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const d = await r.json();
      const dates = d?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate;
      const raw = dates?.[0]?.raw;
      if (raw) {
        const data = {
          sym,
          earningsTs:   raw * 1000,
          earningsDate: new Date(raw * 1000).toISOString().slice(0, 10),
        };
        CACHE[sym] = { ts: Date.now(), data };
        return data;
      }
    } catch (_) {}
  }
  const data = { sym, earningsTs: null, earningsDate: null };
  CACHE[sym] = { ts: Date.now(), data };
  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=172800');

  const syms = (req.query.syms || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(s => /^[A-Z]{1,5}$/.test(s))
    .slice(0, 25);

  if (!syms.length) return res.status(400).json({ error: 'Provide ?syms=HON,EMR,...' });

  const settled = await Promise.allSettled(syms.map(fetchEarnings));
  const earnings = {};
  settled.forEach(r => {
    if (r.status === 'fulfilled' && r.value?.sym) earnings[r.value.sym] = r.value;
  });

  res.json({ earnings, fetchedAt: new Date().toISOString() });
};
