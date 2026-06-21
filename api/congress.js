// Congressional trading via targeted news searches for known active traders
// Avoids the S3 bulk-file timeout problem entirely

const ACTIVE_TRADERS = [
  // Senate — most active traders
  'Tommy Tuberville', 'Shelley Moore Capito', 'Mark Kelly', 'Gary Peters',
  'Jon Ossoff', 'John Hoeven', 'Roger Marshall', 'Markwayne Mullin',
  'Rick Scott', 'Bill Hagerty', 'Dan Sullivan', 'Mike Braun',
  'Tom Carper', 'Bob Casey', 'Jacky Rosen', 'Kyrsten Sinema',
  // House — most active traders
  'Nancy Pelosi', 'Paul Pelosi', 'Dan Crenshaw', 'Michael McCaul',
  'David Rouzer', 'Brian Mast', 'Josh Gottheimer', 'Ro Khanna',
  'Mark Takano', 'Michael Garcia', 'Pete Sessions', 'Greg Gianforte',
  'Virginia Foxx', 'Bill Johnson', 'Marjorie Taylor Greene', 'Matt Gaetz',
  'Debbie Wasserman Schultz', 'Susie Lee', 'Lois Frankel', 'Patrick McHenry',
];

// News queries that reliably surface named trades
const QUERIES = [
  'senator representative purchased bought stock shares STOCK Act disclosure 2026',
  'congress member stock trade disclosure filed SEC STOCK Act buy purchase 2026',
  'Pelosi Tuberville Crenshaw stock purchase trade disclosure 2026',
  'senator bought stock options shares disclosure investment 2026',
  'house representative stock purchase STOCK Act filing 2026',
];

const ALIAS = { BRK: 'BRK.B', GOOG: 'GOOGL', FB: 'META' };
const SKIP  = new Set(['N/A', '--', 'NA', 'NONE', 'ETF', 'CASH']);

// Common ticker pattern in headlines: $NVDA, (NVDA), NVDA stock
const TICKER_RE = /\$([A-Z]{1,5})\b|\(([A-Z]{2,5})\)|([A-Z]{2,5})\s+(?:stock|shares|options|call|put)/g;
const BUY_RE    = /\b(bought|purchased|buy|buys|buying|invested|investment|acquired|long)\b/i;
const SELL_RE   = /\b(sold|sale|selling|sells|short)\b/i;

function extractTickers(text) {
  const tickers = new Set();
  let m;
  TICKER_RE.lastIndex = 0;
  while ((m = TICKER_RE.exec(text)) !== null) {
    const raw = (m[1] || m[2] || m[3] || '').toUpperCase();
    if (raw && raw.length >= 2 && raw.length <= 5) {
      tickers.add(ALIAS[raw] || raw);
    }
  }
  return [...tickers];
}

function matchMember(text) {
  for (const name of ACTIVE_TRADERS) {
    const parts = name.split(' ');
    // Match on last name at minimum
    const last = parts[parts.length - 1];
    if (text.includes(name) || (last.length > 4 && text.includes(last))) {
      return name;
    }
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');

  const trades = [];
  const seen   = new Set();

  // Run news queries in parallel (3 at a time)
  const chunks = [QUERIES.slice(0, 3), QUERIES.slice(3)];
  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(q =>
        fetch(`${getBase(req)}/api/news?q=${encodeURIComponent(q)}`, {
          signal: AbortSignal.timeout(8000),
        }).then(r => r.ok ? r.json() : { items: [] })
      )
    );

    results.forEach(r => {
      if (r.status !== 'fulfilled') return;
      const items = r.value?.items || [];
      items.forEach(item => {
        const text = (item.title || '') + ' ' + (item.source || '');
        if (!BUY_RE.test(text)) return;              // only purchases
        if (SELL_RE.test(text) && !BUY_RE.test(text)) return;

        const member  = matchMember(text);
        const tickers = extractTickers(text);
        if (!member && !tickers.length) return;

        const key = item.link || item.title;
        if (seen.has(key)) return;
        seen.add(key);

        // One trade entry per ticker found, or a generic entry if only name matched
        const tickerList = tickers.length ? tickers : ['?'];
        tickerList.forEach(sym => {
          if (SKIP.has(sym)) return;
          trades.push({
            sym,
            date:    item.pubDate || '',
            ts:      item.pubDate ? new Date(item.pubDate).getTime() || Date.now() : Date.now(),
            name:    member || 'Congress Member',
            chamber: 'Congress',
            type:    'purchase',
            amt:     '',
            desc:    item.title || '',
            link:    item.link  || '',
            source:  item.source || '',
          });
        });
      });
    });
  }

  trades.sort((a, b) => b.ts - a.ts);
  res.json({ trades: trades.slice(0, 200), count: trades.length, source: 'news' });
};

function getBase(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers['x-forwarded-host'] || req.headers.host || '';
  return `${proto}://${host}`;
}
