// Telegram bot webhook handler.
// Commands: /portfolio /buys /briefing /claude /help
// Registered via: scripts/telegram-setup.js

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALPACA_KEY_ID      = process.env.ALPACA_KEY_ID;
const ALPACA_SECRET_KEY  = process.env.ALPACA_SECRET_KEY;
const REPO_RAW = 'https://raw.githubusercontent.com/randytoolbox/rmfi-tool-app/main';

async function send(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

async function alpaca(path) {
  const r = await fetch(`https://paper-api.alpaca.markets${path}`, {
    headers: { 'APCA-API-KEY-ID': ALPACA_KEY_ID, 'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY },
    signal: AbortSignal.timeout(8000),
  });
  return r.json();
}

async function repoFile(file) {
  const r = await fetch(`${REPO_RAW}/${file}`, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`${file} not found`);
  return r.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST' || !TELEGRAM_BOT_TOKEN) {
    return res.status(200).json({ ok: true });
  }
  const message = req.body?.message;
  if (!message?.text) {
    return res.status(200).json({ ok: true });
  }

  const chatId = message.chat.id;
  const cmd = message.text.split(' ')[0].toLowerCase().replace(/@.*/, '');

  try {
    if (cmd === '/start' || cmd === '/help') {
      await send(chatId,
        `<b>Randy's Money Bot 🤖</b>\n\n` +
        `/portfolio — Paper trading P&amp;L + open positions\n` +
        `/buys — What the bot bought today\n` +
        `/briefing — Top news headlines\n` +
        `/claude — Claude's market take\n` +
        `/chatid — Your chat ID (for setup)\n` +
        `/help — This menu`
      );

    } else if (cmd === '/chatid') {
      await send(chatId, `Your chat ID is: <code>${chatId}</code>\nAdd this as TELEGRAM_CHAT_ID in GitHub Secrets.`);

    } else if (cmd === '/portfolio') {
      const [account, positions] = await Promise.all([
        alpaca('/v2/account'),
        alpaca('/v2/positions'),
      ]);
      let msg = `<b>📊 Paper Portfolio</b>\n\n`;
      msg += `💰 Value:  $${parseFloat(account.portfolio_value || 0).toFixed(2)}\n`;
      msg += `📈 P&amp;L:   $${parseFloat(account.unrealized_pl || 0).toFixed(2)}\n`;
      msg += `💵 Cash:   $${parseFloat(account.cash || 0).toFixed(2)}\n`;
      if (Array.isArray(positions) && positions.length) {
        msg += `\n<b>Positions (${positions.length}):</b>\n`;
        positions.forEach(p => {
          const pct = (parseFloat(p.unrealized_plpc) * 100).toFixed(1);
          const dir = parseFloat(p.unrealized_pl) >= 0 ? '🟢' : '🔴';
          msg += `${dir} ${p.symbol}  $${parseFloat(p.current_price).toFixed(2)}  (${pct >= 0 ? '+' : ''}${pct}%)\n`;
        });
      } else {
        msg += `\nNo open positions.`;
      }
      await send(chatId, msg);

    } else if (cmd === '/buys') {
      const log = await repoFile('data/buy-log.json');
      let msg = `<b>🤖 Bot's Last Run — ${log.date}</b>\n`;
      msg += `SPY: ${log.spyTrend != null ? log.spyTrend + '%' : 'N/A'}\n\n`;
      if (log.trades?.length) {
        log.trades.forEach(t => {
          msg += `✅ ${t.symbol}  $${t.notional}  score ${t.score}\n`;
        });
      } else {
        msg += `Nothing bought.`;
      }
      if (log.topCandidates?.length) {
        msg += `\n<b>Top scored:</b> ${log.topCandidates.slice(0,5).map(c=>`${c.symbol}(${c.score})`).join(', ')}`;
      }
      await send(chatId, msg);

    } else if (cmd === '/briefing') {
      const b = await repoFile('briefing.json');
      const high = (b.articles || []).filter(a => a.analysis?.urgency === 'high').slice(0, 5);
      const date = b.generatedAt ? new Date(b.generatedAt).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) : 'today';
      let msg = `<b>📰 Top Headlines — ${date}</b>\n`;
      msg += `${(b.articles||[]).filter(a=>a.analysis).length} articles analyzed\n\n`;
      if (high.length) {
        high.forEach((a, i) => {
          msg += `${i+1}. <b>${a.title}</b>\n`;
          if (a.analysis?.insight) msg += `   → ${a.analysis.insight.slice(0,100)}\n`;
          msg += '\n';
        });
      } else {
        msg += `No high-urgency articles yet.`;
      }
      await send(chatId, msg);

    } else if (cmd === '/claude') {
      const b = await repoFile('briefing.json');
      const adv = b.claudeAdvice;
      if (!adv) {
        await send(chatId, `⏳ Claude's take isn't ready yet — runs at 7:30am ET.\n\nTry /briefing for raw headlines.`);
        return;
      }
      const emoji = adv.marketMood === 'bullish' ? '🟢' : adv.marketMood === 'cautious' ? '🔴' : '🟡';
      let msg = `<b>🧠 Claude's Take</b> ${emoji} ${(adv.marketMood||'').toUpperCase()}\n\n`;
      msg += `<b>📈 Top Trade:</b>\n${adv.topTrade}\n\n`;
      msg += `<b>⚠️ Red Flag:</b>\n${adv.redFlag}\n\n`;
      msg += `<b>🎯 Wildcard:</b>\n${adv.wildcard}`;
      if (adv.watchTickers?.length) msg += `\n\n👀 Watch: ${adv.watchTickers.join(', ')}`;
      await send(chatId, msg);

    } else {
      await send(chatId, `Unknown command. Type /help for the menu.`);
    }
  } catch(e) {
    console.error('Telegram handler error:', e.message);
    await send(chatId, `❌ Error: ${e.message}`).catch(() => {});
  }

  return res.status(200).json({ ok: true });
};
