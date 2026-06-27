// One-time script to register the Telegram webhook with your bot.
// Run once after deploying to Vercel:
//   TELEGRAM_BOT_TOKEN=<token> VERCEL_URL=<your-deployment.vercel.app> node scripts/telegram-setup.js

const TOKEN      = process.env.TELEGRAM_BOT_TOKEN;
const VERCEL_URL = process.env.VERCEL_URL || 'rmfi-tool-app.vercel.app';

if (!TOKEN) {
  console.error('Set TELEGRAM_BOT_TOKEN first');
  process.exit(1);
}

const webhookUrl = `https://${VERCEL_URL}/api/telegram`;

fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message'] }),
})
  .then(r => r.json())
  .then(data => {
    if (data.ok) {
      console.log(`✅ Webhook registered: ${webhookUrl}`);
    } else {
      console.error('❌ Failed:', JSON.stringify(data));
    }
  })
  .catch(e => console.error('Error:', e.message));
