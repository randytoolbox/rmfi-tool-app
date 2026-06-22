module.exports = async function handler(req, res) {
  const { syms } = req.query;
  if (!syms) return res.status(400).json({ error: 'syms required' });

  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(syms)}&fields=regularMarketPrice,fiftyTwoWeekHigh,fiftyTwoWeekLow,regularMarketChangePercent,regularMarketChange,shortName,regularMarketPreviousClose`;

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; randy-money/1.0)' },
    });
    if (!r.ok) throw new Error('yahoo ' + r.status);
    const data = await r.json();
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
