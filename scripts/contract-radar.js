#!/usr/bin/env node
// Government contract radar — fetches recent federal contract awards for
// watchlist companies and their downstream suppliers from USASpending.gov.
// Run daily before market open to identify catalyst-driven buy opportunities.
// Run: node scripts/contract-radar.js [YYYY-MM-DD]   (default: last 7 days)

const USASPENDING = 'https://api.usaspending.gov/api/v2';
const MIN_AWARD   = 10_000_000; // $10M minimum

// Maps ticker → how the company appears in USASpending recipient names
const RECIPIENT_MAP = {
  'IBM':   ['INTERNATIONAL BUSINESS MACHINES'],
  'MSFT':  ['MICROSOFT CORPORATION'],
  'AMZN':  ['AMAZON.COM SERVICES', 'AMAZON WEB SERVICES'],
  'GOOGL': ['GOOGLE LLC'],
  'META':  ['META PLATFORMS'],
  'NVDA':  ['NVIDIA CORPORATION'],
  'AAPL':  ['APPLE INC'],
  'TSLA':  ['TESLA INC'],
  'AMD':   ['ADVANCED MICRO DEVICES'],
  'AVGO':  ['BROADCOM'],
  'DELL':  ['DELL FEDERAL SYSTEMS', 'DELL MARKETING'],
  'CRWD':  ['CROWDSTRIKE'],
  'PLTR':  ['PALANTIR TECHNOLOGIES'],
  'LMT':   ['LOCKHEED MARTIN'],
  'RTX':   ['RTX CORPORATION', 'RAYTHEON'],
  'CAT':   ['CATERPILLAR'],
  'FLEX':  ['FLEX LTD', 'FLEXTRONICS'],
  'MTSI':  ['MACOM TECHNOLOGY'],
  'OXY':   ['OCCIDENTAL PETROLEUM'],
  'CVX':   ['CHEVRON'],
  'HAL':   ['HALLIBURTON'],
  'MRO':   ['MARATHON OIL'],
  'WMB':   ['WILLIAMS COMPANIES'],
  'PYPL':  ['PAYPAL'],
};

// Maps prime contractor ticker → downstream supplier tickers that benefit
const DOWNSTREAM_MAP = {
  'IBM':   ['DELL', 'NVDA', 'CRWD'],
  'MSFT':  ['NVDA', 'DELL', 'AVGO'],
  'AMZN':  ['NVDA', 'DELL', 'AVGO'],
  'GOOGL': ['NVDA', 'DELL'],
  'LMT':   ['RTX', 'CAT', 'AVGO', 'MTSI'],
  'RTX':   ['LMT', 'AVGO', 'MTSI', 'FLEX'],
  'PLTR':  ['IBM', 'DELL', 'CRWD'],
  'CAT':   ['OXY', 'HAL', 'WMB'],
  'CVX':   ['HAL', 'MRO', 'OXY'],
  'OXY':   ['HAL', 'WMB', 'MRO'],
};

async function searchAwards(recipientName, startDate, endDate) {
  const body = {
    filters: {
      award_type_codes: ['A', 'B', 'C', 'D'],
      time_period: [{ start_date: startDate, end_date: endDate }],
      recipient_search_text: [recipientName],
      award_amounts: { lower_bound: MIN_AWARD },
    },
    fields: ['Recipient Name', 'Award Amount', 'Action Date', 'Awarding Agency Name', 'Description'],
    sort: 'Award Amount',
    order: 'desc',
    limit: 25,
    page: 1,
  };
  try {
    const r = await fetch(`${USASPENDING}/search/spending_by_award/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return [];
    const data = await r.json();
    return data.results || [];
  } catch {
    return [];
  }
}

async function main() {
  const endDate   = process.argv[2] || new Date().toISOString().slice(0, 10);
  const d         = new Date(endDate);
  d.setDate(d.getDate() - 7);
  const startDate = d.toISOString().slice(0, 10);

  console.log(`\nContract Radar: ${startDate} → ${endDate}`);
  console.log('Querying USASpending.gov (federal contracts $10M+)...\n');

  const signals   = {}; // sym → [{ date, amount, agency, description, via }]
  const processed = new Set();

  for (const [sym, names] of Object.entries(RECIPIENT_MAP)) {
    for (const name of names) {
      const key = `${sym}:${name}`;
      if (processed.has(key)) continue;
      processed.add(key);

      const awards = await searchAwards(name, startDate, endDate);
      for (const award of awards) {
        if (!signals[sym]) signals[sym] = [];
        signals[sym].push({
          date:        award['Action Date'],
          amount:      award['Award Amount'],
          agency:      award['Awarding Agency Name'],
          description: award['Description'],
          via:         'direct',
        });

        // Flag downstream beneficiaries
        for (const ds of (DOWNSTREAM_MAP[sym] || [])) {
          if (!signals[ds]) signals[ds] = [];
          signals[ds].push({
            date:        award['Action Date'],
            amount:      award['Award Amount'],
            agency:      award['Awarding Agency Name'],
            description: `Downstream from ${sym}: ${award['Description']}`,
            via:         `downstream-${sym}`,
          });
        }
      }
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // Print results
  const symsWithSignals = Object.keys(signals).filter(s => signals[s].length > 0);
  if (symsWithSignals.length === 0) {
    console.log('No contract signals found in this window.\n');
    return;
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  CONTRACT SIGNALS DETECTED');
  console.log('═══════════════════════════════════════════════════════');

  const directHits     = symsWithSignals.filter(s => signals[s].some(a => a.via === 'direct'));
  const downstreamOnly = symsWithSignals.filter(s => !signals[s].some(a => a.via === 'direct'));

  if (directHits.length) {
    console.log('\n  DIRECT AWARDS:');
    for (const sym of directHits) {
      const awards = signals[sym].filter(a => a.via === 'direct');
      const total  = awards.reduce((s, a) => s + (a.amount || 0), 0);
      console.log(`\n  ${sym.padEnd(6)} ${awards.length} award(s)  total: $${(total/1e6).toFixed(0)}M`);
      for (const a of awards.slice(0, 3)) {
        const amt = a.amount ? `$${(a.amount/1e6).toFixed(0)}M` : 'undisclosed';
        console.log(`    ${a.date}  ${amt}  ${a.agency}`);
        if (a.description) console.log(`    → ${(a.description || '').slice(0, 80)}`);
      }
    }
  }

  if (downstreamOnly.length) {
    console.log('\n  DOWNSTREAM BENEFICIARIES:');
    for (const sym of downstreamOnly) {
      const sources = [...new Set(signals[sym].map(a => a.via.replace('downstream-', '')))];
      console.log(`  ${sym.padEnd(6)} benefits from ${sources.join(', ')} contracts`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  BUY CANDIDATES (elevated priority tomorrow):');
  for (const sym of symsWithSignals) {
    const isDirect = signals[sym].some(a => a.via === 'direct');
    const boost    = isDirect ? '+15 score boost' : '+8 score boost';
    console.log(`  ${sym.padEnd(6)} ${boost}`);
  }
  console.log('═══════════════════════════════════════════════════════\n');

  // Machine-readable output for alpaca-buy.js integration
  const output = {};
  for (const sym of symsWithSignals) {
    const isDirect  = signals[sym].some(a => a.via === 'direct');
    output[sym] = { boost: isDirect ? 15 : 8, signals: signals[sym] };
  }
  process.stdout.write('\nJSON_SIGNALS:' + JSON.stringify(output) + '\n');
}

main().catch(e => { console.error(e); process.exit(1); });
