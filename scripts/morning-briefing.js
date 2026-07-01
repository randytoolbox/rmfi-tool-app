// Morning Briefing — Playwright scraper + Claude AI analysis + email via Resend
// Runs in GitHub Actions (7:30am ET daily). Scrapes 17 sources, reads full articles,
// asks Claude to analyze each one, generates Top 3 executive summary, saves briefing.json.

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const RESEND_API_KEY    = process.env.RESEND_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TO_EMAIL          = 'randybarclay1@gmail.com';

// rss:true  → plain fetch, no Playwright needed
// rss:false → Playwright browser (bypasses bot protection)
const SOURCES = [
  // ── Crypto ──────────────────────────────────────────────────────────────
  { rss:true,  name:'CoinDesk',            scrape:()=>scrapeRSS('https://www.coindesk.com/arc/outboundfeeds/rss/',6) },
  { rss:true,  name:'CoinTelegraph',       scrape:()=>scrapeRSS('https://cointelegraph.com/rss',6) },
  { rss:true,  name:'Decrypt',             scrape:()=>scrapeRSS('https://decrypt.co/feed',5) },
  { rss:true,  name:'The Block',           scrape:()=>scrapeRSS('https://www.theblock.co/rss.xml',5) },
  // ── Markets ──────────────────────────────────────────────────────────────
  { rss:true,  name:'Reuters Business',    scrape:()=>scrapeRSS('https://news.google.com/rss/search?q=site:reuters.com+business+markets+economy&hl=en-US&gl=US&ceid=US:en',6) },
  { rss:true,  name:'CNBC',               scrape:()=>scrapeRSS('https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',6) },
  { rss:true,  name:'MarketWatch',         scrape:()=>scrapeRSS('https://feeds.content.dowjones.io/public/rss/mw_topstories',5) },
  // ── Defense / Manufacturing ───────────────────────────────────────────────
  { rss:true,  name:'Breaking Defense',    scrape:()=>scrapeRSS('https://breakingdefense.com/feed/',6) },
  { rss:true,  name:'National Defense',    scrape:()=>scrapeRSS('https://www.nationaldefensemagazine.org/rss',5) },
  { rss:true,  name:'GovConWire',          scrape:()=>scrapeRSS('https://www.govconwire.com/feed/',5) },
  // ── Data Center / Infrastructure ─────────────────────────────────────────
  { rss:true,  name:'Data Center Dynamics',  scrape:()=>scrapeRSS('https://www.datacenterdynamics.com/en/rss/',6) },
  { rss:true,  name:'Data Center Knowledge', scrape:()=>scrapeRSS('https://www.datacenterknowledge.com/rss.xml',5) },
  // ── Nuclear / Energy ─────────────────────────────────────────────────────
  { rss:true,  name:'World Nuclear News',    scrape:()=>scrapeRSS('https://world-nuclear-news.org/rss',5) },
  // ── Google News custom searches ───────────────────────────────────────────
  { rss:true,  name:'Google News — Machining',        scrape:()=>scrapeRSS('https://news.google.com/rss/search?q=precision+machining+defense+contract+aerospace&hl=en-US&gl=US&ceid=US:en',5) },
  { rss:true,  name:'Google News — Defense Mfg',      scrape:()=>scrapeRSS('https://news.google.com/rss/search?q=defense+contract+award+manufacturing+supplier&hl=en-US&gl=US&ceid=US:en',5) },
  { rss:true,  name:'Google News — Crypto',            scrape:()=>scrapeRSS('https://news.google.com/rss/search?q=bitcoin+ethereum+crypto+market+today&hl=en-US&gl=US&ceid=US:en',5) },
  { rss:true,  name:'Google News — Data Centers',      scrape:()=>scrapeRSS('https://news.google.com/rss/search?q=data+center+construction+permit+%22breaking+ground%22&hl=en-US&gl=US&ceid=US:en',5) },
  { rss:true,  name:'Google News — SMR Nuclear',       scrape:()=>scrapeRSS('https://news.google.com/rss/search?q=%22small+modular+reactor%22+OR+SMR+construction+permit+license+nuclear&hl=en-US&gl=US&ceid=US:en',5) },
  { rss:true,  name:'Google News — Nuclear+DataCenter',scrape:()=>scrapeRSS('https://news.google.com/rss/search?q=nuclear+power+data+center+hyperscaler+energy+agreement&hl=en-US&gl=US&ceid=US:en',5) },
  // ── Local / county-level permit intelligence ──────────────────────────────────
  { rss:true,  name:'Google News — DC Virginia',      scrape:()=>scrapeRSS('https://news.google.com/rss/search?q=data+center+construction+permit+Virginia+Loudoun+Fairfax+Prince+William&hl=en-US&gl=US&ceid=US:en',4) },
  { rss:true,  name:'Google News — DC Texas/AZ',      scrape:()=>scrapeRSS('https://news.google.com/rss/search?q=data+center+construction+permit+Texas+Arizona+Phoenix+Dallas+San+Antonio&hl=en-US&gl=US&ceid=US:en',4) },
  { rss:true,  name:'Google News — DC Southeast',     scrape:()=>scrapeRSS('https://news.google.com/rss/search?q=data+center+construction+permit+Georgia+Ohio+North+Carolina+Nevada&hl=en-US&gl=US&ceid=US:en',4) },
  { rss:true,  name:'Google News — Nuclear Permit',   scrape:()=>scrapeRSS('https://news.google.com/rss/search?q=nuclear+reactor+permit+NRC+license+approval+county+site+SMR+2025+2026&hl=en-US&gl=US&ceid=US:en',4) },
  // ── Playwright sources (bypass bot protection) ────────────────────────────
  { rss:true,  name:'Seeking Alpha — Markets',  scrape:()=>scrapeRSS('https://news.google.com/rss/search?q=stock+market+earnings+earnings+beat+wall+street&hl=en-US&gl=US&ceid=US:en',5) },
  { rss:false, name:'Defense News',             scrape:scrapeDefenseNews  },
  { rss:false, name:'Federal Times',            scrape:scrapeFederalTimes },
  { rss:false, name:'DoD Contract Awards',      scrape:scrapeDoD          },
];

// ── RSS fetcher (no browser) ─────────────────────────────────────────────────

async function scrapeRSS(url, maxItems = 8) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; randy-briefing/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) { console.warn(`  RSS ${r.status} from ${url}`); return []; }
    const xml   = await r.text();
    const items = [];
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const x      = m[1];
      const decode = s => (s||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#039;/g,"'").trim();
      const grab   = tag => { const r = x.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 's')); return r ? decode(r[1]) : ''; };
      const title  = grab('title');
      const link   = grab('link') || grab('guid');
      const desc   = grab('description').replace(/<[^>]+>/g,'').slice(0, 250);
      if (title && link && link.startsWith('http') && title.length > 10) {
        items.push({ title, url: link, summary: desc });
        if (items.length >= maxItems) break;
      }
    }
    return items;
  } catch (e) {
    console.warn(`  RSS error (${url}):`, e.message);
    return [];
  }
}

// ── Playwright scrapers ───────────────────────────────────────────────────────


async function scrapeDefenseNews(page) {
  await page.goto('https://www.defensenews.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    const items = [];
    document.querySelectorAll('article, .article-card, h3 a, h2 a').forEach(el => {
      const isLink = el.tagName === 'A';
      const title  = isLink ? el.textContent.trim() : el.querySelector('h2,h3,h4,a')?.textContent.trim();
      const href   = isLink ? el.href : el.querySelector('a')?.href;
      if (title && title.length > 15 && href) items.push({ title, url: href, summary: '' });
    });
    return [...new Map(items.map(i => [i.title, i])).values()].slice(0, 8);
  });
}

async function scrapeFederalTimes(page) {
  await page.goto('https://www.federaltimes.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    const items = [];
    document.querySelectorAll('h3, h2').forEach(el => {
      const link  = el.querySelector('a') || el.closest('a');
      const title = el.textContent.trim();
      if (title.length > 15 && link?.href) items.push({ title, url: link.href, summary: '' });
    });
    return [...new Map(items.map(i => [i.title, i])).values()].slice(0, 6);
  });
}

async function scrapeDoD(page) {
  await page.goto('https://www.defense.gov/News/Contracts/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const items = [];
    // DoD contracts page lists contracts as links with date prefixes
    document.querySelectorAll('a[href*="/News/Contracts/Contract/"]').forEach(el => {
      const title = el.textContent.trim();
      if (title && title.length > 20) {
        items.push({ title, url: el.href.startsWith('http') ? el.href : 'https://www.defense.gov' + el.getAttribute('href'), summary: '' });
      }
    });
    // Fallback: grab any substantial links on the page
    if (items.length === 0) {
      document.querySelectorAll('a[href]').forEach(el => {
        const title = el.textContent.trim();
        const href  = el.href || '';
        if (title.length > 30 && href.includes('defense.gov') && !href.includes('#')) {
          items.push({ title, url: href, summary: '' });
        }
      });
    }
    return [...new Map(items.map(i => [i.title, i])).values()].slice(0, 6);
  });
}

// ── Full article text fetcher (Playwright) ───────────────────────────────────

async function fetchArticleText(page, url) {
  if (!url || !url.startsWith('http')) return '';
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    return await page.evaluate(() => {
      ['nav','footer','header','aside','script','style','.ad','.advertisement','.sidebar','.menu'].forEach(sel => {
        try { document.querySelectorAll(sel).forEach(el => el.remove()); } catch(_) {}
      });
      return (document.body?.innerText || '').replace(/\s+/g,' ').trim().slice(0, 3500);
    });
  } catch (e) {
    return '';
  }
}

// ── Claude: per-article analysis ─────────────────────────────────────────────

async function analyzeWithClaude(article, fullText) {
  if (!ANTHROPIC_API_KEY) return null;
  const content = fullText.length > 100 ? fullText : article.summary || article.title;
  const prompt = `You analyze news for Randy, owner of RMFI (precision machining manufacturer serving defense/aerospace/industrial) and active stock/crypto trader.

Article title: "${article.title}"
Article text: ${content.slice(0, 2500)}

Return ONLY valid JSON:
{
  "insight": "1-2 sentence key takeaway — what happened and why it matters for investors or defense manufacturers",
  "tickers": ["TICK1","TICK2"],
  "rmfi": "one sentence on any sales lead or opportunity for a precision machining company — include data center cooling/power components, nuclear SMR reactor components, and defense parts, or null if not relevant",
  "category": "AI/Tech",
  "urgency": "high"
}

category must be one of: AI/Tech, Defense, Government, Markets, Crypto, Infrastructure, Energy, Other
  Infrastructure = data centers, construction, real estate, telecom buildout
  Energy = nuclear, SMR, power grids, oil/gas, renewables
urgency must be one of: high, medium, low
tickers: only clearly relevant publicly-traded US tickers, max 4, empty array if none
  Key tickers to consider: NVDA MSFT AMZN GOOGL META for data centers; OKLO SMR BWXT CCJ LEU VST CEG for nuclear/energy; VRT ETN EQIX DLR for infrastructure`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) { console.warn('Claude API', r.status); return null; }
    const data  = await r.json();
    const text  = data.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (e) {
    console.warn('Claude analysis error:', e.message);
    return null;
  }
}

// ── Claude: Top 3 executive summary ─────────────────────────────────────────

async function generateTopTakeaways(articles) {
  if (!ANTHROPIC_API_KEY) return null;
  const analyzed = articles.filter(a => a.analysis);
  if (analyzed.length < 3) return null;

  const digest = analyzed.map(a =>
    `[${a.analysis.category}|${a.analysis.urgency}] ${a.title}: ${a.analysis.insight || ''}`
  ).join('\n');

  const prompt = `Randy owns RMFI (precision machining for defense/aerospace) and actively trades stocks and crypto. Today Claude read ${analyzed.length} news articles. Based on these analyses, write his TOP 3 TAKEAWAYS:

${digest.slice(0, 6000)}

Return ONLY valid JSON:
{
  "trader": "2 sentences max: the single most important signal for a stock or crypto trader today — specific ticker or coin if relevant, what to watch or act on",
  "rmfiLead": "2 sentences max: the single best sales or business development opportunity for RMFI precision machining today — be specific about what to bid on or who to call",
  "wildcard": "1 sentence: one thing flying under the radar that could matter next week"
}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return null;
    const data  = await r.json();
    const text  = data.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (e) {
    console.warn('Executive summary error:', e.message);
    return null;
  }
}

// ── Email builder ─────────────────────────────────────────────────────────────

function buildEmail(allArticles, briefingDate, topTakeaways) {
  const aiCount   = allArticles.filter(a => a.analysis).length;
  const totalRead = allArticles.length;

  // Top 3 Takeaways block
  const summaryHtml = topTakeaways ? `
  <div style="background:#0a1f0a;border:1px solid #2d5a2d;border-radius:10px;padding:20px 22px;margin-bottom:24px;">
    <div style="color:#4ade80;font-weight:800;font-size:13px;margin-bottom:14px;letter-spacing:.5px;">📋 TODAY'S TOP 3 TAKEAWAYS</div>
    <div style="margin-bottom:12px;padding:10px 12px;background:#060f06;border-radius:6px;border-left:3px solid #4ade80;">
      <div style="color:#4ade80;font-size:10px;font-weight:900;margin-bottom:4px;">📈 TRADER</div>
      <div style="color:#d0e8d0;font-size:12px;line-height:1.5;">${topTakeaways.trader}</div>
    </div>
    <div style="margin-bottom:12px;padding:10px 12px;background:#060f06;border-radius:6px;border-left:3px solid #f59e0b;">
      <div style="color:#f59e0b;font-size:10px;font-weight:900;margin-bottom:4px;">🏭 RMFI LEAD</div>
      <div style="color:#d0e8d0;font-size:12px;line-height:1.5;">${topTakeaways.rmfiLead}</div>
    </div>
    <div style="padding:10px 12px;background:#060f06;border-radius:6px;border-left:3px solid #6aaeff;">
      <div style="color:#6aaeff;font-size:10px;font-weight:900;margin-bottom:4px;">🎯 WILDCARD</div>
      <div style="color:#d0e8d0;font-size:12px;line-height:1.5;">${topTakeaways.wildcard}</div>
    </div>
  </div>` : '';

  // Top RMFI leads — articles Claude flagged as actionable for the shop
  const rmfiLeads = allArticles
    .filter(a => a.analysis?.rmfi && a.analysis.urgency === 'high')
    .slice(0, 3);
  const rmfiHtml = rmfiLeads.length ? `
  <div style="background:#0d1a0d;border:1px solid #2d5a1a;border-radius:10px;padding:18px 20px;margin-bottom:24px;">
    <div style="color:#4ade80;font-weight:800;font-size:13px;margin-bottom:12px;letter-spacing:.5px;">🏭 TOP RMFI OPPORTUNITIES</div>
    ${rmfiLeads.map(a => `
    <div style="margin-bottom:10px;padding:10px 12px;background:#060f06;border-radius:6px;border-left:3px solid #4ade80;">
      <a href="${a.url||'#'}" style="color:#7dd3a8;font-weight:700;font-size:12px;text-decoration:none;">${a.title}</a>
      <div style="color:#4ade80;font-size:11px;margin-top:5px;">${a.analysis.rmfi}</div>
    </div>`).join('')}
  </div>` : '';

  // High-urgency headlines only — max 8
  const highUrgency = allArticles
    .filter(a => a.analysis?.urgency === 'high')
    .slice(0, 8);

  const catIcons = { 'AI/Tech':'🤖','Infrastructure':'🏗️','Energy':'⚡','Defense':'🛡️','Government':'🏛️','Markets':'📈','Crypto':'₿','Other':'📰' };

  const headlinesHtml = highUrgency.length ? `
  <div style="margin-bottom:24px;">
    <div style="color:#f59e0b;font-weight:800;font-size:13px;margin-bottom:12px;letter-spacing:.5px;">🔥 TOP HEADLINES (${highUrgency.length} high-urgency)</div>
    ${highUrgency.map(a => {
      const an = a.analysis;
      const cat = an?.category || 'Other';
      const tickerBadges = (an?.tickers || []).slice(0,4).map(t =>
        `<span style="display:inline-block;background:#0d2d1a;border:1px solid #4caf50;color:#4caf50;border-radius:4px;font-size:10px;font-weight:900;padding:1px 6px;margin-right:3px;">${t}</span>`
      ).join('');
      return `<div style="margin-bottom:10px;padding:11px 13px;background:#0a1a2e;border-radius:8px;border-left:3px solid #f59e0b;">
        <div style="font-size:10px;color:#f59e0b;font-weight:700;margin-bottom:3px;">${catIcons[cat]||'📰'} ${cat} &bull; ${a.source}</div>
        <a href="${a.url||'#'}" style="color:#4aaeff;font-weight:700;font-size:13px;text-decoration:none;line-height:1.4;">${a.title}</a>
        ${an?.insight ? `<p style="color:#b0bec5;font-size:12px;margin:6px 0 4px;line-height:1.5;">${an.insight}</p>` : ''}
        ${tickerBadges ? `<div>${tickerBadges}</div>` : ''}
      </div>`;
    }).join('')}
  </div>` : '';

  const skipped = totalRead - highUrgency.length;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#030d18;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;padding:24px;">
  <div style="background:#0f2040;border:1px solid #1a3a5c;border-radius:12px;padding:20px 24px;margin-bottom:20px;">
    <h1 style="color:#fff;margin:0 0 4px;font-size:22px;">Morning Briefing</h1>
    <p style="color:#6aaeff;margin:0 0 6px;font-size:14px;">${briefingDate}</p>
    <p style="color:#4ade80;margin:0;font-size:12px;">Claude scanned <strong>${totalRead}</strong> articles — showing top ${highUrgency.length} high-urgency &bull; ${skipped} others filtered out</p>
  </div>

  ${summaryHtml}
  ${rmfiHtml}
  ${headlinesHtml}

  <div style="padding:18px;background:#0a1a2e;border-radius:10px;text-align:center;">
    <div style="color:#888;font-size:12px;margin-bottom:10px;">That's it. ${skipped} lower-priority articles were filtered out.</div>
    <a href="https://rmfi-tool-app.vercel.app/randys-money.html" style="display:inline-block;background:#1a3a5c;color:#4aaeff;font-weight:700;font-size:13px;text-decoration:none;padding:10px 20px;border-radius:8px;margin-right:10px;">Open Dashboard →</a>
    <a href="https://rmfi-tool-app.vercel.app/briefing.html" style="display:inline-block;background:#0d2d1a;color:#4ade80;font-weight:700;font-size:13px;text-decoration:none;padding:10px 20px;border-radius:8px;">Full Briefing →</a>
  </div>
  <p style="color:#444;font-size:11px;text-align:center;margin-top:14px;">Auto-generated by GitHub Actions &bull; ${SOURCES.length} sources &bull; Playwright + Claude AI</p>
</body>
</html>`;
}

// ── Send email ────────────────────────────────────────────────────────────────

async function sendEmail(html, briefingDate) {
  const r = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    "Randy's Briefing <onboarding@resend.dev>",
      to:      [TO_EMAIL],
      subject: `Morning Briefing — ${briefingDate}`,
      html,
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Resend ${r.status}: ${JSON.stringify(data)}`);
  console.log('Email sent:', data.id);
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  if (!RESEND_API_KEY) { console.error('RESEND_API_KEY not set'); process.exit(1); }
  if (!ANTHROPIC_API_KEY) console.warn('ANTHROPIC_API_KEY not set — AI analysis disabled');

  const briefingDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York',
  });

  const allArticles = [];

  // ── Phase 1: RSS sources (no browser needed) ────────────────────────────
  console.log('\n── Phase 1: RSS sources ──');
  const rssSources = SOURCES.filter(s => s.rss);
  for (const source of rssSources) {
    console.log(`  Fetching: ${source.name}`);
    try {
      const items = await source.scrape();
      console.log(`    → ${items.length} items`);
      for (const item of items) allArticles.push({ ...item, source: source.name, rss: true, analysis: null });
    } catch (e) {
      console.error(`    → Error: ${e.message}`);
    }
  }

  // ── Phase 2: Playwright sources ─────────────────────────────────────────
  const playwrightSources = SOURCES.filter(s => !s.rss);
  let browser;
  if (playwrightSources.length > 0) {
    console.log('\n── Phase 2: Playwright sources ──');
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
    for (const source of playwrightSources) {
      console.log(`  Scraping: ${source.name}`);
      const ctx  = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      try {
        const items = await source.scrape(page);
        console.log(`    → ${items.length} items`);
        for (const item of items) allArticles.push({ ...item, source: source.name, rss: false, analysis: null });
      } catch (e) {
        console.error(`    → Error: ${e.message}`);
      } finally {
        await ctx.close();
      }
    }
  }

  console.log(`\nTotal articles collected: ${allArticles.length}`);

  // ── Phase 3: AI analysis ─────────────────────────────────────────────────
  if (ANTHROPIC_API_KEY && allArticles.length > 0) {
    console.log('\n── Phase 3: AI analysis ──');

    // 3a: Playwright articles — fetch full text first, then analyze
    const playwrightArticles = allArticles.filter(a => !a.rss && a.url);
    if (playwrightArticles.length > 0 && browser) {
      const UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
      const ctx  = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      for (const article of playwrightArticles) {
        try {
          console.log(`  [full text] ${article.title.slice(0, 55)}...`);
          const text = await fetchArticleText(page, article.url);
          article.analysis = await analyzeWithClaude(article, text);
          if (article.analysis) console.log(`    → [${article.analysis.category}] ${article.analysis.urgency}`);
          await new Promise(r => setTimeout(r, 400));
        } catch (e) {
          console.warn(`    → Failed: ${e.message}`);
        }
      }
      await ctx.close();
    }

    // 3b: RSS articles — analyze from title + RSS description (no Playwright needed)
    const rssArticles = allArticles.filter(a => a.rss);
    console.log(`\n  Analyzing ${rssArticles.length} RSS articles from headline + description...`);
    for (const article of rssArticles) {
      try {
        article.analysis = await analyzeWithClaude(article, '');
        if (article.analysis) process.stdout.write(`  [${article.analysis.category[0]}]`);
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        console.warn(`\n    → Failed: ${e.message}`);
      }
    }
    console.log('');
  }

  if (browser) await browser.close();

  // ── Phase 4: Executive summary ───────────────────────────────────────────
  console.log('\n── Phase 4: Top 3 Takeaways ──');
  const topTakeaways = await generateTopTakeaways(allArticles);
  if (topTakeaways) {
    console.log('  📈 Trader:', topTakeaways.trader?.slice(0, 80));
    console.log('  🏭 RMFI:  ', topTakeaways.rmfiLead?.slice(0, 80));
    console.log('  🎯 Wild:  ', topTakeaways.wildcard?.slice(0, 80));
  }

  // ── Phase 5: Save briefing.json ──────────────────────────────────────────
  const briefingData = {
    date:         new Date().toISOString().slice(0, 10),
    generated:    new Date().toISOString(),
    sourcesRead:  SOURCES.length,
    articlesRead: allArticles.length,
    aiAnalyzed:   allArticles.filter(a => a.analysis).length,
    topTakeaways,
    articles:     allArticles,
  };
  const outPath = path.join(__dirname, '..', 'briefing.json');
  fs.writeFileSync(outPath, JSON.stringify(briefingData, null, 2));
  console.log(`\nSaved briefing.json (${allArticles.length} articles, ${briefingData.aiAnalyzed} AI-analyzed)`);

  // Step 4: Send email (topTakeaways already generated in Phase 4 above)
  const html = buildEmail(allArticles, briefingDate, topTakeaways);
  await sendEmail(html, briefingDate);
  console.log('Done.');
})();
