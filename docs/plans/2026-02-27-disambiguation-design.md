# Disambiguation + Resolved Name Design

**Date:** 2026-02-27

## Goal

When filling attacker or defender stats from a unit description, the app should:

1. **Always show what was resolved** — the badge displays the specific weapon or unit name that was selected (e.g. "Intercessor bolt rifle · Pulled from Wahapedia")
2. **Ask before filling when ambiguous** — attacker: ambiguous when multiple weapons available; defender: ambiguous when multiple units could match. Single match = fill immediately, no prompt.

---

## Service Layer (`claudeService.js`)

### Updated system prompts

Both attacker and defender prompts are updated to return one of two shapes:

```json
{ "type": "stats", "resolvedName": "Intercessor with Bolt Rifle", ...statFields }
{ "type": "options", "options": ["Bolt Rifle", "Auto Bolt Rifle", "Stalker Bolt Rifle"] }
```

**Attacker prompt** — after resolving the unit, if the input doesn't clearly name a specific weapon, return `options` with the full weapon list for that unit. Only return `stats` directly if the weapon is unambiguous from the input.

**Defender prompt** — return `options` if the query could match multiple distinct units (e.g. "fire dragon warriors" → Fire Warriors, Fire Dragons). Return `stats` directly if the unit is clearly identified. Weapon choice is irrelevant here.

### Return shapes from `fetchAttackerStats` / `fetchDefenderStats`

```js
// Unambiguous path — same as today but with resolvedName added to meta
{ type: "stats", fields, meta: { source, wahapediaUrl, fetchedAt, resolvedName } }

// Disambiguation needed — page text cached for second call
{ type: "disambiguation", options: [...], pageCache: { pageText, wahapediaUrl, source, fetchedAt } }
```

### New helper functions

`fetchAttackerStatsFromPage(description, chosenWeapon, pageCache, apiKey)` and `fetchDefenderStatsFromPage(description, chosenUnit, pageCache, apiKey)` — skip path resolution and Wahapedia fetch entirely, run stat extraction only with the chosen weapon/unit injected into the user message. Used for the second call after disambiguation.

---

## Hook Layer (`useUnitLookup.js`)

### New state

- `attackerOptions` / `defenderOptions` — array of option strings, or `null`
- `attackerPageCache` / `defenderPageCache` — cached `{ pageText, wahapediaUrl, source, fetchedAt }` from the first call, or `null`

### Behaviour changes

- `fillAttacker(dispatch)` / `fillDefender(dispatch)` — when service returns `type: "disambiguation"`, store options + pageCache in state, do NOT dispatch. When service returns `type: "stats"`, dispatch and clear any existing options/cache (same as today plus `resolvedName` in meta).
- New `resolveAttacker(dispatch, choice)` / `resolveDefender(dispatch, choice)` — called when user clicks a chip. Calls the `fromPage` helper with cached page text, dispatches on success, clears options/cache.

---

## UI Layer (`App.jsx`)

### New `DisambiguationChips` component

Renders in the same slot as `LookupSourceBadge` (below the fill input row). Shows when `attackerOptions` / `defenderOptions` is non-null.

```
Multiple options — pick one:
[Bolt Rifle] [Auto Bolt Rifle] [Stalker Bolt Rifle] [Heavy Bolt Rifle] ...
```

Chips are small pill buttons that wrap onto multiple lines. While the second call is loading, all chips are disabled. On success, chips are replaced by the badge.

### Updated `LookupSourceBadge`

Gains `resolvedName` display:

- Live: `✓ Intercessor bolt rifle · Wahapedia · 14:32 BST`
- Training: `⚠ Intercessor bolt rifle · training data — verify on Wahapedia`

If `resolvedName` is absent (shouldn't happen in normal flow, defensive), badge falls back to current format.

---

## Files Changed

| File | Change |
|------|--------|
| `src/claudeService.js` | Updated prompts, new return shapes, new `fromPage` helpers |
| `src/useUnitLookup.js` | New options/pageCache state, resolve functions |
| `src/App.jsx` | `DisambiguationChips` component, updated `LookupSourceBadge` |
| `src/claudeService.test.js` | Tests for new `fromPage` helpers and disambiguation return shape |
| `src/useUnitLookup.test.js` | Tests for options state, resolve functions |

---

## Out of Scope

- Caching resolved paths/pages across sessions
- Cancelling an in-flight lookup
- Multi-select (picking more than one weapon at once)
