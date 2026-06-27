// One-time script to authorize Gmail API access and get a refresh token.
//
// Setup: place the downloaded credentials JSON at the project root as
//   gmail-credentials.json   (it is gitignored — never commit it)
//
// Run step 1:  node scripts/gmail-auth.js
// Run step 2:  node scripts/gmail-auth.js <code-from-browser>

const https = require('https');
const fs = require('fs');
const path = require('path');

const credsPath = path.join(__dirname, '..', 'gmail-credentials.json');
if (!fs.existsSync(credsPath)) {
  console.error('Missing gmail-credentials.json in project root.');
  console.error('Download it from Google Cloud Console → Clients → RMFI Briefing → Download JSON');
  process.exit(1);
}

const { installed: creds } = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
const CLIENT_ID = creds.client_id;
const CLIENT_SECRET = creds.client_secret;
const REDIRECT_URI = creds.redirect_uris[0];
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

const code = process.argv[2];

if (!code) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  });
  console.log('\nStep 1 — Visit this URL in your browser:\n');
  console.log(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  console.log('\nAfter you approve, the browser redirects to http://localhost?code=XXXX');
  console.log('Copy JUST the code value (everything after "code=" up to "&") and run:');
  console.log('  node scripts/gmail-auth.js <that-code>\n');
} else {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
    code,
  }).toString();

  const req = https.request({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const tokens = JSON.parse(data);
      if (tokens.refresh_token) {
        console.log('\nSUCCESS — add these three secrets to GitHub Actions:\n');
        console.log('Secret name: GMAIL_CLIENT_ID');
        console.log('Value:', CLIENT_ID);
        console.log('');
        console.log('Secret name: GMAIL_CLIENT_SECRET');
        console.log('Value:', CLIENT_SECRET);
        console.log('');
        console.log('Secret name: GMAIL_REFRESH_TOKEN');
        console.log('Value:', tokens.refresh_token);
        console.log('');
      } else {
        console.error('Error getting tokens:', JSON.stringify(tokens, null, 2));
      }
    });
  });
  req.on('error', console.error);
  req.write(body);
  req.end();
}
