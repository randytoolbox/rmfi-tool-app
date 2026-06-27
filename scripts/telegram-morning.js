// Sends a morning digest to Randy's Telegram.
// Runs in GitHub Actions after the briefing + advisor scripts.
// Needs: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

const fs   = require('fs');
const path = require('path');
const https = require('https');

const TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function tgSend(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function run() {
  if (!TOKEN || !CHAT_ID) {
    console.log('[telegram-morning] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping.');
    return;
  }

  const briefingPath = path.join(__dirname, '..', 'briefing.json');
  if (!fs.existsSync(briefingPath)) {
    console.log('[telegram-morning] No briefing.json — skipping.');
    return;
  }

  const b       = JSON.parse(fs.readFileSync(briefingPath, 'utf8'));
  const articles = (b.articles || []).filter(a => a.analysis);
  const high     = articles.filter(a => a.analysis.urgency === 'high');
  const adv      = b.claudeAdvice;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York',
  });

  const moodEmoji = !adv ? '⏳' : adv.marketMood === 'bullish' ? '🟢' : adv.marketMood === 'cautious' ? '🔴' : '🟡';

  let msg = `<b>☀️ Good morning, Randy! — ${today}</b> ${moodEmoji}\n\n`;
  msg += `📰 ${articles.length} articles · ${high.length} high priority\n`;
  if (b.gmail?.count) msg += `📬 ${b.gmail.count} relevant inbox emails\n`;
  msg += '\n';

  if (adv) {
    msg += `<b>🧠 Claude:</b>\n${adv.topTrade?.slice(0, 200)}\n\n`;
    if (adv.redFlag && !adv.redFlag.toLowerCase().includes('no red flags')) {
      msg += `<b>⚠️ Watch out:</b> ${adv.redFlag?.slice(0, 120)}\n\n`;
    }
    if (adv.watchTickers?.length) msg += `👀 Tickers: ${adv.watchTickers.join(', ')}\n\n`;
  }

  if (high.length) {
    msg += `<b>Top Stories:</b>\n`;
    high.slice(0, 3).forEach((a, i) => {
      msg += `${i + 1}. ${a.title}\n`;
    });
    msg += '\n';
  }

  msg += `— /portfolio /buys /claude`;

  const result = await tgSend(msg);
  if (result.ok) {
    console.log('[telegram-morning] Morning digest sent ✓');
  } else {
    console.error('[telegram-morning] Send failed:', JSON.stringify(result));
  }
}

run().catch(e => console.error('[telegram-morning]', e.message));
