// Morning Briefing — Playwright-powered web scraper + email via Resend
// Runs in GitHub Actions (Mon–Fri 7:30am ET). Scrapes sites that block plain HTTP fetches.

const { chromium } = require('playwright');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TO_EMAIL       = 'randybarclay1@gmail.com';

// Sites to scrape — add/remove as needed
const SOURCES = [
  {
    name:    'Intellectia — AI Finance',
    url:     'https://intellectia.ai/blog',
    scrape:  scapeIntellectia,
  },
  {
    name:    'Defense News',
    url:     'https://www.defensenews.com/',
    scrape:  scrapeDefenseNews,
  },
  {
    name:    'Federal Times — Gov Contracts',
    url:     'https://www.federaltimes.com/',
    scrape:  scrapeFederalTimes,
  },
  {
    name:    'USASpending — Recent DoD Awards',
    url:     'https://www.usaspending.gov/search/?hash=ac72e5cb4cde852b8a209aaede23e5f5',
    scrape:  scrapeUSASpending,
  },
];

// ── Scrapers ───────────────────────────────────────────────────────────────────

async function scapeIntellectia(page) {
  await page.goto('https://intellectia.ai/blog', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  return page.evaluate(() => {
    const items = [];
    // Article cards — try multiple selector patterns
    const cards = document.querySelectorAll('article, [class*="blog"], [class*="post"], [class*="card"]');
    cards.forEach(card => {
      const titleEl = card.querySelector('h1,h2,h3,h4');
      const linkEl  = card.querySelector('a[href]');
      const summaryEl = card.querySelector('p');
      if (titleEl && titleEl.textContent.trim().length > 10) {
        items.push({
          title:   titleEl.textContent.trim(),
          url:     linkEl ? (linkEl.href.startsWith('http') ? linkEl.href : 'https://intellectia.ai' + linkEl.getAttribute('href')) : '',
          summary: summaryEl ? summaryEl.textContent.trim().slice(0, 200) : '',
        });
      }
    });
    return items.slice(0, 6);
  });
}

async function scrapeDefenseNews(page) {
  await page.goto('https://www.defensenews.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  return page.evaluate(() => {
    const items = [];
    document.querySelectorAll('article, .article-card, h3 a, h2 a').forEach(el => {
      const isLink  = el.tagName === 'A';
      const title   = isLink ? el.textContent.trim() : el.querySelector('h2,h3,h4,a')?.textContent.trim();
      const href    = isLink ? el.href : el.querySelector('a')?.href;
      if (title && title.length > 15 && href) {
        items.push({ title, url: href, summary: '' });
      }
    });
    return [...new Map(items.map(i => [i.title, i])).values()].slice(0, 6);
  });
}

async function scrapeFederalTimes(page) {
  await page.goto('https://www.federaltimes.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  return page.evaluate(() => {
    const items = [];
    document.querySelectorAll('h3, h2').forEach(el => {
      const link = el.querySelector('a') || el.closest('a');
      const title = el.textContent.trim();
      if (title.length > 15 && link?.href) {
        items.push({ title, url: link.href, summary: '' });
      }
    });
    return [...new Map(items.map(i => [i.title, i])).values()].slice(0, 5);
  });
}

async function scrapeUSASpending(page) {
  // Scrape the latest DoD contract awards feed
  await page.goto('https://www.defense.gov/News/Contracts/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  return page.evaluate(() => {
    const items = [];
    document.querySelectorAll('.news-item, article, li').forEach(el => {
      const titleEl = el.querySelector('h3,h4,h2,a,.title');
      const linkEl  = el.querySelector('a');
      const title   = titleEl?.textContent.trim() || linkEl?.textContent.trim();
      const summary = el.querySelector('p')?.textContent.trim().slice(0, 250) || '';
      if (title && title.length > 20 && linkEl?.href) {
        items.push({ title, url: linkEl.href, summary });
      }
    });
    return [...new Map(items.map(i => [i.title, i])).values()].slice(0, 6);
  });
}

// ── Email builder ──────────────────────────────────────────────────────────────

function buildEmail(sections, screenshotB64s) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York',
  });

  const sectionHtml = sections.map(({ name, items, error }) => {
    if (error) {
      return `<h2 style="color:#6aaeff;border-bottom:1px solid #1a3a5c;padding-bottom:6px;">${name}</h2>
              <p style="color:#f87171;font-style:italic;">Failed to load: ${error}</p>`;
    }
    if (!items || !items.length) {
      return `<h2 style="color:#6aaeff;border-bottom:1px solid #1a3a5c;padding-bottom:6px;">${name}</h2>
              <p style="color:#888;">No items found.</p>`;
    }
    const itemsHtml = items.map(i =>
      `<div style="margin-bottom:16px;padding:12px 14px;background:#0a1a2e;border-radius:8px;border-left:3px solid #1a4a8a;">
        <a href="${i.url || '#'}" style="color:#4aaeff;font-weight:700;font-size:14px;text-decoration:none;">${i.title}</a>
        ${i.summary ? `<p style="color:#aaa;font-size:12px;margin:6px 0 0;">${i.summary}</p>` : ''}
      </div>`
    ).join('');
    return `<h2 style="color:#6aaeff;border-bottom:1px solid #1a3a5c;padding-bottom:6px;margin-top:28px;">${name}</h2>${itemsHtml}`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#030d18;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;padding:24px;">
  <div style="background:#0f2040;border:1px solid #1a3a5c;border-radius:12px;padding:24px 28px;margin-bottom:24px;">
    <h1 style="color:#fff;margin:0 0 4px;font-size:22px;">Morning Briefing</h1>
    <p style="color:#6aaeff;margin:0;font-size:14px;">${today} &nbsp;|&nbsp; Auto-scraped with Playwright</p>
  </div>

  ${sectionHtml}

  <div style="margin-top:32px;padding:16px;background:#0a1a2e;border-radius:8px;text-align:center;">
    <a href="https://rmfi-tool-app.vercel.app/randys-money.html" style="color:#4ade80;font-weight:700;text-decoration:none;">Open Randy's Money Dashboard →</a>
  </div>
  <p style="color:#444;font-size:11px;text-align:center;margin-top:16px;">Auto-generated by GitHub Actions &bull; Playwright web scraper</p>
</body>
</html>`;
}

// ── Send email ─────────────────────────────────────────────────────────────────

async function sendEmail(html) {
  const r = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'Randy\'s Briefing <noreply@rmfi-tool-app.vercel.app>',
      to:      [TO_EMAIL],
      subject: `Morning Briefing — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })}`,
      html,
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Resend ${r.status}: ${JSON.stringify(data)}`);
  console.log('Email sent:', data.id);
}

// ── Main ───────────────────────────────────────────────────────────────────────

(async () => {
  if (!RESEND_API_KEY) { console.error('RESEND_API_KEY not set'); process.exit(1); }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const sections = [];

  for (const source of SOURCES) {
    console.log(`Scraping: ${source.name} — ${source.url}`);
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      viewport:  { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    try {
      const items = await source.scrape(page);
      console.log(`  → ${items.length} items`);
      sections.push({ name: source.name, items });
    } catch (e) {
      console.error(`  → Error: ${e.message}`);
      sections.push({ name: source.name, error: e.message });
    } finally {
      await context.close();
    }
  }

  await browser.close();

  const html = buildEmail(sections);
  await sendEmail(html);
  console.log('Done.');
})();
