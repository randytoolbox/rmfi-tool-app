const TRUMP_ID = '107780257626128497';
const BASE          = 'https://truthsocial.com';
const UA            = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

// Module-level token cache (persists between warm invocations)
let cachedToken  = null;
let tokenExpiry  = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const username      = process.env.TRUTH_SOCIAL_USERNAME;
  const password      = process.env.TRUTH_SOCIAL_PASSWORD;
  const client_id     = process.env.TRUTH_SOCIAL_CLIENT_ID;
  const client_secret = process.env.TRUTH_SOCIAL_CLIENT_SECRET;
  if (!username || !password || !client_id || !client_secret) {
    throw Object.assign(new Error('credentials_missing'), { status: 501 });
  }

  const r = await fetch(`${BASE}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({
      client_id,
      client_secret,
      username,
      password,
      grant_type:    'password',
      scope:         'read',
    }),
  });

  if (!r.ok) {
    const body = await r.text().catch(() => '');
    if (body.includes('unavailable in your area')) throw Object.assign(new Error('geoblocked'), { status: 403 });
    if (body.includes('you have been blocked'))    throw Object.assign(new Error('cf_blocked'),  { status: 403 });
    throw Object.assign(new Error(`auth_${r.status}`), { status: 502 });
  }

  const d = await r.json();
  cachedToken = d.access_token;
  tokenExpiry  = Date.now() + 23 * 60 * 60 * 1000; // cache 23 h
  return cachedToken;
}

function cleanHtml(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const token = await getToken();

    const r = await fetch(
      `${BASE}/api/v1/accounts/${TRUMP_ID}/statuses?limit=20&exclude_replies=true`,
      { headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA } },
    );

    if (r.status === 401) {
      cachedToken = null; // force re-auth next time
      throw Object.assign(new Error('token_expired'), { status: 502 });
    }
    if (!r.ok) throw Object.assign(new Error(`api_${r.status}`), { status: 502 });

    const statuses = await r.json();

    const posts = statuses.map(s => ({
      id:         s.id,
      content:    cleanHtml(s.content),
      created_at: s.created_at,
      url:        s.url || `${BASE}/@realDonaldTrump/${s.id}`,
      reblog:     s.reblog
        ? { content: cleanHtml(s.reblog.content), url: s.reblog.url }
        : null,
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.json({ posts });
  } catch (e) {
    return res.status(e.status || 502).json({ error: e.message });
  }
};
