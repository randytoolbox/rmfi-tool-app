// Queries USASpending.gov for defense subcontract awards (Tier 2/3)
// Two-step: find top prime contracts → fetch subawards for each

const CACHE = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h

const PRIMES = {
  lockheed:  'Lockheed Martin',
  boeing:    'Boeing',
  raytheon:  'Raytheon Technologies',
  northrop:  'Northrop Grumman',
  gd:        'General Dynamics',
  l3harris:  'L3Harris Technologies',
  bae:       'BAE Systems',
};

// Known publicly-traded defense manufacturers — for ticker badges
const TICKER_MAP = {
  'TRANSDIGM':         'TDG',
  'HEICO':             'HEI',
  'MERCURY SYSTEMS':   'MRCY',
  'CURTISS-WRIGHT':    'CW',
  'MOOG':              'MOG',
  'DUCOMMUN':          'DCO',
  'KAMAN':             'KMAN',
  'TRIUMPH GROUP':     'TGI',
  'KRATOS':            'KTOS',
  'SAIC':              'SAIC',
  'LEIDOS':            'LDOS',
  'CACI':              'CACI',
  'LEONARDO DRS':      'DRS',
  'TELEDYNE':          'TDY',
  'AEROJET':           'AJRD',
  'HOWMET':            'HWM',
  'SPIRIT AEROSYSTEMS':'SPR',
  'PARSONS':           'PSN',
  'BOOZ ALLEN':        'BAH',
  'TEXTRON':           'TXT',
  'WOODWARD':          'WWD',
  'ASTRONICS':         'ATRO',
  'BWX TECHNOLOGIES':  'BWXT',
  'CUBIC':             'CUB',
  'MAXAR':             'MAXR',
  'VECTRUS':           'VEC',
  'DRS TECHNOLOGIES':  'DRS',
  'BENCHMARK ELECTRONICS': 'BHE',
  'SPARTON':           null,
};

function checkTicker(name) {
  if (!name) return null;
  const u = name.toUpperCase();
  for (const [key, ticker] of Object.entries(TICKER_MAP)) {
    if (ticker && u.includes(key)) return ticker;
  }
  return null;
}

function fmtField(obj, ...keys) {
  for (const k of keys) {
    if (obj[k] != null) return obj[k];
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { prime = 'lockheed', state = '' } = req.query;
  const primeName = PRIMES[prime] || PRIMES.lockheed;
  const cacheKey  = `sub:${prime}:${state.toUpperCase()}`;

  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    return res.json({ ...cached.data, fromCache: true });
  }

  try {
    // Step 1: Find top prime contracts where this company is the DoD recipient
    const primeBody = {
      filters: {
        award_type_codes: ['A', 'B', 'C', 'D'],
        recipient_search_text: [primeName],
        agencies: [{ type: 'awarding', tier: 'toptier', name: 'Department of Defense' }],
        time_period: [{ start_date: '2022-01-01', end_date: '2025-12-31' }],
      },
      fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Description', 'Start Date'],
      page: 1,
      limit: 5,
      sort: 'Award Amount',
      order: 'desc',
    };

    const primeResp = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(primeBody),
      signal:  AbortSignal.timeout(12000),
    });

    if (!primeResp.ok) throw new Error(`USASpending prime search: ${primeResp.status}`);
    const primeData = await primeResp.json();
    const topAwards = (primeData.results || []).slice(0, 4);

    // Step 2: For each prime award, get subawards in parallel
    const allSubs = [];

    await Promise.all(topAwards.map(async (award) => {
      const awardId = award['Award ID'];
      if (!awardId) return;

      try {
        const subBody = {
          filters: { award_id: awardId },
          page:  1,
          limit: 30,
          sort:  'subaward_amount',
          order: 'desc',
        };

        const subResp = await fetch('https://api.usaspending.gov/api/v2/subawards/', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(subBody),
          signal:  AbortSignal.timeout(10000),
        });

        if (!subResp.ok) return;
        const subData = await subResp.json();

        for (const s of (subData.results || [])) {
          // Field names vary slightly across API versions — try common variants
          const name   = fmtField(s, 'recipient_name', 'Sub-Awardee Name', 'awardee_name');
          const amount = fmtField(s, 'subaward_amount', 'Sub-Award Amount', 'amount');
          const date   = fmtField(s, 'subaward_action_date', 'Sub-Award Date', 'action_date');
          const naics  = fmtField(s, 'naics_code', 'NAICS Code');
          const naicsD = fmtField(s, 'naics_description', 'NAICS Description');

          const perf   = s.place_of_performance || s.recipient_location || {};
          const stCode = fmtField(perf, 'state_code', 'State Code') ||
                         fmtField(s, 'recipient_location_state_code', 'Place of Performance State Code');
          const city   = fmtField(perf, 'city_name', 'City Name') ||
                         fmtField(s, 'recipient_location_city_name', 'Place of Performance City Name');

          if (!name) continue;

          allSubs.push({
            name,
            amount:    amount ? Number(amount) : null,
            date:      date || '',
            prime:     award['Recipient Name'] || primeName,
            state:     stCode || '',
            city:      city || '',
            naics:     naics || '',
            naicsDesc: naicsD || '',
            ticker:    checkTicker(name),
          });
        }
      } catch (_) {
        // skip awards that time out — don't fail the whole request
      }
    }));

    // State filter (applied server-side if requested)
    const stateFilter = state.trim().toUpperCase();
    let results = stateFilter
      ? allSubs.filter(s => (s.state || '').toUpperCase() === stateFilter)
      : allSubs;

    // De-dupe by name + amount
    const seen = new Set();
    results = results.filter(s => {
      const key = `${s.name}|${s.amount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    results.sort((a, b) => (b.amount || 0) - (a.amount || 0));

    const payload = { results, prime: primeName, total: results.length };
    CACHE.set(cacheKey, { data: payload, ts: Date.now() });

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    return res.json(payload);

  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
