# Natural Language Unit Lookup — Design Doc
**Date:** 2026-02-26
**Project:** NAPE – A Warhammer 40K Attack Calculator

## Overview

Add a natural language unit lookup feature that lets users type a unit name (with fuzzy/misspelling tolerance) and auto-fill attacker or defender stats via the Claude API, called directly from the browser.

## Architecture

- `@anthropic-ai/sdk` called directly from the browser — no backend
- API key entered by user, stored in `localStorage` under key `nape_claude_api_key`
- Model: `claude-haiku-4-5-20251001` — fast and cheap for structured JSON extraction
- Two independent Claude calls: one for attacker, one for defender

## UX

1. **Text input bar** at the top of the app — always visible, single field
   - Examples: `"crisis commander plasma rifle"`, `"canoptek doomstalker"`, `"spase marin"` (fuzzy ok)
2. **"Fill Attacker" button** on the attacker stat panel — fills attacker fields only
3. **"Fill Defender" button** on the defender stat panel — fills defender fields only
4. **Loading spinner** replaces button text during API call
5. **Inline error** below button on failure: *"Couldn't identify unit — try a different description"*
6. **Disclaimer** after successful fill: *"Stats from Claude's training data — verify against your datasheet or Wahapedia"*
7. **Gear icon** in app header opens settings panel with masked API key input and clear button
   - If key absent: Fill buttons show tooltip *"Add your Claude API key in settings"*

## Fields Filled

**Attacker fields:**
- `attacks`, `bs`, `strength`, `ap`, `damage`
- Keywords: `torrent`, `lethalHits`, `sustainedHits`, `sustainedHitsN`, `devastatingWounds`, `twinLinked`

**Defender fields:**
- `toughness`, `save`, `invulnSave`, `fnpSave`
- Reanimation Protocols mapped to `fnpSave: 5`

## Prompt Design

- System prompt instructs Claude to return **only valid JSON** with exact field names
- Handles misspellings and partial names natively (no extra logic needed)
- Picks most common/standard loadout if none specified
- No prose, no markdown — raw JSON only

### Example system prompt
```
You are a Warhammer 40K 10th edition rules expert. Given a unit description, return ONLY a JSON object with these fields (omit fields you are unsure of):

Attacker: { "attacks": number|string, "bs": number, "strength": number, "ap": number, "damage": number|string, "torrent": bool, "lethalHits": bool, "sustainedHits": bool, "sustainedHitsN": number, "devastatingWounds": bool, "twinLinked": bool }

Use your best judgement for misspellings and partial names. Pick the standard loadout if none is specified. Return ONLY the JSON object, nothing else.
```

## Settings Panel

- Gear icon in app header (top right)
- Inline panel (not modal) with masked API key input
- Save button writes to `localStorage`
- Clear button removes key
- Key: `nape_claude_api_key`

## Data Source & Limitations

- Claude's built-in 10th edition training knowledge (cutoff August 2025)
- May lag on post-cutoff FAQ/dataslate stat changes
- Disclaimer shown on every successful fill
- No web fetching — CORS would block direct Wahapedia requests from browser anyway

## Out of Scope

- Autocomplete/suggestions while typing
- Saving favourite units
- Codex/faction browsing
- Backend proxy
