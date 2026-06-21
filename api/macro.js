module.exports = async function handler(req, res) {
  const results = {};
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/global');
    if (r.ok) {
      const d = await r.json();
      results.btcDominance = d.data?.market_cap_percentage?.bitcoin;
      results.totalMktCap = d.data?.total_market_cap?.usd;
      results.mktCapChange24h = d.data?.market_cap_change_percentage_24h_usd;
    }
  } catch {}
  try {
    const r = await fetch('https://api.alternative.me/fng/');
    if (r.ok) {
      const d = await r.json();
      results.fearGreed = parseInt(d.data[0].value);
      results.fearGreedLabel = d.data[0].value_classification;
    }
  } catch {}
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(results);
};
