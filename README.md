# NAPE — Warhammer 40K Attack Calculator

A step-by-step attack resolution tool for Warhammer 40,000 10th edition. Enter your dice rolls manually and follow the full hit → wound → save → FNP sequence, or use auto-roll and let it run. Supports split-target volleys, all major weapon keywords, and live unit lookup via Wahapedia.

## Features

- **Manual dice entry** with a step-by-step resolution log
- **Auto-roll** — generates dice for any phase with one click
- **All major keywords** — Torrent, Lethal Hits, Sustained Hits, Devastating Wounds, Twin-linked, Rapid Fire
- **Rerolls** — hit 1s, failed hits, wound 1s, failed wounds
- **Split Volley** — divide wounds across up to 4 targets, each with their own stats and save dice
- **Cover, Ignore AP, Half Damage, -1 Damage** defensive modifiers
- **Unit lookup** — type a unit or weapon description and fill stats automatically, sourced live from Wahapedia when available
- **Simple / Complex mode**, dark / light theme

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Unit Lookup Setup

The unit lookup feature uses the Claude API to identify units and extract stats. It's optional — the calculator works fine without it.

**1. Get a Claude API key**

Create one at [console.anthropic.com](https://console.anthropic.com). The free tier is sufficient for light use.

**2. Enter it in the app**

Click the gear icon (⚙) in the top-right corner and paste your API key. It's stored in `localStorage` and never leaves your browser.

**3. Use it**

Type a unit or weapon description (e.g. `broadside battlesuits rail rifle`, `space marine intercessor`) in the lookup bar and click **Fill Attacker** or **Fill Defender**. If the description matches a unit with multiple weapons, you'll get a disambiguation list to pick from.

## Wahapedia Live Data (optional)

Without a worker, unit lookups fall back to Claude's training data. With the worker deployed, stats are sourced live from Wahapedia — more accurate and always up to date.

### Deploy your own worker

The worker is a Cloudflare Worker that proxies requests to Wahapedia and searches across all faction pages to find the correct unit URL.

```bash
cd worker
npm install -g wrangler   # if not already installed
wrangler login
wrangler deploy
```

Wrangler will output a URL like `https://nape-wahapedia.<your-account>.workers.dev`.

### Point the app at your worker

Create `.env.local` in the project root:

```
VITE_WAHAPEDIA_WORKER_URL=https://nape-wahapedia.<your-account>.workers.dev
```

Restart the dev server. The source badge on filled units will show `live` instead of `training`.

## Commands

```bash
npm run dev      # dev server
npm run build    # production build
npm run lint     # ESLint
npm test         # Vitest (38 tests)
```

## Tech Stack

- React 19 + Vite 7
- Tailwind CSS v4
- Anthropic SDK (Claude Haiku, browser-direct)
- Cloudflare Workers (Wahapedia proxy + search)
- Vitest + @testing-library/react

## Project Structure

```
src/
  App.jsx              # main UI (~2500 lines, monolithic)
  appReducer.js        # all app state
  calculatorUtils.js   # pure math (hit/wound/save targets)
  useCalculator.js     # main calculation hook
  useCalculatorSplit.js# split-target calculation hook
  claudeService.js     # Claude API + Wahapedia fetch
  useUnitLookup.js     # unit lookup hook
  SettingsPanel.jsx    # API key UI

worker/
  worker.js            # Cloudflare Worker
  wrangler.toml        # worker config

docs/plans/            # implementation design docs
```

## Data Source

Unit stats are sourced from [Wahapedia](https://wahapedia.ru) — a community-maintained reference for Warhammer 40,000 rules. This tool is not affiliated with Games Workshop.
