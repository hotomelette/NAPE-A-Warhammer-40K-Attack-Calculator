# Roll Weapon / Roll Target Buttons — Design Doc

## Problem

1. **Roll All is disabled with variable attacks.** When `attacksFixed = false`, `missingWeapon` includes "Attacks rolls" (line 967 of App.jsx), making `statsReady = false` and greying out Roll All. This is a chicken-and-egg bug: Roll All is supposed to roll those dice, but it's disabled until they're filled.

2. **No partial-phase rolling.** Users must either roll all dice at once or use the per-field 🎲 buttons one at a time. There's no way to roll the attacker's half (attacks + hits + wounds) separately from the defender's half (saves + FNP).

## Solution

### Bug fix

In `missingWeapon` (App.jsx ~line 967), change the variable attacks check from "rolls are filled" to "expression is valid":

```js
// Before:
if (parseDiceList(attacksRolls).length === 0) missingWeapon.push("Attacks rolls");
// After:
if (!parseDiceSpec(attacksValue).ok) missingWeapon.push("Attacks expression");
```

`statsReady` now becomes true as soon as the dice expression + other weapon/target stats are filled. The unfilled `attacksRolls` still produces errors in `activeComputed.errors` → `diceReady` remains false until rolls are entered. Roll All (and Roll Weapon) can now fill them.

Variable damage dice already follow this pattern (line 975 checks expression validity, not filled rolls).

### Two new buttons: Roll Weapon and Roll Target

**Placement:** Dice entry section header action div, order: `[⚔️ Roll weapon] [🎯 Roll target] [🎲 Roll all] [Clear dice]`

**Size:** All four buttons use the same dimensions as the current Roll All button (`rounded-lg px-3 py-1.5 text-sm font-extrabold border transition`).

**Colors:**
- ⚔️ Roll weapon: red/rose gradient (`from-red-700 to-rose-700`)
- 🎯 Roll target: teal/cyan gradient (`from-teal-700 to-cyan-700`)
- 🎲 Roll all: existing amber/orange (unchanged)
- Clear dice: muted gray, no gradient, always enabled

**Roll Weapon** (enabled when `statsReady && !anyRolling`):
- Phase 1: If `!attacksFixed`, animate `attacksRolls` using `attacksValue` expression
- Phase 2: Animate `hitRollsText`; if hit rerolls on, animate `hitRerollRollsText`
- Phase 3: If `normalHits > 0`, animate `woundRollsText`; if wound rerolls on, animate `woundRerollRollsText`

**Roll Target** (enabled when `saveNeeded > 0 && !anyRolling`):
- Phase 4: Animate `saveRollsText`
- Phase 5: If `!damageFixed && dmgSpec.hasDie`, animate `damageRolls` per failed save + mortals from `activeComputed`
- Phase 6: If `fnpEnabled && totalDmg > 0`, animate `fnpRollsText`

### Component changes

Replace `RollAllButton` with a generic `RollButton` component accepting `emoji`, `label`, `readyClass`, `rollingClass` props. RollAllButton becomes a thin wrapper or is inlined.

New state: `isRollingWeapon`, `isRollingTarget` (boolean useState). The `displayComputed` freeze (currently `isRollingAll ? computed : activeComputed`) extends to all three flags.

### What Roll Weapon does NOT do

Roll Weapon does not clear save/FNP fields. If the user re-rolls weapon dice, stale save/FNP entries remain — clicking Roll Target re-rolls them.

## Files changed

- `src/App.jsx` only. No new files.
