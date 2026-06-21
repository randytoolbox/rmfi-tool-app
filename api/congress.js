// Congressional trading data — tries multiple sources in order of reliability
const SOURCES = [
  // Unusual Whales — lightweight paginated API, no auth needed for recent trades
  {
    name: 'UnusualWhales',
    fetch: () => fetchUnusualWhales(),
  },
  // Senate eFD search index — official Senate API, returns filing metadata
  {
    name: 'SenateEFD',
    fetch: () => fetchSenateEFD(),
  },
];

const ALIAS = { BRK: 'BRK.B', GOOG: 'GOOGL', FB: 'META' };
const SKIP  = new Set(['N/A', '--', 'NA', 'NONE', 'ETF', 'CASH', 'SP500', 'UNKNOWN']);

function normSym(s) {
  const clean = (s || '').replace(/[$\s]/g, '').toUpperCase();
  return ALIAS[clean] || clean;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');

  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  let trades  = [];
  let source  = 'none';

  for (const s of SOURCES) {
    try {
      const raw = await s.fetch();
      if (raw && raw.length) {
        trades = raw.filter(t => t.ts >= cutoff);
        source = s.name;
        break;
      }
    } catch (e) { /* try next */ }
  }

  trades.sort((a, b) => b.ts - a.ts);
  res.json({ trades: trades.slice(0, 400), count: trades.length, source });
};

// ── Unusual Whales ────────────────────────────────────────────────────────────
async function fetchUnusualWhales() {
  const url = 'https://api.unusualwhales.com/api/congress/trades?limit=200&trade_type=buy';
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; randy-money/1.0)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`UW HTTP ${r.status}`);
  const json = await r.json();
  const rows = json.data || json.trades || json || [];
  if (!Array.isArray(rows) || !rows.length) throw new Error('UW empty');

  return rows.map(t => {
    const dateStr = t.traded_at || t.date || t.transaction_date || '';
    const d = new Date(dateStr);
    const sym = normSym(t.ticker || t.symbol || '');
    if (!sym || sym.length > 5 || SKIP.has(sym)) return null;
    const name = (t.politician_name || t.representative || t.senator || t.name || '').trim();
    if (!name) return null;
    return {
      sym, date: dateStr, ts: isNaN(d.getTime()) ? 0 : d.getTime(),
      name, chamber: t.chamber || t.politician_type || 'Congress',
      type: (t.transaction_type || t.type || 'purchase').toLowerCase(),
      amt: t.amount || t.range || '',
      desc: t.asset_name || t.asset_description || '',
    };
  }).filter(Boolean);
}

// ── Senate eFD search index ───────────────────────────────────────────────────
async function fetchSenateEFD() {
  const from = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to   = new Date().toISOString().slice(0, 10);
  const url  = `https://efts.senate.gov/LATEST/search-index?q=%22%22&dateRange=custom&fromDate=${from}&toDate=${to}&category=ptr`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; randy-money/1.0)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`EFD HTTP ${r.status}`);
  const json = await r.json();
  const hits = json.hits?.hits || json.hits || [];
  if (!hits.length) throw new Error('EFD empty');

  // Senate eFD returns filing metadata, not individual trades — extract what we can
  const out = [];
  hits.forEach(h => {
    const src = h._source || h;
    const name = (src.first_name && src.last_name)
      ? `${src.first_name} ${src.last_name}`
      : (src.full_name || src.name || '').trim();
    if (!name) return;
    const dateStr = src.filed_at_date || src.date || '';
    const d = new Date(dateStr);
    // Filing-level entry (no individual ticker) — mark as generic signal
    out.push({
      sym: 'PTR', date: dateStr, ts: isNaN(d.getTime()) ? Date.now() : d.getTime(),
      name, chamber: 'Senate',
      type: 'purchase', amt: '', desc: 'Periodic Transaction Report filed',
    });
  });
  if (!out.length) throw new Error('EFD no names');
  return out;
}
