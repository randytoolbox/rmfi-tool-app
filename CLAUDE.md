# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains two distinct applications sharing a single Vercel deployment:

1. **RMFI Tool Library** (`index.html`) — Browser UI for searching and matching precision machining tools from a CSV database (`RMFI_Tool_Database_Master_CLEANED_app_ready_PLUS_Series140.csv`).
2. **Randy's Money** (`randys-money.html`) — A paper trading and financial monitoring dashboard backed by serverless API endpoints and GitHub Actions automation.

## Stack

- **Runtime**: Node.js (vanilla JS, no framework)
- **Frontend**: Plain HTML/CSS (no build step, no bundler, no JS framework)
- **Hosting**: Vercel (serverless functions in `/api/`)
- **Automation**: GitHub Actions (scheduled trading workflows in `.github/workflows/`)
- **External data**: Alpaca API (stock/crypto prices + paper trading), Yahoo Finance v8, CoinCap, CryptoCompare, Resend (email), Congress.gov

## Commands

There are no npm scripts. There is no build step.

- **Install dependencies**: `npm install`
- **Local development**: `npx vercel dev` (runs serverless functions locally)
- **Deploy**: push to `main` — Vercel auto-deploys
- **Run a script manually**: `node scripts/<script>.js` (requires env vars set locally)
- **Generate PDF from tool DB**: `python3 make_pdf.py`

## Architecture

### API (`/api/`)

Each file exports a single Vercel serverless handler:

```js
module.exports = async function handler(req, res) { ... }
```

All handlers follow the same pattern: parse query params → fetch external data with `AbortSignal.timeout(8000-9000ms)` → return JSON. Most use in-memory caching with a TTL (30s for prices, up to 6h for screener results).

Key endpoints:
- `stock.js` — current price + 52-week high/low from Alpaca
- `screener.js` — 2-year weekly swing-trade scoring (grades A–D), batches 5 symbols at a time, caches 6h
- `prices.js` / `scan.js` — crypto data with CoinCap → CryptoCompare → Yahoo Finance fallback chain
- `congress.js` / `house-traders.js` — congressional trade surveillance (scrapes `disclosures.house.gov`)
- `earnings.js` — next earnings dates

### Automation Scripts (`/scripts/`)

Run by GitHub Actions on a schedule (Mon–Fri):
- `alpaca-buy.js` (9:35am ET) — scores watchlist by distance from 52W high + daily % change, places paper buy orders (max 3 stock / 2 crypto positions, ~$200–$333/slot)
- `alpaca-monitor.js` (3:45pm ET) — checks P&L, applies sell rules, sends daily report via Resend
- `crypto-buy.js` (9:35am ET) — same pattern as alpaca-buy but for crypto
- `morning-picks.js` — generates morning stock picks

Sell rules: stocks exit at ±5%/−3% or 5 days; crypto at ±10%/−5% or 7 days.

### Frontend (`/`)

- `index.html` (~1850 lines) — loads the CSV client-side via SheetJS (CDN), pure DOM manipulation
- `randys-money.html` (~3800 lines) — calls `/api/*` endpoints, renders charts/tables with vanilla JS
- `tracker.html` — lightweight standalone tracker

No build pipeline — edits to HTML files are live immediately on deploy.

## Environment Variables

All secrets live in GitHub Actions Secrets and Vercel environment variables. There is no `.env` file committed.

| Variable | Used by |
|---|---|
| `ALPACA_KEY_ID` | scripts/, api/stock.js |
| `ALPACA_SECRET_KEY` | scripts/, api/stock.js |
| `RESEND_API_KEY` | scripts/alpaca-monitor.js |

## Key Conventions

- **CORS**: All API responses include `Access-Control-Allow-Origin: *`.
- **User-Agent spoofing**: External fetches use a browser UA string to avoid blocks.
- **Fallback chains**: Crypto data always tries CoinCap → CryptoCompare → Yahoo Finance in order. Don't remove a fallback without confirming the primary source is reliable.
- **Graceful degradation**: Handlers return partial/cached data on fetch failures rather than throwing. External errors are caught and logged, never propagated as 500s.
- **Vercel timeouts**: Each function has a timeout configured in `vercel.json` (15–55s). If adding a slow endpoint, add it there.
- **No TypeScript, no tests, no linter** — this is intentional for this project's scope.
