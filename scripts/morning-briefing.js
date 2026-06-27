// Morning Briefing — Playwright scraper + Claude AI analysis + email via Resend
// Runs in GitHub Actions (7:30am ET daily). Scrapes sites, reads full articles,
// asks Claude to analyze each one, saves briefing.json, sends email digest.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const RESEND_API_KEY    = process.env.RESEND_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TO_EMAIL          = 'randybarclay1@gmail.com';

const SOURCES = [
  // Crypto — RSS feeds (no bot protection, no Playwright needed)
  { name: 'CoinDesk',                    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',  scrape: () => scrapeRSS('https://www.coindesk.com/arc/outboundfeeds/rss/', 8)  },
  { name: 'CoinTelegraph',               url: 'https://cointelegraph.com/rss',                    scrape: () => scrapeRSS('https://cointelegraph.com/rss', 6)                   },
  { name: 'Decrypt',                     url: 'https://decrypt.co/feed',                          scrape: () => scrapeRSS('https://decrypt.co/feed', 6)                         },
  // Defense / Government — Playwright (bypass bot protection)
  { name: 'Intellectia — AI Finance',    url: 'https://intellectia.ai/blog',                      scrape: scrapeIntellectia  },
  { name: 'Defense News',                url: 'https://www.defensenews.com/',                     scrape: scrapeDefenseNews  },
  { name: 'Federal Times',               url: 'https://www.federaltimes.com/',                    scrape: scrapeFederalTimes },
  { name: 'DoD Contract Awards',         url: 'https://www.defense.gov/News/Contracts/',          scrape: scrapeDoD          },
];

// ── Scrapers ────────────────────────────────────────────────────────────────────

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
      const decode = s => (s || '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#039;/g,"'").trim();
      const grab   = tag => { const r = x.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 's')); return r ? decode(r[1]) : ''; };
      const title  = grab('title');
      const link   = grab('link') || grab('guid');
      const desc   = grab('description').replace(/<[^>]+>/g, '').slice(0, 200);
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

async function scrapeIntellectia(page) {
  await page.goto('https://intellectia.ai/blog', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const items = [];
    document.querySelectorAll('article, [class*="blog"], [class*="post"], [class*="card"]').forEach(card => {
      const titleEl   = card.querySelector('h1,h2,h3,h4');
      const linkEl    = card.querySelector('a[href]');
      const summaryEl = card.querySelector('p');
      if (titleEl && titleEl.textContent.trim().length > 10) {
        items.push({
          title:   titleEl.textContent.trim(),
          url:     linkEl ? (linkEl.href.startsWith('http') ? linkEl.href : 'https://intellectia.ai' + linkEl.getAttribute('href')) : '',
          summary: summaryEl ? summaryEl.textContent.trim().slice(0, 200) : '',
        });
      }
    });
    return items.slice(0, 8);
  });
}

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
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    const items = [];
    document.querySelectorAll('.news-item, article, li').forEach(el => {
      const titleEl = el.querySelector('h3,h4,h2,a,.title');
      const linkEl  = el.querySelector('a');
      const title   = titleEl?.textContent.trim() || linkEl?.textContent.trim();
      const summary = el.querySelector('p')?.textContent.trim().slice(0, 250) || '';
      if (title && title.length > 20 && linkEl?.href) items.push({ title, url: linkEl.href, summary });
    });
    return [...new Map(items.map(i => [i.title, i])).values()].slice(0, 6);
  });
}

// ── Full article text fetcher ────────────────────────────────────────────────────

async function fetchArticleText(page, url) {
  if (!url || !url.startsWith('http')) return '';
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    return await page.evaluate(() => {
      ['nav','footer','header','aside','script','style','.ad','.advertisement','.sidebar','.menu'].forEach(sel => {
        try { document.querySelectorAll(sel).forEach(el => el.remove()); } catch(_) {}
      });
      return (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 3500);
    });
  } catch (e) {
    return '';
  }
}

// ── Claude API analysis ──────────────────────────────────────────────────────────

async function analyzeWithClaude(article, fullText) {
  if (!ANTHROPIC_API_KEY) return null;
  const content = fullText.length > 100 ? fullText : article.summary || article.title;
  const prompt = `You analyze news for Randy, owner of RMFI (precision machining manufacturer serving defense/aerospace/industrial) and active stock/crypto trader.

Article title: "${article.title}"
Article text: ${content.slice(0, 2500)}

Return ONLY valid JSON with these exact fields:
{
  "insight": "1-2 sentence key takeaway — what happened and why it matters for investors or defense manufacturers",
  "tickers": ["TICK1","TICK2"],
  "rmfi": "one sentence on any sales lead or opportunity for a precision machining company, or null if not relevant",
  "category": "AI/Tech",
  "urgency": "high"
}

category must be one of: AI/Tech, Defense, Government, Markets, Crypto, Other
urgency must be one of: high, medium, low
tickers: only clearly relevant publicly-traded US tickers, max 4, empty array if none`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages:   [{ role: 'user', content: prompt }],
      }),
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

// ── Email builder ────────────────────────────────────────────────────────────────

function buildEmail(allArticles, briefingDate) {
  const byCategory = {};
  for (const a of allArticles) {
    const cat = a.analysis?.category || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(a);
  }

  const catOrder = ['AI/Tech','Defense','Government','Markets','Crypto','Other'];
  const catIcons = { 'AI/Tech':'🤖', 'Defense':'🛡️', 'Government':'🏛️', 'Markets':'📈', 'Crypto':'₿', 'Other':'📰' };

  const sectionsHtml = catOrder.filter(c => byCategory[c]?.length).map(cat => {
    const articles = byCategory[cat];
    const itemsHtml = articles.map(a => {
      const analysis = a.analysis;
      const tickerBadges = (analysis?.tickers || []).map(t =>
        `<span style="display:inline-block;background:#0d2d1a;border:1px solid #4caf50;color:#4caf50;border-radius:4px;font-size:10px;font-weight:900;padding:1px 7px;margin-right:4px;">${t}</span>`
      ).join('');
      const urgencyColor = analysis?.urgency === 'high' ? '#f59e0b' : analysis?.urgency === 'medium' ? '#6aaeff' : '#555';

      return `<div style="margin-bottom:16px;padding:12px 14px;background:#0a1a2e;border-radius:8px;border-left:3px solid ${urgencyColor};">
        <a href="${a.url || '#'}" style="color:#4aaeff;font-weight:700;font-size:13px;text-decoration:none;">${a.title}</a>
        <div style="color:#888;font-size:10px;margin-top:2px;">${a.source}</div>
        ${analysis?.insight ? `<p style="color:#d0d8e8;font-size:12px;margin:8px 0 6px;line-height:1.5;">${analysis.insight}</p>` : ''}
        ${tickerBadges ? `<div style="margin-bottom:6px;">${tickerBadges}</div>` : ''}
        ${analysis?.rmfi ? `<div style="color:#4ade80;font-size:11px;background:#0d1f0d;padding:5px 8px;border-radius:4px;">🏭 RMFI: ${analysis.rmfi}</div>` : ''}
      </div>`;
    }).join('');

    return `<h2 style="color:#6aaeff;border-bottom:1px solid #1a3a5c;padding-bottom:6px;margin-top:28px;">${catIcons[cat] || '📰'} ${cat}</h2>${itemsHtml}`;
  }).join('');

  const aiCount   = allArticles.filter(a => a.analysis).length;
  const totalRead = allArticles.length;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#030d18;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;padding:24px;">
  <div style="background:#0f2040;border:1px solid #1a3a5c;border-radius:12px;padding:24px 28px;margin-bottom:24px;">
    <h1 style="color:#fff;margin:0 0 4px;font-size:22px;">Morning Briefing</h1>
    <p style="color:#6aaeff;margin:0 0 8px;font-size:14px;">${briefingDate} &nbsp;|&nbsp; Auto-scraped with Playwright</p>
    <p style="color:#4ade80;margin:0;font-size:13px;">Claude read <strong>${totalRead}</strong> articles this morning — <strong>${aiCount}</strong> analyzed with AI</p>
  </div>

  ${sectionsHtml}

  <div style="margin-top:32px;padding:16px;background:#0a1a2e;border-radius:8px;text-align:center;">
    <a href="https://rmfi-tool-app.vercel.app/briefing.html" style="color:#4ade80;font-weight:700;text-decoration:none;margin-right:20px;">Open Full Briefing →</a>
    <a href="https://rmfi-tool-app.vercel.app/randys-money.html" style="color:#4aaeff;font-weight:700;text-decoration:none;">Randy's Money Dashboard →</a>
  </div>
  <p style="color:#444;font-size:11px;text-align:center;margin-top:16px;">Auto-generated by GitHub Actions &bull; Playwright + Claude AI</p>
</body>
</html>`;
}

// ── Send email ────────────────────────────────────────────────────────────────────

async function sendEmail(html, briefingDate) {
  const r = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'Randy\'s Briefing <onboarding@resend.dev>',
      to:      [TO_EMAIL],
      subject: `Morning Briefing — ${briefingDate}`,
      html,
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Resend ${r.status}: ${JSON.stringify(data)}`);
  console.log('Email sent:', data.id);
}

// ── Main ──────────────────────────────────────────────────────────────────────────

(async () => {
  if (!RESEND_API_KEY) { console.error('RESEND_API_KEY not set'); process.exit(1); }
  if (!ANTHROPIC_API_KEY) console.warn('ANTHROPIC_API_KEY not set — articles will not be AI-analyzed');

  const briefingDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York',
  });

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const allArticles = [];

  // Step 1: Scrape all sources for headlines
  for (const source of SOURCES) {
    console.log(`\nScraping: ${source.name}`);
    const ctx  = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      viewport:  { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();
    try {
      const items = await source.scrape(page);
      console.log(`  → ${items.length} headlines`);
      for (const item of items) {
        allArticles.push({ ...item, source: source.name, analysis: null });
      }
    } catch (e) {
      console.error(`  → Error: ${e.message}`);
    } finally {
      await ctx.close();
    }
  }

  // Step 2: Fetch full text + AI analyze each article
  if (ANTHROPIC_API_KEY && allArticles.length > 0) {
    console.log(`\nReading and analyzing ${allArticles.length} articles with Claude...`);
    const ctx  = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      viewport:  { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();

    for (const article of allArticles) {
      if (!article.url) continue;
      try {
        console.log(`  Reading: ${article.title.slice(0, 60)}...`);
        const text     = await fetchArticleText(page, article.url);
        const analysis = await analyzeWithClaude(article, text);
        article.analysis = analysis;
        if (analysis) console.log(`    → [${analysis.category}] ${analysis.urgency} | tickers: ${(analysis.tickers||[]).join(',')||'none'}`);
        await new Promise(r => setTimeout(r, 500)); // gentle rate limit
      } catch (e) {
        console.warn(`  → Failed: ${e.message}`);
      }
    }
    await ctx.close();
  }

  await browser.close();

  // Step 3: Save briefing.json
  const briefingData = {
    date:         new Date().toISOString().slice(0, 10),
    generated:    new Date().toISOString(),
    articlesRead: allArticles.length,
    aiAnalyzed:   allArticles.filter(a => a.analysis).length,
    articles:     allArticles,
  };
  const outPath = path.join(__dirname, '..', 'briefing.json');
  fs.writeFileSync(outPath, JSON.stringify(briefingData, null, 2));
  console.log(`\nSaved briefing.json (${allArticles.length} articles, ${briefingData.aiAnalyzed} AI-analyzed)`);

  // Step 4: Send email
  const html = buildEmail(allArticles, briefingDate);
  await sendEmail(html, briefingDate);
  console.log('Done.');
})();
