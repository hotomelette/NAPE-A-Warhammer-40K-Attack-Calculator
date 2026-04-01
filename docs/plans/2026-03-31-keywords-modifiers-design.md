# Keywords & Modifiers Expansion — Design Doc

**Date:** 2026-03-31
**Goal:** Expand attack calculator coverage from ~75% to ~95% of real-game scenarios by adding the most common missing weapon keywords, target abilities, and hit/wound modifiers.

---

## Features

### 1. Blast (Weapon Keyword)
**Rule:** Add `floor(unitSize / 5)` attacks when targeting a unit of `unitSize` models.
**UI:** Checkbox + number input for enemy unit size. Checkbox labeled "Blast" with hint "Add 1 attack per 5 models in target unit."
**State:** `blastEnabled: false`, `blastUnitSize: 10` (weapon slice)
**Math:** `effectiveAttacks = baseAttacks + (blastEnabled ? Math.floor(blastUnitSize / 5) : 0)`, applied before hit rolls.

---

### 2. Melta [X] (Weapon Keyword)
**Rule:** Add X to the damage characteristic of each attack when active (user toggles when within half range).
**UI:** Checkbox + number input for X. Labeled "Melta" with hint "Add X damage within half range."
**State:** `meltaEnabled: false`, `meltaX: 0` (weapon slice)
**Math:** `effectiveDamage = baseDamage + (meltaEnabled ? meltaX : 0)`, applied per wound during damage calculation.

---

### 3. Lance (Weapon Keyword)
**Rule:** AP improves by 1 (e.g. AP 0 → AP -1, AP -1 → AP -2).
**UI:** Checkbox labeled "Lance" with hint "AP improves by 1 vs this target."
**State:** `lance: false` (weapon slice)
**Math:** `effectiveAP = lance ? ap - 1 : ap`, applied when computing save target.

---

### 4. Anti-X [N+] (Weapon Keyword)
**Rule:** Critical wound is scored on an unmodified wound roll of N+. Lowers `critWoundThreshold` to N while active.
**UI:** Checkbox + number input for N (default 5). Labeled "Anti-X" with hint "Critical wound on N+ (e.g. Anti-Infantry 4+). Sets crit wound threshold."
**State:** `antiXEnabled: false`, `antiXThreshold: 5` (weapon slice)
**Math:** When `antiXEnabled`, override `critWoundThreshold` with `antiXThreshold`. On uncheck, `critWoundThreshold` returns to 6.
**Note:** `critWoundThreshold` already exists in state and the calculation. Anti-X is a UX convenience that drives it.

---

### 5. +1 To Hit (Weapon/Attacker Side)
**Rule:** Add 1 to hit rolls. Covers Heavy (unit didn't move), Guided (T'au Markerlights), and similar attacker-side abilities.
**UI:** Checkbox labeled "+1 To Hit" with hint "Heavy (didn't move), Guided, Markerlights, similar."
**State:** `plusOneToHit: false` (weapon slice)
**Math:** Feeds into hit modifier pool (see Stacking Cap below).

---

### 6. Indirect Fire (Weapon Keyword)
**Rule:** -1 to hit when firing without line of sight.
**UI:** Checkbox labeled "Indirect Fire" with hint "No line of sight — subtract 1 from hit rolls."
**State:** `indirectFire: false` (weapon slice)
**Math:** Feeds into hit modifier pool (see Stacking Cap below).

---

### 7. Stealth / Smoke (Target Ability)
**Rule:** Attackers subtract 1 from hit rolls against this unit. Covers Stealth (unit ability) and Smoke (stratagem). Combined since both give the same effect and the modifier cap means stacking has no additional impact.
**UI:** Checkbox labeled "Stealth / Smoke" with hint "Stealth ability or Smokescreen stratagem — subtract 1 from attacker's hit rolls."
**State:** `stealthSmoke: false` (target slice)
**Math:** Feeds into hit modifier pool (see Stacking Cap below).

---

### 8. -1 To Wound (Target Ability)
**Rule:** Attackers subtract 1 from wound rolls against this unit. Covers Transhuman Physiology and similar defensive abilities.
**UI:** Checkbox labeled "-1 To Wound" with hint "Transhuman Physiology, similar — subtract 1 from wound rolls."
**State:** `minusOneToWound: false` (target slice)
**Math:** Feeds into wound modifier pool (see Stacking Cap below).

---

## Stacking Cap Logic

10th edition caps hit and wound modifiers at ±1 regardless of sources.

**Hit modifier pool:**
```
hitModifier = 0
if (plusOneToHit)  hitModifier += 1
if (indirectFire)  hitModifier -= 1
if (stealthSmoke)  hitModifier -= 1
effectiveHitModifier = Math.max(-1, Math.min(1, hitModifier))
```

**Applied to hit target:**
```
effectiveToHit = Math.min(6, Math.max(2, toHit - effectiveHitModifier))
```
(Subtracting a positive modifier lowers the target number = easier to hit. Adding a negative raises it = harder.)

**Wound modifier pool:**
```
woundModifier = 0
if (minusOneToWound) woundModifier -= 1
effectiveWoundModifier = Math.max(-1, Math.min(1, woundModifier))
```

**Applied to wound target:**
```
effectiveWoundToHit = Math.min(6, Math.max(2, woundTarget - effectiveWoundModifier))
```

Both modifiers are computed before any dice are checked and passed through the existing calculation flow.

---

## State Changes

### weapon slice (appReducer.js)
New fields:
```js
blastEnabled: false,
blastUnitSize: 10,
meltaEnabled: false,
meltaX: 0,
lance: false,
antiXEnabled: false,
antiXThreshold: 5,
plusOneToHit: false,
indirectFire: false,
```

### target slice (appReducer.js)
New fields:
```js
stealthSmoke: false,
minusOneToWound: false,
```

All fields handled by existing generic `SET_WEAPON_FIELD` / `SET_TARGET_FIELD` reducers — no reducer changes needed.

---

## Calculation Changes

### useCalculator.js
1. Accept new params in function signature and dependency array.
2. Compute `effectiveHitModifier` and `effectiveWoundModifier` (stacking cap).
3. Apply hit modifier to `toHit` target before hit rolls.
4. Apply wound modifier to wound target before wound rolls.
5. Apply `lance` AP adjustment before save target calculation.
6. Apply `blast` attack bonus before attack count is used.
7. Apply `melta` damage bonus per wound in damage phase.
8. Override `critWoundThreshold` with `antiXThreshold` when `antiXEnabled`.

### useCalculatorSplit.js
Mirror all the same parameter additions and calculation changes.

### calculatorUtils.js
No changes needed — `woundTargetNumber` and `chooseSaveTarget` already accept the values we'll pass in.

---

## UI Changes (App.jsx)

### Weapon section — keyword toggles area
Add in order after existing keywords:
- Lance (checkbox)
- Blast (checkbox + unit size input, revealed when checked)
- Melta (checkbox + X input, revealed when checked)
- Anti-X (checkbox + threshold input, revealed when checked)
- +1 To Hit (checkbox)
- Indirect Fire (checkbox)

### Target section — existing modifier area (near Cover, Invuln, FNP)
Add:
- Stealth / Smoke (checkbox)
- -1 To Wound (checkbox)

### CLEAR_ALL / LOAD_WEAPON / LOAD_TARGET
Reset all new fields to defaults on clear.

---

## Testing

- Blast: `floor(10/5) = 2` extra attacks, `floor(4/5) = 0` extra attacks.
- Melta: damage = base + X per wound when enabled, base only when disabled.
- Lance: AP -1 becomes AP -2 in save calculation.
- Anti-X: critWoundThreshold = antiXThreshold when enabled, 6 when disabled.
- Hit modifier stacking: +1 + Stealth = 0 net; Stealth + Indirect = -1 capped (not -2).
- Wound modifier: wound target raised by 1 when -1 To Wound active.
- All new fields reset on CLEAR_ALL.

---

## Out of Scope

- Wound allocation vs unit size (multi-damage overkill) — niche, warrants its own feature.
- +1 To Wound (Votann Judgement Tokens, rare stratagems) — low coverage impact, add later if needed.
- Hazardous, Heavy (standalone), Assault, Pistol — affect attacker not target, or are firing context only.
