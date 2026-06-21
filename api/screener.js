// Swing Trade Screener
// Fetches 2-year weekly history for each ticker, scores for swing-trade suitability
// All data from Yahoo Finance (2 URL fallbacks) — no third-party dependency
// Server-side cache: 6 hours per symbol

const SYM_CACHE = {};
const CACHE_TTL = 6 * 60 * 60 * 1000;

const YF_URLS = sym => [
  `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=2y&interval=1wk`,
  `https://query2.finance.yahoo.com/v8/finance/chart/${sym}?range=2y&interval=1wk`,
];

async function fetchHistory(sym) {
  if (SYM_CACHE[sym] && Date.now() - SYM_CACHE[sym].ts < CACHE_TTL) {
    return SYM_CACHE[sym].data;
  }
  for (const url of YF_URLS(sym)) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;
      const tss    = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const data   = tss
        .map((ts, i) => ({ ts: ts * 1000, close: closes[i] }))
        .filter(p => p.close != null && p.close > 0 && isFinite(p.close));
      if (data.length < 20) continue;
      SYM_CACHE[sym] = { ts: Date.now(), data };
      return data;
    } catch (_) {}
  }
  return null;
}

function calcMetrics(sym, history) {
  if (!history || history.length < 20) return null;

  // Weekly % changes (absolute = volatility, signed = direction)
  const changes = [];
  for (let i = 1; i < history.length; i++) {
    const pct = (history[i].close - history[i-1].close) / history[i-1].close * 100;
    if (isFinite(pct)) changes.push(pct);
  }
  if (changes.length < 12) return null;

  const avgAbsMove = changes.reduce((s, c) => s + Math.abs(c), 0) / changes.length;

  // 52-week window
  const yr = history.slice(-52);
  const low52  = Math.min(...yr.map(p => p.close));
  const high52 = Math.max(...yr.map(p => p.close));
  const current = history[history.length - 1].close;

  // 20-week moving average (trend filter)
  const ma20 = history.slice(-20).reduce((s, p) => s + p.close, 0) / 20;
  const aboveMa20 = current > ma20;
  const distFromMa = (current - ma20) / ma20 * 100;

  // 10-week moving average (short-term momentum)
  const ma10 = history.slice(-10).reduce((s, p) => s + p.close, 0) / 10;

  // Momentum: compare last 8 weeks to prior 8 weeks
  const recent = changes.slice(-8);
  const prior  = changes.slice(-16, -8);
  const recentAvg = recent.reduce((s, c) => s + c, 0) / recent.length;
  const priorAvg  = prior.length  ? prior.reduce((s, c) => s + c, 0) / prior.length : 0;
  const momentum  = recentAvg - priorAvg;

  // How far off 52-week low (overextension check)
  const gainFrom52Low  = low52  > 0 ? (current - low52)  / low52  * 100 : 0;
  const distFrom52High = high52 > 0 ? (high52 - current) / high52 * 100 : 0;

  // 1-year return
  const yearReturn = yr.length >= 2 ? (current - yr[0].close) / yr[0].close * 100 : 0;

  // Win rate: weeks that closed positive
  const winRate = changes.filter(c => c > 0).length / changes.length * 100;

  // ── Swing Score (0–100) ─────────────────────────────────────────────────
  let score = 50;

  // Volatility sweet spot: 2–5% avg weekly move
  if      (avgAbsMove >= 2   && avgAbsMove <= 4)   score += 22;
  else if (avgAbsMove >= 1.5 && avgAbsMove <= 6)   score += 12;
  else if (avgAbsMove < 1)                          score -= 20; // too quiet
  else if (avgAbsMove > 10)                         score -= 15; // too chaotic

  // Trend: reward being above both MAs
  if (aboveMa20 && current > ma10) score += 18;
  else if (aboveMa20)              score += 8;
  else                             score -= 12;

  // Momentum direction
  if      (momentum > 1)  score += 10;
  else if (momentum > 0)  score += 5;
  else if (momentum < -2) score -= 10;
  else                    score -= 3;

  // Overextension penalty — BE up 1628% is not a good swing entry
  if      (gainFrom52Low > 500) score -= 30;
  else if (gainFrom52Low > 300) score -= 15;
  else if (gainFrom52Low > 150) score -= 5;

  // Reward some room to run (not pinned at 52-week high)
  if      (distFrom52High > 15) score += 5;
  else if (distFrom52High > 5)  score += 8;
  else                          score -= 5; // at the top

  // Win rate bonus
  if (winRate > 55) score += 5;

  score = Math.max(0, Math.min(100, Math.round(score)));

  const grade =
    score >= 78 ? 'A' :
    score >= 62 ? 'B' :
    score >= 46 ? 'C' : 'D';

  const gradeColor =
    grade === 'A' ? '#00c853' :
    grade === 'B' ? '#aeea00' :
    grade === 'C' ? '#f9a825' : '#ff5252';

  const trend =
    aboveMa20 && current > ma10 ? 'Strong Up' :
    aboveMa20                   ? 'Up'         :
                                  'Down';

  return {
    sym,
    score,
    grade,
    gradeColor,
    trend,
    current:      +current.toFixed(2),
    avgMove:      +avgAbsMove.toFixed(1),
    yearReturn:   +yearReturn.toFixed(1),
    gainFrom52Low:+gainFrom52Low.toFixed(0),
    distFrom52High:+distFrom52High.toFixed(0),
    aboveMa20,
    momentum:     +momentum.toFixed(2),
    distFromMa:   +distFromMa.toFixed(1),
    low52:        +low52.toFixed(2),
    high52:       +high52.toFixed(2),
    winRate:      +winRate.toFixed(0),
    weeks:        changes.length,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=43200');

  const raw  = (req.query.syms || '').split(',');
  const syms = [...new Set(
    raw.map(s => s.trim().toUpperCase()).filter(s => /^[A-Z]{1,5}$/.test(s))
  )].slice(0, 80);

  if (!syms.length) return res.status(400).json({ error: 'Provide ?syms=NVDA,PLTR,...' });

  const results = [];
  const BATCH   = 5;
  for (let i = 0; i < syms.length; i += BATCH) {
    const batch = syms.slice(i, i + BATCH);
    const done  = await Promise.allSettled(batch.map(async sym => {
      const hist = await fetchHistory(sym);
      return calcMetrics(sym, hist);
    }));
    done.forEach(r => { if (r.status === 'fulfilled' && r.value) results.push(r.value); });
    if (i + BATCH < syms.length) await new Promise(r => setTimeout(r, 350));
  }

  results.sort((a, b) => b.score - a.score);
  res.json({ results, total: results.length, screened: syms.length, cachedAt: new Date().toISOString() });
};
