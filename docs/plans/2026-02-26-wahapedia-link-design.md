# Wahapedia Live Lookup Design

**Date:** 2026-02-26

## Goal

Replace Claude's training-data-only unit lookup with a two-phase lookup that fetches the actual Wahapedia datasheet, returning higher-confidence stats, a clickable unit page link, and a clear source indicator (live vs training fallback). Also fix dice notation to handle `2D6`, `D6+1`, `D3`, etc.

## Architecture

### Phase 1 — URL resolution (fast Claude call)
Claude receives the user's unit/weapon description and returns only a Wahapedia path string, e.g. `tau-empire/Crisis-Battlesuits`. Low token cost (~50 tokens).

### Phase 2 — Page fetch + stat extraction
A Cloudflare Worker (free tier, ~20 lines) acts as a CORS proxy:
- Accepts `GET /wahapedia?path={encoded-path}`
- Fetches `https://wahapedia.ru/wh40k10ed/factions/{path}`
- Strips HTML to plain text, returns `{ text, url }` on 200 or `{ error: "not_found" }` on 404/error

A second Claude call receives the stripped page text (or falls back to training data if the fetch failed) and returns the stats JSON plus metadata fields.

### Source indicator
- `source: "live"` — real page content was fetched
- `source: "training"` — 404 or network error; fell back to training data

### Fallback guarantee
If the worker fails for any reason (wrong URL, Wahapedia down, network error), the lookup falls back to training-data behaviour — same quality as today, never an error.

## Data contract

`fetchAttackerStats` and `fetchDefenderStats` return:
```js
{
  // existing stats fields (attacksFixed, attacksValue, toHit, …)
  wahapediaUrl: "https://wahapedia.ru/wh40k10ed/factions/tau-empire/Crisis-Battlesuits",
  source: "live" | "training",
  fetchedAt: "2026-02-26T21:00:00Z"  // ISO string, only present when source === "live"
}
```

## Dice notation

System prompts updated to explicitly enumerate accepted formats: `D3`, `D6`, `2D6`, `D6+1`, `D3+3`, `2D3+1`. `mapToWeaponFields` already accepts any string for attacks/damage — no logic change needed, only prompt and schema clarity.

## UI changes

Current generic "Stats from Claude's training data — verify on Wahapedia" message replaced with:

| source | Display |
|--------|---------|
| `"live"` | `✓ Pulled from Wahapedia · HH:MM UTC` + linked unit name |
| `"training"` | `⚠ Training data only — verify on Wahapedia` + generic link |

Both attacker and defender sections get their own independent source indicator.

## Cloudflare Worker

Single `worker.js` file. Endpoint:
```
GET https://<worker-subdomain>.workers.dev/wahapedia?path=tau-empire%2FCrisis-Battlesuits
```

CORS header: `Access-Control-Allow-Origin: *` (public read-only proxy).

Free tier: 100k requests/day — sufficient for realistic usage.

## Files changed

| File | Change |
|------|--------|
| `worker/worker.js` | New — Cloudflare Worker source |
| `worker/wrangler.toml` | New — Worker config |
| `src/claudeService.js` | Two-phase lookup, updated prompts, new return fields |
| `src/useUnitLookup.js` | Store `attackerMeta`/`defenderMeta` (source, url, fetchedAt) |
| `src/App.jsx` | Replace static disclaimer with dynamic source indicator |
| `src/claudeService.test.js` | Tests for new return fields and fallback path |

## Out of scope

- No local datasheet database
- No authentication on the worker (public read-only)
- No caching layer (Wahapedia is fast; free tier is generous)
