const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const ALPACA_BASE = 'https://paper-api.alpaca.markets';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const keyId     = process.env.ALPACA_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY;
  const alpacaHeaders = {
    'APCA-API-KEY-ID':     keyId,
    'APCA-API-SECRET-KEY': secretKey,
  };

  // ── Close a single Alpaca position (POST or GET ?close=SYMBOL) ─────────────
  if (req.query.close || (req.method === 'POST' && req.body?.close)) {
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!keyId || !secretKey) return res.status(500).json({ error: 'Alpaca credentials not configured' });
    const symbol = req.query.close || req.body?.close;
    const alpacaSym = symbol.replace('/', '%2F');
    try {
      const r = await fetch(`${ALPACA_BASE}/v2/positions/${alpacaSym}`, {
        method: 'DELETE',
        headers: alpacaHeaders,
        signal: AbortSignal.timeout(10000),
      });
      const body = await r.text();
      const data = body ? JSON.parse(body) : {};
      if (!r.ok) return res.status(r.status).json({ error: data.message || `Alpaca ${r.status}` });
      return res.json({ ok: true, order: data });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Alpaca positions + account (was api/positions.js) ────────────────────
  if (req.query.positions) {
    if (!keyId || !secretKey) return res.status(500).json({ error: 'Alpaca credentials not configured' });
    try {
      const [posRes, acctRes] = await Promise.all([
        fetch(`${ALPACA_BASE}/v2/positions`, { headers: alpacaHeaders, signal: AbortSignal.timeout(12000) }),
        fetch(`${ALPACA_BASE}/v2/account`,   { headers: alpacaHeaders, signal: AbortSignal.timeout(12000) }),
      ]);
      if (!posRes.ok)  throw new Error(`positions ${posRes.status}`);
      if (!acctRes.ok) throw new Error(`account ${acctRes.status}`);
      const positions = await posRes.json();
      const account   = await acctRes.json();
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      return res.json({
        positions: positions.map(p => ({
          symbol: p.symbol, qty: parseFloat(p.qty),
          entry:  parseFloat(p.avg_entry_price), price: parseFloat(p.current_price),
          value:  parseFloat(p.market_value),    cost:  parseFloat(p.cost_basis),
          pl:     parseFloat(p.unrealized_pl),   plPct: parseFloat(p.unrealized_plpc) * 100,
          side:   p.side,
        })),
        account: {
          equity: parseFloat(account.equity), cash: parseFloat(account.cash),
          buyingPower: parseFloat(account.buying_power), portfolioVal: parseFloat(account.portfolio_value),
        },
      });
    } catch (e) { return res.status(502).json({ error: e.message }); }
  }

  // ── Batch quote — v8/finance/quote handles futures (GC=F, SI=F) natively
  if (req.query.syms) {
    const symbols = req.query.syms.split(',').map(s => s.trim()).filter(Boolean);
    const YF_HEADERS = {
      'User-Agent': UA, 'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://finance.yahoo.com/',
    };
    // Try query1 then query2 — Yahoo alternates which one rate-limits Vercel IPs
    const symStr = symbols.join(','); // raw — do NOT encode, GC=F must stay as-is
    for (const host of ['query1', 'query2']) {
      try {
        const url = `https://${host}.finance.yahoo.com/v8/finance/quote?symbols=${symStr}&fields=regularMarketPrice,regularMarketChangePercent,fiftyTwoWeekHigh,fiftyTwoWeekLow,shortName`;
        const r = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(8000) });
        if (!r.ok) continue;
        const data = await r.json();
        const results = (data?.quoteResponse?.result || []).map(q => ({
          symbol:                     q.symbol,
          regularMarketPrice:         q.regularMarketPrice,
          regularMarketChangePercent: q.regularMarketChangePercent ?? null,
          fiftyTwoWeekHigh:           q.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow:            q.fiftyTwoWeekLow  ?? null,
          shortName:                  q.shortName || q.symbol,
        }));
        if (!results.length) continue;
        res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
        return res.json({ quoteResponse: { result: results, error: null } });
      } catch (_) {}
    }
    // Stooq fallback — free, no API key, handles stocks + futures (gc.f, si.f etc.)
    function toStooqSym(s) {
      if (s.toUpperCase().includes('=F')) return s.toLowerCase().replace('=f', '.f'); // GC=F → gc.f
      return s.toLowerCase().replace(/\./g, '-') + '.us'; // SPY → spy.us, BRK.B → brk-b.us
    }
    try {
      const stooqRes = await Promise.all(symbols.map(async sym => {
        try {
          const r = await fetch(`https://stooq.com/q/l/?s=${toStooqSym(sym)}&f=sd2t2ohlcv&h&e=csv`, {
            headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000),
          });
          if (!r.ok) return null;
          const text = await r.text();
          const lines = text.trim().split('\n');
          if (lines.length < 2) return null;
          const cols = lines[1].split(',');
          const close = parseFloat(cols[6]);
          if (!close || close === 0) return null;
          // Stooq intraday open ≠ prior close — don't show misleading 0% change
          return { symbol: sym, regularMarketPrice: close,
            regularMarketChangePercent: null,
            fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null, shortName: sym };
        } catch (_) { return null; }
      }));
      const stooqData = stooqRes.filter(Boolean);
      if (stooqData.length) {
        res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
        return res.json({ quoteResponse: { result: stooqData, error: null } });
      }
    } catch (_) {}
    return res.status(502).json({ error: 'Yahoo batch quote failed', quoteResponse: { result: [], error: 'failed' } });
  }

  // ── Single symbol price ───────────────────────────────────────────────────
  const { sym } = req.query;
  if (!sym) return res.status(400).json({ error: 'sym, syms, or positions required' });

  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');

  let price = null, prevClose = null, changePct = null;

  if (keyId && secretKey) {
    try {
      const r = await fetch(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(sym)}&feed=iex`, {
        headers: alpacaHeaders, signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const data = await r.json();
        const snap = data[sym];
        if (snap) {
          price     = snap.latestTrade?.p || snap.minuteBar?.c || snap.dailyBar?.c || snap.prevDailyBar?.c || null;
          prevClose = snap.prevDailyBar?.c || snap.dailyBar?.o || price;
          changePct = price && prevClose ? (price - prevClose) / prevClose * 100 : null;
        }
      }
    } catch (_) {}
  }

  if (!price) {
    try {
      const yf = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com/' },
        signal: AbortSignal.timeout(8000),
      });
      if (yf.ok) {
        const yfData = await yf.json();
        const meta   = yfData?.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice) {
          price     = meta.regularMarketPrice;
          prevClose = meta.previousClose || meta.chartPreviousClose || price;
          changePct = meta.regularMarketChangePercent ?? (price && prevClose ? (price - prevClose) / prevClose * 100 : null);
        }
      }
    } catch (_) {}
  }

  if (!price) return res.status(404).json({ error: 'Price unavailable' });

  return res.json({
    chart: { result: [{ meta: {
      regularMarketPrice: price, previousClose: prevClose,
      regularMarketChangePercent: changePct,
      fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null, shortName: sym,
    }}]}
  });
};
