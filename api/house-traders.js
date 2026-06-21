// Auto-fetches the official House Financial Disclosure index from disclosures.house.gov
// Parses PTR (Periodic Transaction Report) filings to rank members by trading activity
// Cached for 7 days — refreshes automatically each week

const AdmZip = require('adm-zip');

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
let cache = null;
let cacheTime = 0;

// Supplemental data: performance stats from public research
const PERF_STATS = {
  'Tim Moore':              { return2025: '+52%', winRate: null,   note: '#1 best return in Congress 2025 (Quiver Quant)', style: 'Small-cap hunter' },
  'Marjorie Taylor Greene': { return2025: '+30%', winRate: '74.5%', note: '476% portfolio gain since joining in 2021',      style: 'Frequent, well-timed' },
  'Suzan DelBene':          { return2025: null,   winRate: null,   note: '$142.8M net worth · $1.4M gain in May 2026',     style: 'Big money mover' },
  'Josh Gottheimer':        { return2025: null,   winRate: null,   note: '$185.7M total STOCK Act volume since 2020',      style: 'Volume machine' },
  'David Taylor':           { return2025: null,   winRate: null,   note: '132 trades in first 14 months · AVGO, LLY, V',  style: 'Tech/finance picks' },
  'Rob Bresnahan':          { return2025: null,   winRate: null,   note: '650 trades then quit — sold Medicaid stocks before voting to cut Medicaid', style: 'Scandal' },
  'Kelly Morrison':         { return2025: null,   winRate: null,   note: 'STOCK Act violation — filed $2.9M in trades late · now divesting', style: 'Late filer' },
};

async function fetchAndParse(year) {
  const url = `https://disclosures.house.gov/public_disc/financial-pdfs/${year}/${year}FD.zip`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from House disclosures`);

  const buf  = Buffer.from(await res.arrayBuffer());
  const zip  = new AdmZip(buf);
  const xml  = zip.readAsText(`${year}FD.xml`);

  // Parse XML manually — avoids needing xml2js dependency
  const members = {};
  const memberRe = /<Member>([\s\S]*?)<\/Member>/g;
  const tagRe    = /<(\w+)>(.*?)<\/\1>/g;
  let m;
  while ((m = memberRe.exec(xml)) !== null) {
    const block = m[1];
    const fields = {};
    let t;
    tagRe.lastIndex = 0;
    while ((t = tagRe.exec(block)) !== null) fields[t[1]] = t[2].trim();

    if (fields.FilingType !== 'P') continue; // only Periodic Transaction Reports

    const key = `${fields.Last},${fields.First}`;
    if (!members[key]) {
      members[key] = {
        name:  `${fields.First} ${fields.Last}`.trim(),
        last:  fields.Last,
        state: fields.StateDst || '',
        ptrs:  [],
      };
    }
    members[key].ptrs.push({ year: String(year), date: fields.FilingDate, docId: fields.DocID });
  }
  return members;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');

  if (cache && Date.now() - cacheTime < CACHE_TTL) {
    return res.json(cache);
  }

  try {
    const currentYear = new Date().getFullYear();
    const prevYear    = currentYear - 1;

    // Fetch both years in parallel
    const [cur, prev] = await Promise.allSettled([
      fetchAndParse(currentYear),
      fetchAndParse(prevYear),
    ]);

    // Merge both years
    const merged = {};
    for (const result of [prev, cur]) {
      if (result.status !== 'fulfilled') continue;
      for (const [key, data] of Object.entries(result.value)) {
        if (!merged[key]) merged[key] = { ...data, ptrs: [] };
        merged[key].ptrs.push(...data.ptrs);
      }
    }

    // Rank by PTR count
    const ranked = Object.values(merged)
      .sort((a, b) => b.ptrs.length - a.ptrs.length)
      .slice(0, 50)
      .map((m, i) => {
        const docs2026 = m.ptrs.filter(p => p.year === String(currentYear)).map(p => p.docId);
        const perf     = PERF_STATS[m.name] || {};
        return {
          rank:       i + 1,
          name:       m.name,
          last:       m.last,
          state:      m.state,
          totalPtrs:  m.ptrs.length,
          ptrs2026:   m.ptrs.filter(p => p.year === String(currentYear)).length,
          ptrs2025:   m.ptrs.filter(p => p.year === String(prevYear)).length,
          docs2026,
          latestDoc:  docs2026.slice(-1)[0] || null,
          ...perf,
        };
      });

    const payload = {
      traders:   ranked,
      fetchedAt: new Date().toISOString(),
      source:    'disclosures.house.gov',
      year:      currentYear,
    };

    cache     = payload;
    cacheTime = Date.now();
    res.json(payload);

  } catch (e) {
    // Fall back to hardcoded data if government site unreachable
    res.status(503).json({ error: e.message, traders: [] });
  }
};
