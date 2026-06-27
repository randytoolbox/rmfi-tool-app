#!/usr/bin/env node
// Reads today's briefing.json + buy-log, asks Claude Sonnet for actionable
// trading + RMFI advice, emails Randy via Resend.
// Runs in GitHub Actions immediately after morning-briefing.js.

const fs   = require('fs');
const path = require('path');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY    = process.env.RESEND_API_KEY;
const TO_EMAIL          = 'randybarclay1@gmail.com';

async function main() {
  if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1); }
  if (!RESEND_API_KEY)    { console.error('RESEND_API_KEY not set');    process.exit(1); }

  // Read today's briefing
  const briefingPath = path.join(__dirname, '..', 'briefing.json');
  if (!fs.existsSync(briefingPath)) {
    console.error('briefing.json not found — skipping advisor'); return;
  }
  const briefing = JSON.parse(fs.readFileSync(briefingPath, 'utf8'));

  // Read latest buy-log (what the bot bought most recently)
  let buyLog = null;
  const buyLogPath = path.join(__dirname, '..', 'data', 'buy-log.json');
  if (fs.existsSync(buyLogPath)) buyLog = JSON.parse(fs.readFileSync(buyLogPath, 'utf8'));

  // Read trade history summary
  let tradeHistory = null;
  const histPath = path.join(__dirname, '..', 'data', 'trade-history.json');
  if (fs.existsSync(histPath)) tradeHistory = JSON.parse(fs.readFileSync(histPath, 'utf8'));

  const articles    = briefing.articles || [];
  const allAnalyzed = articles.filter(a => a.analysis);
  const highUrgency = allAnalyzed.filter(a => a.analysis.urgency === 'high');

  if (allAnalyzed.length === 0) {
    console.log('No analyzed articles — skipping advisor email');
    return;
  }

  const articleDigest = allAnalyzed.map(a =>
    `[${a.analysis.category} | ${a.analysis.urgency}] ${a.title}\n  → ${a.analysis.insight}\n  Tickers: ${(a.analysis.tickers||[]).join(', ')||'none'}\n  RMFI: ${a.analysis.rmfi || 'none'}`
  ).join('\n\n');

  // Gmail section (added by gmail-reader.js)
  const gmailData    = briefing.gmail;
  const gmailDigest  = gmailData?.messages?.length
    ? `\nRANDY'S INBOX (${gmailData.messages.length} relevant emails from last 24h):\n` +
      gmailData.messages.map(m => `  • [${m.from.replace(/<.*>/, '').trim()}] ${m.subject}\n    ${m.snippet?.slice(0, 120)}`).join('\n')
    : '';

  const botContext = buyLog ? `
Bot's last run (${buyLog.date}):
- SPY trend: ${buyLog.spyTrend !== null ? buyLog.spyTrend + '%' : 'unknown'}
- Bought: ${buyLog.trades?.map(t => `${t.symbol} score=${t.score} $${t.notional}`).join(', ') || 'nothing'}
- Top scored: ${buyLog.topCandidates?.slice(0,5).map(c => `${c.symbol}(${c.score})`).join(', ') || 'none'}` : '';

  const histContext = tradeHistory?.summary
    ? `Bot all-time: ${tradeHistory.summary.totalTrades} trades, ${tradeHistory.summary.winRate}% win rate, $${tradeHistory.summary.totalPL} P&L`
    : '';

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  });

  const prompt = `You are giving Randy his morning briefing analysis. Randy owns RMFI (precision machining manufacturer — defense/aerospace/industrial clients) and runs an automated paper trading bot on Alpaca.

TODAY: ${today}
${botContext}
${histContext}

TODAY'S NEWS (${allAnalyzed.length} articles):
${articleDigest}
${gmailDigest}
Give Randy direct, specific, actionable advice. Return ONLY valid JSON:
{
  "topTrade": "The single most important stock to watch or consider this week — name a specific ticker, the specific catalyst from today's news, and exactly what to watch for. Be direct, not generic.",
  "redFlag": "Anything from today's news that signals caution or could hurt current positions. If nothing, say 'No red flags today.'",
  "rmfiAction": "The single most actionable RMFI business development move — be specific: which company to call, what program or contract to target, what to pitch. Not generic advice.",
  "watchTickers": ["TICK1","TICK2","TICK3"],
  "marketMood": "bullish, neutral, or cautious",
  "wildcard": "One thing flying under the radar from today's news that could matter next week."
}`;

  console.log(`Calling Claude Sonnet for morning advice (${allAnalyzed.length} articles)...`);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':          ANTHROPIC_API_KEY,
      'anthropic-version':  '2023-06-01',
      'content-type':       'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 1000,
      messages:   [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!r.ok) {
    console.error('Claude API error:', r.status, await r.text());
    process.exit(1);
  }

  const data  = await r.json();
  const text  = data.content?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) { console.error('No JSON in Claude response:', text); process.exit(1); }

  const advice = JSON.parse(match[0]);
  console.log('Mood:', advice.marketMood);
  console.log('Top trade:', advice.topTrade?.slice(0, 80));

  // Save advice back to briefing.json so Telegram /claude command can read it
  briefing.claudeAdvice = advice;
  fs.writeFileSync(briefingPath, JSON.stringify(briefing, null, 2));

  // ── Build email ───────────────────────────────────────────────────────────
  const moodColor  = advice.marketMood === 'bullish' ? '#4ade80' : advice.marketMood === 'cautious' ? '#f87171' : '#f59e0b';
  const watchBadges = (advice.watchTickers || []).map(t =>
    `<span style="display:inline-block;background:#0d2d1a;border:1px solid #4caf50;color:#4caf50;border-radius:4px;font-size:11px;font-weight:900;padding:2px 10px;margin:2px;">${t}</span>`
  ).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="background:#030d18;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;">

  <div style="background:#0f1f3a;border:2px solid #1a3a5c;border-radius:12px;padding:20px 24px;margin-bottom:20px;">
    <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:4px;">🧠 Claude's Morning Take</div>
    <div style="color:#6aaeff;font-size:13px;">${today}</div>
    <div style="margin-top:10px;">
      <span style="background:${moodColor}22;border:1px solid ${moodColor};color:${moodColor};border-radius:20px;padding:3px 14px;font-size:12px;font-weight:700;">
        ${advice.marketMood?.toUpperCase() || 'NEUTRAL'}
      </span>
      <span style="color:#555;font-size:11px;margin-left:10px;">${allAnalyzed.length} articles · ${highUrgency.length} high-urgency</span>
    </div>
  </div>

  <div style="background:#0a1a2e;border-radius:10px;padding:16px 18px;margin-bottom:14px;border-left:4px solid #4ade80;">
    <div style="color:#4ade80;font-size:10px;font-weight:900;letter-spacing:.5px;margin-bottom:8px;">📈 TOP TRADE THIS WEEK</div>
    <div style="color:#e0d7ff;font-size:13px;line-height:1.6;">${advice.topTrade}</div>
  </div>

  <div style="background:#0a1a2e;border-radius:10px;padding:16px 18px;margin-bottom:14px;border-left:4px solid #f59e0b;">
    <div style="color:#f59e0b;font-size:10px;font-weight:900;letter-spacing:.5px;margin-bottom:8px;">🏭 RMFI ACTION ITEM</div>
    <div style="color:#e0d7ff;font-size:13px;line-height:1.6;">${advice.rmfiAction}</div>
  </div>

  <div style="background:#0a1a2e;border-radius:10px;padding:16px 18px;margin-bottom:14px;border-left:4px solid #f87171;">
    <div style="color:#f87171;font-size:10px;font-weight:900;letter-spacing:.5px;margin-bottom:8px;">⚠️ RED FLAG</div>
    <div style="color:#e0d7ff;font-size:13px;line-height:1.6;">${advice.redFlag}</div>
  </div>

  <div style="background:#0a1a2e;border-radius:10px;padding:16px 18px;margin-bottom:14px;border-left:4px solid #a78bfa;">
    <div style="color:#a78bfa;font-size:10px;font-weight:900;letter-spacing:.5px;margin-bottom:8px;">🎯 WILDCARD</div>
    <div style="color:#e0d7ff;font-size:13px;line-height:1.6;">${advice.wildcard}</div>
  </div>

  ${watchBadges ? `
  <div style="background:#0a1a2e;border-radius:10px;padding:14px 18px;margin-bottom:14px;">
    <div style="color:#6aaeff;font-size:10px;font-weight:900;letter-spacing:.5px;margin-bottom:8px;">👀 TICKERS TO WATCH</div>
    ${watchBadges}
  </div>` : ''}

  ${gmailData?.messages?.length ? `
  <div style="background:#0a1a2e;border-radius:10px;padding:16px 18px;margin-bottom:14px;border-left:4px solid #38bdf8;">
    <div style="color:#38bdf8;font-size:10px;font-weight:900;letter-spacing:.5px;margin-bottom:10px;">📬 YOUR INBOX (${gmailData.messages.length} relevant emails)</div>
    ${gmailData.messages.slice(0,8).map(m => `
    <div style="padding:8px 0;border-bottom:1px solid #0f2540;">
      <div style="color:#94a3b8;font-size:11px;">${m.from.replace(/<.*>/, '').trim()}</div>
      <div style="color:#e0e7ff;font-size:12px;font-weight:600;margin:2px 0;">${m.subject}</div>
      <div style="color:#64748b;font-size:11px;">${(m.snippet||'').slice(0,100)}</div>
    </div>`).join('')}
  </div>` : ''}

  ${buyLog ? `
  <div style="background:#070f1a;border-radius:8px;padding:10px 16px;margin-bottom:14px;">
    <div style="color:#444;font-size:11px;">Bot last ran ${buyLog.date} · bought: ${buyLog.trades?.map(t=>t.symbol).join(', ')||'nothing'}</div>
    ${histContext ? `<div style="color:#444;font-size:11px;margin-top:2px;">${histContext}</div>` : ''}
  </div>` : ''}

  <div style="text-align:center;margin-top:20px;">
    <a href="https://rmfi-tool-app.vercel.app/randys-money.html" style="color:#4ade80;font-weight:700;text-decoration:none;margin-right:20px;">Dashboard →</a>
    <a href="https://rmfi-tool-app.vercel.app/briefing.html" style="color:#6aaeff;font-weight:700;text-decoration:none;">Full Briefing →</a>
  </div>
  <p style="color:#333;font-size:11px;text-align:center;margin-top:16px;">Claude's analysis · not financial advice · paper trading only</p>
</body></html>`;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    "Claude's Take <onboarding@resend.dev>",
      to:      [TO_EMAIL],
      subject: `🧠 Claude's Take — ${today} [${(advice.marketMood||'neutral').toUpperCase()}]`,
      html,
    }),
  });

  const result = await emailRes.json();
  if (!emailRes.ok) { console.error('Email error:', result); process.exit(1); }
  console.log('Claude advisor email sent:', result.id);
}

main().catch(e => { console.error(e); process.exit(1); });
