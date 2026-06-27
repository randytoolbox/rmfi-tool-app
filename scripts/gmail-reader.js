// Reads Randy's Gmail inbox for financially relevant emails from the last 24h.
// Appends a "gmail" section to briefing.json so the Claude advisor can see them.
// Runs in GitHub Actions using GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.

const https = require('https');
const fs = require('fs');
const path = require('path');

const CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

const RELEVANT_KEYWORDS = [
  'stock', 'market', 'trade', 'invest', 'earnings', 'dividend', 'options',
  'defense', 'military', 'contract', 'dod', 'pentagon', 'nato', 'drone',
  'crypto', 'bitcoin', 'ethereum', 'portfolio', 'etf', 'fund',
  'economy', 'fed ', 'federal reserve', 'interest rate', 'inflation', 'gdp',
  'rmfi', 'machining', 'manufacturing', 'aerospace',
  'seeking alpha', 'motley fool', 'cnbc', 'bloomberg', 'barron',
  'congress', 'sec ', 'regulation', 'ipo', 'merger', 'acquisition',
  'tariff', 'oil', 'energy', 'semiconductor', 'chip', 'ai ', 'nvidia',
];

const SKIP_SENDER_PATTERNS = [
  'no-reply@', 'noreply@', 'donotreply@',
  'canva.com', 'linkedin.com', 'twitter.com', 'facebook.com', 'instagram.com',
  'amazon.com', 'ebay.com', 'walmart.com', 'target.com',
  'unsubscribe', 'bulk', 'promo', 'coupon', 'deal',
];

function post(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function gmailGet(token, endpoint) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'gmail.googleapis.com',
      path: `/gmail/v1/users/me/${endpoint}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject);
    req.end();
  });
}

function header(headers, name) {
  return (headers.find(h => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';
}

function isRelevant(subject, from, snippet) {
  const fromLc = from.toLowerCase();
  if (SKIP_SENDER_PATTERNS.some(p => fromLc.includes(p))) return false;
  const text = (subject + ' ' + snippet).toLowerCase();
  return RELEVANT_KEYWORDS.some(kw => text.includes(kw));
}

async function run() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.log('[gmail-reader] Credentials not set, skipping.');
    return;
  }

  let accessToken;
  try {
    const tok = await post('oauth2.googleapis.com', '/token', new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN, grant_type: 'refresh_token',
    }).toString());
    if (!tok.access_token) throw new Error(JSON.stringify(tok));
    accessToken = tok.access_token;
    console.log('[gmail-reader] Got access token');
  } catch (err) {
    console.error('[gmail-reader] Token error:', err.message);
    return;
  }

  try {
    const since = Math.floor((Date.now() - 25 * 60 * 60 * 1000) / 1000); // 25h buffer
    const q = encodeURIComponent(`in:inbox after:${since} -category:promotions -category:social`);
    const list = await gmailGet(accessToken, `messages?maxResults=50&q=${q}`);
    const messages = list.messages || [];
    console.log(`[gmail-reader] ${messages.length} inbox messages in last 25h`);

    const relevant = [];
    for (const msg of messages.slice(0, 40)) {
      try {
        const detail = await gmailGet(accessToken,
          `messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);
        const hdrs = detail.payload?.headers || [];
        const subject = header(hdrs, 'Subject');
        const from    = header(hdrs, 'From');
        const date    = header(hdrs, 'Date');
        const snippet = detail.snippet || '';
        if (isRelevant(subject, from, snippet)) {
          relevant.push({ subject, from, date, snippet });
        }
      } catch (e) {
        // skip individual message errors
      }
    }

    console.log(`[gmail-reader] ${relevant.length} relevant emails`);

    const briefingPath = path.join(__dirname, '..', 'briefing.json');
    const briefing = fs.existsSync(briefingPath)
      ? JSON.parse(fs.readFileSync(briefingPath, 'utf8'))
      : {};

    briefing.gmail = {
      fetchedAt: new Date().toISOString(),
      account: 'randybarclay1@gmail.com',
      count: relevant.length,
      messages: relevant.slice(0, 20),
    };

    fs.writeFileSync(briefingPath, JSON.stringify(briefing, null, 2));
    console.log('[gmail-reader] Written to briefing.json');
  } catch (err) {
    console.error('[gmail-reader] Error:', err.message);
    // Don't fail the workflow — briefing continues without Gmail data
  }
}

run();
