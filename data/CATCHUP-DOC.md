# Randy's Money — Session Catch-Up Document
**Last updated: June 29, 2026**
**Read this file at the start of every new session to restore full context.**

---

## WHO RANDY IS
- Randy Barclay (randybarclay1@gmail.com)
- Owner of RMFI — a precision CNC machine shop
- Not a finance guy; built this entire dashboard with AI assistance
- Building toward a YouTube channel showing the system live ("regular guy built this with AI")
- Also developing a ruggedized solar tilt system for DoD/military market (details below)

---

## THE APP — WHAT IT IS

**URL:** rmfi-tool-app.vercel.app/randys-money.html
**Repo:** github.com/randytoolbox/rmfi-tool-app (branch: main)
**Stack:** Plain HTML/JS frontend, Vercel serverless functions in /api/, GitHub Actions automation

### What the dashboard does:
- Live market strip: S&P, NASDAQ, Gold, Silver, WTI Oil, Brent Oil, BTC, ETH, Fear & Greed
- Robot's Paper Trades: Alpaca paper trading account, auto-buys every weekday 9:35 AM ET
- Stock watchlist with 52-week highs/lows
- Crypto tracker
- Congressional trade tracker (STOCK Act filings)
- Supply chain intelligence (contract awards → supplier watchlist)
- Policy Watch / News
- Morning Briefing (AI-generated email at 7:30 AM ET via GitHub Actions)
- Telegram digest (positions summary to Randy's phone)

---

## CURRENT STATE OF THE DASHBOARD (as of June 29, 2026)

### What's WORKING:
- Gold: ~$4,039 ✅
- Silver: ~$53 ✅
- Brent Oil: ~$73.96 ✅
- Bitcoin, Ethereum ✅
- Fear & Greed ✅
- Total Crypto Market Cap ✅
- Robot paper positions loading from Alpaca ✅
- Morning briefing email arriving at 7:30 AM ✅
- Telegram position digest ✅
- Alpaca bot buying stocks (PLTR, MSFT, LUMN bought June 29) ✅
- HON corporate action day-change filtered (sanePct() catches >±25%) ✅

### What's STILL BROKEN or NEEDS VERIFICATION:
- **WTI Oil** — was showing stale $105.48 (real price ~$70.78). Fix was deployed
  (commit 3df7d3b) but not yet verified in browser. Needs hard refresh (Ctrl+Shift+R)
  to confirm. If still wrong, the browser-side Yahoo Finance fetch for CL=F may be
  getting blocked.
- **52W High/Low** — showing "--" in the generated text report (dashboard display
  is fixed, but the report generator doesn't wait for the 52W batch to complete).
- **BTC Dominance** — showing "--". Client-side CoinGecko fallback was added;
  needs verification.
- **HON in the report** — shows -50.95% day change. The sanePct() filter fixes the
  dashboard display but NOT the text report generator. Report generator needs same filter.
- **Market Regime and Win Rate** — show "--". These populate from trading history
  over time; not a bug, just no history yet.
- **Best Pick score** — shows "--". Populates when screener has run and scored picks.

---

## FIXES MADE THIS SESSION (June 29, 2026)

All committed and pushed to main. Vercel auto-deploys on push.

1. **commit f8d1bcf** — Fixed 52W High/Low data (api/stock.js now captures
   fiftyTwoWeekHigh/Low from Yahoo Finance). Added sanePct() filter to catch
   corporate action day-changes >±25% (fixes HON showing -47%).

2. **commit e149899** — Added client-side browser fallback for 52W data and
   commodity prices. Browser residential IP bypasses Vercel datacenter IP blocks.

3. **commit e6ef1ce** — Actively clears stale commodity prices from localStorage
   cache before re-fetching. Tightened oil price sanity bounds.

4. **commit 4ddb39d** — Futures (GC=F, SI=F, CL=F, BZ=F) now ALWAYS fetched
   browser-side, never via server/Stooq. Stooq returns stale expired-contract
   prices (Gold $373=2008 price, WTI $105=2012 price).

5. **commit 3df7d3b** — CRITICAL BUG FIX: Browser-side Yahoo Finance fetch was
   using encodeURIComponent() which turned CL=F into CL%3DF. Yahoo Finance doesn't
   accept encoded = signs. Changed to raw symbol string. Also tightened WTI/Brent
   bounds to [40,130] so $105 cache gets cleared on load.

---

## KEY TECHNICAL FACTS (don't forget these)

### Why commodity prices were broken:
- Vercel shared datacenter IPs are blocked by Yahoo Finance for batch requests
- Stooq.com is the server-side fallback but returns STALE EXPIRED futures prices
  (gc.f returns ~$373 = 2008 gold price, cl.f returns ~$105 = 2012 WTI price)
- These stale prices PASS non-zero checks and pass loose bounds checks
- Fix: futures always fetched browser-side (residential IP) from Yahoo Finance directly
- Yahoo Finance does NOT accept URL-encoded = signs: CL=F must stay as CL=F, not CL%3DF

### Architecture:
- /api/stock.js — handles single symbol, batch quotes (?syms=), Alpaca positions (?positions), close position (?close=)
- /api/prices.js — crypto prices
- /api/screener.js — swing trade scoring A-D grades
- /scripts/alpaca-buy.js — runs 9:35 AM ET weekdays via GitHub Actions
- /scripts/alpaca-monitor.js — runs 3:45 PM ET weekdays, applies sell rules
- /scripts/morning-briefing.js — runs 11:30 UTC (7:30 AM ET), sends email

### Sell rules (stocks):
- Exit at +5% profit OR -3% loss OR after 5 days — whichever comes first

### Sell rules (crypto):
- Exit at +10% profit OR -5% loss OR after 7 days

### Alpaca credentials (stored in Vercel env vars AND GitHub Actions secrets):
- ALPACA_KEY_ID: stored in Vercel env + GitHub Actions secrets (updated June 29 — old key was revoked)
- ALPACA_SECRET_KEY: stored in secrets, not hardcoded anywhere
- Paper trading only: paper-api.alpaca.markets

### Other secrets (GitHub Actions only, NOT in code):
- RESEND_API_KEY — email sending
- ANTHROPIC_API_KEY — Claude advisor in morning briefing
- GMAIL_CLIENT_ID / SECRET / REFRESH_TOKEN — inbox reading
- TELEGRAM_BOT_TOKEN / CHAT_ID — Randy's phone digest

---

## ROBOT PAPER TRADES — CURRENT POSITIONS (June 29, 2026 ~1 PM)

- LUMN: 41 shares, entry $8.05, now ~$7.95, -$4.02 (-1.22%)
- MSFT: 1 share, entry $370.52, now ~$369.33, -$1.19 (-0.32%)
- PLTR: 2 shares, entry $117.64, now ~$115.96, -$3.36 (-1.43%)
- Total portfolio: ~$99,966 (started at $100,000)
- Cash available: ~$99,042
- No crypto positions — bot will buy tomorrow morning

PLTR note: Palantir received a $150M government contract the same morning the bot
bought it. Good signal alignment even though position is slightly red.

---

## TODAY'S MARKET CONTEXT (June 29, 2026)

- Big news: US and Iran halted hostilities → risk-on rally
- S&P +1.65%, NASDAQ +2.49%, but Fear & Greed at 12 (Extreme Fear) — unusual split
- Crypto not participating in equity rally
- CAT +72.66% YTD — infrastructure/AI construction spending
- BE (Bloom Energy) +178.66% YTD, +9.12% today — data center power play
- QNT -40% YTD, XDC -53% YTD — crypto altcoins struggling
- Congress: member bought GOOGL on June 29
- RTX received $55M payment → HON is watchlist supplier beneficiary

---

## SOLAR TILT SYSTEM PROJECT (Randy's Side Business / DoD Opportunity)

### What it is:
A ruggedized, deployable solar panel mounting system designed for military forward
operating bases, emergency response, and mobile power applications.

### Core Design Philosophy (from Sam's notes):
Simple design yields: reliability, cost reduction, ease of maintenance, low energy
consumption, minimal footprint, rigid framework, extremely low profile, minimal wind
resistance, high wind tolerance, bi-directional tilt, remote control.

### New Features to Add (Sam's input):
- High wind auto-retract
- Autonomous operation
- Updated control circuitry (updated components, miniaturization, reliability)

### DoD Market Context:
From DoD procurement language: "Renewable energy generation and storage promises to
decrease warfighter vulnerability and deliver new operational capabilities. From more
efficient batteries to diversifying energy sources and reduced fuel transportation risks,
renewable energy generation and storage will add resilience and flexibility in a
contested logistics environment."

### Grant / Contract Angles:
- DOE: solar microgrids, off-grid power
- AFWERX: expeditionary power for forward bases
- Frame as enabling "Physical AI deployment" — powering robots in austere environments,
  mobile command for drone/robot SAR teams
- "Buy America" + tariffs on Chinese components = domestic advantage

---

## PHYSICAL AI / ROBOTICS MARKET NOTES

### Key tickers to watch:
- NVDA — compute backbone for all robotics/AI
- TSLA — robotaxi + Optimus humanoid robot
- GOOGL — DeepMind robotics
- SYM (Symbotic) — warehouse automation, Walmart backlog
- AUR (Aurora Innovation) — autonomous trucking
- ASML — near-monopoly on EUV lithography machines needed for advanced AI chips
- LRCX (Lam Research) — wafer etching/deposition equipment, semiconductor manufacturing
- TSM — chip foundry, mentioned alongside NVDA as core Physical AI beneficiary

### "Picks and shovels" thesis (from 247wallst.com article, June 30 2026):
RBC Capital projects a $9T humanoid robotics market by 2050. Robot makers (Tesla
Optimus, Figure AI) will face fierce competition and margin pressure like car makers.
Equipment suppliers (ASML, LRCX) have durable moats and benefit no matter who wins
the robot race — classic toolmaker-beats-end-product pattern seen in internet/smartphone/
AI waves. Good for Policy Watch: semiconductor supply chain, CHIPS Act follow-ons,
export controls on advanced tech to China = volatility + opportunity.

### Trading notes:
- Monitor NVIDIA earnings for robotics revenue growth
- Tesla robotaxi/FSD updates = high volatility events
- Labor unions opposing automation (port bans through 2029) = policy risk
- Tariffs on Unitree (Chinese robots) = bullish for domestic plays
- High-risk/high-reward: lots of hype, timelines have historically slipped

### App suggestion (TO BUILD):
Add a "Physical AI Watchlist" card to the dashboard pulling:
- TSLA, NVDA, SYM, AUR, GOOGL prices + day change
- Latest news on robot deployments
- Congress buys in these names

---

## YOUTUBE VIDEO

Script was written and Randy filmed on June 29, 2026.
Full script is in data/randy-notes-2026-06-29.md.

Channel angle: "Regular guy, CNC shop owner, built a trading system with AI — showing
wins AND losses in public." Transparency is the brand.

---

## OUTSTANDING TO-DO LIST

### Dashboard fixes needed (HIGH PRIORITY — do first):
1. Verify WTI Oil now shows ~$70 after hard refresh (commit 3df7d3b fix)
2. Fix HON day-change in text report generator (apply sanePct filter there too)
3. Verify BTC Dominance is populating
4. Fix 52W data showing "--" in generated report text
5. Add "Physical AI / Semiconductor Watchlist" card (TSLA, NVDA, SYM, AUR, ASML,
   LRCX, TSM) with mini-charts and consistent Day $/YTD/52W data on every tile
6. Add LRCX to Robot Paper Trades simulation list — show simulated vs actual performance
7. Policy Watch: add semiconductor/chip keywords (tariffs, CHIPS Act, export controls)

### New features (next wave, after high-priority fixes):
1. Swing Trade Ideas card — combine Congress trades + news + technicals into a single
   signal (e.g. "LRCX dip buy zone near $X")
2. Beginner Learning Mode — tooltips explaining terms on each tile ("What is volatility?")
3. Expand CSV export to cover full portfolio + watchlist, not just one view
4. Daily Briefing Summary screen — one view pulling top signals, robot performance, news

### Marketing / launch (last week before going public):
1. Prepare 5-10 demo screenshots or a 1-minute walkthrough video
2. X/Twitter thread ideas: "How my robot paper traded LRCX this week", "Congress buys
   in semis — what it means"
3. Target communities: r/stocks, r/Daytrading, trading Discord groups

### Quick wins (no Claude session needed):
1. Add ASML, LRCX and other semiconductor peers to the watchlist manually
2. Document the robot's current buy/sell rules clearly for when showing others
3. Test the app on different devices/browsers

### Solar system project:
1. Write capability statement / one-pager for DoD/AFWERX
2. Research AFWERX open BAAs for expeditionary power
3. Document full spec sheet for Sam's review

### YouTube / content:
1. Post first video
2. Plan episode 2 (show a week of bot trading, wins + losses)

---
*End of catch-up document. Share this file with Claude at the start of the next session.*
