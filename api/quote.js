const UA = 'Mozilla/5.0 (compatible; randy-money/1.0)';

module.exports = async function handler(req, res) {
  const { syms } = req.query;
  if (!syms) return res.status(400).json({ error: 'syms required' });

  const symbols = syms.split(',').map(s => s.trim()).filter(Boolean);

  // Use v8 chart API per-symbol (same route api/stock.js uses — reliable from Vercel).
  // range=1y guarantees fiftyTwoWeekHigh/Low in meta; fall back to computing from closes.
  const results = await Promise.all(symbols.map(async sym => {
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1y&interval=1mo`,
        { headers: { 'User-Agent': UA } }
      );
      if (!r.ok) return null;
      const data = await r.json();
      const meta   = data?.chart?.result?.[0]?.meta;
      if (!meta) return null;
      const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(v => v != null) || [];
      return {
        symbol:                     meta.symbol || sym,
        fiftyTwoWeekHigh:           meta.fiftyTwoWeekHigh ?? (closes.length ? Math.max(...closes) : null),
        fiftyTwoWeekLow:            meta.fiftyTwoWeekLow  ?? (closes.length ? Math.min(...closes) : null),
        regularMarketPrice:         meta.regularMarketPrice,
        regularMarketChangePercent: meta.regularMarketChangePercent,
        shortName:                  meta.shortName || sym,
      };
    } catch (e) { return null; }
  }));

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ quoteResponse: { result: results.filter(Boolean), error: null } });
};
