# Keywords & Modifiers Expansion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Blast, Melta, Lance, Anti-X, +1 To Hit, Indirect Fire, Stealth/Smoke, and -1 To Wound to the calculator, covering ~95% of real-game scenarios.

**Architecture:** `hitMod` and `woundMod` already exist in state and are wired through `useCalculator.js`. New checkboxes compute effective modifier values in `App.jsx` and feed them through the existing `hitMod`/`woundMod` params. Blast, Melta, Lance, and Anti-X need new params added to `useCalculator.js` only (not `useCalculatorSplit.js` except Melta and Lance — see per-task notes).

**Tech Stack:** React 19, Vite 7, Vitest 4, @testing-library/react, plain JS (no TypeScript)

---

## Key File Map

- `src/appReducer.js` — state shape, `initialWeapon` (line 11) and `initialTarget` (line 36)
- `src/useCalculator.js` — main calc hook, params object at line 10, dependency array at line 463
- `src/useCalculatorSplit.js` — split-target saves/damage/FNP hook, params at line 18
- `src/calculatorUtils.js` — pure helpers; `clampModPlusMinusOne` already exists at line 35
- `src/App.jsx` — destructures weapon at line 669, calls `useCalculator` at line 834, keyword toggles around line 1888, target checkboxes in target section

---

## Pre-existing infrastructure (do NOT re-add)

- `hitMod` and `woundMod` already in `initialWeapon` (appReducer.js:32-33)
- `saveMod` already in `initialTarget` (appReducer.js:47)
- `clampModPlusMinusOne` already exported from `calculatorUtils.js` (line 35)
- `hitMod` is already capped and used in hit rolls (useCalculator.js:43, 111, 169)
- `woundMod` is already used in wound rolls (useCalculator.js:45, 216, 232, 262)

---

## Task 1: Add new state fields to appReducer.js

**Files:**
- Modify: `src/appReducer.js:11-34` (weapon slice)
- Modify: `src/appReducer.js:36-50` (target slice)

No test needed — state shape changes are verified by later tests failing/passing.

**Step 1: Add weapon fields after line 33 (`woundMod: 0,`)**

```js
  // New keywords
  plusOneToHit: false,
  indirectFire: false,
  lance: false,
  blastEnabled: false,
  blastUnitSize: 10,
  meltaEnabled: false,
  meltaX: 0,
  antiXEnabled: false,
  antiXThreshold: 5,
```

**Step 2: Add target fields after line 47 (`saveMod: 0,`)**

```js
  stealthSmoke: false,
  minusOneToWound: false,
```

**Step 3: Verify `CLEAR_ALL` still works**

`CLEAR_ALL` resets to `initialWeapon` / `initialTarget` — no reducer changes needed since `SET_WEAPON_FIELD` / `SET_TARGET_FIELD` handle all fields generically.

**Step 4: Commit**

```bash
git add src/appReducer.js
git commit -m "feat: add state fields for new weapon/target keywords"
```

---

## Task 2: Write failing tests for Blast

**Files:**
- Create: `src/useCalculator.test.js`

**Step 1: Create the test file with a shared helper and Blast tests**

```js
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCalculator } from "./useCalculator.js";

// Minimal params: 4 fixed attacks, To Hit 4+, S4 vs T4, AP0, D1, 3+ save
// hitRollsText: four 4s (all hit), woundRollsText: four 4s (all wound), saveRollsText: four 1s (all fail)
const base = {
  attacksFixed: true,
  attacksValue: 4,
  attacksRolls: "",
  toHit: 4,
  hitMod: 0,
  strength: 4,
  ap: 0,
  damageFixed: true,
  damageValue: 1,
  damageRolls: "",
  critHitThreshold: 6,
  critWoundThreshold: 6,
  rapidFire: false, rapidFireX: 0, halfRange: false,
  torrent: false, lethalHits: false, sustainedHits: false, sustainedHitsN: 1,
  devastatingWounds: false, precision: false,
  rerollHitOnes: false, rerollHitFails: false,
  rerollWoundOnes: false, rerollWoundFails: false, twinLinked: false,
  hitRerollRollsText: "", woundRerollRollsText: "",
  toughness: 4,
  armorSave: 3, invulnSave: "",
  inCover: false, ignoreAp: false, woundMod: 0, saveMod: 0,
  ignoreFirstFailedSave: false, minusOneDamage: false, halfDamage: false,
  fnp: "", fnpEnabled: false, fnpRollsText: "",
  hitRollsText: "4 4 4 4",
  woundRollsText: "4 4 4 4",
  saveRollsText: "1 1 1 1",
  hasLeaderAttached: false, allocatePrecisionToLeader: false,
  // New params being added in this feature:
  blastEnabled: false, blastUnitSize: 10,
  meltaEnabled: false, meltaX: 0,
  lance: false,
  antiXEnabled: false, antiXThreshold: 5,
};

describe("Blast", () => {
  it("does not add attacks when disabled", () => {
    const { result } = renderHook(() => useCalculator({ ...base, blastEnabled: false, blastUnitSize: 10 }));
    expect(result.current.A).toBe(4);
  });

  it("adds floor(unitSize/5) attacks when enabled", () => {
    // 10 models → +2 attacks → A = 6, but we only have 4 hit rolls provided
    // So we check A directly and expect a hit count error (correct behavior)
    const { result } = renderHook(() => useCalculator({
      ...base,
      blastEnabled: true,
      blastUnitSize: 10,
      hitRollsText: "4 4 4 4 4 4",
      woundRollsText: "4 4 4 4 4 4",
      saveRollsText: "1 1 1 1 1 1",
    }));
    expect(result.current.A).toBe(6);
    expect(result.current.totalPostFnp).toBe(6);
  });

  it("adds 0 for unitSize < 5", () => {
    const { result } = renderHook(() => useCalculator({ ...base, blastEnabled: true, blastUnitSize: 4 }));
    expect(result.current.A).toBe(4);
  });

  it("adds 3 attacks for unitSize 15", () => {
    const { result } = renderHook(() => useCalculator({
      ...base,
      blastEnabled: true,
      blastUnitSize: 15,
      hitRollsText: "4 4 4 4 4 4 4",
      woundRollsText: "4 4 4 4 4 4 4",
      saveRollsText: "1 1 1 1 1 1 1",
    }));
    expect(result.current.A).toBe(7);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test src/useCalculator.test.js
```

Expected: FAIL — `useCalculator` doesn't accept `blastEnabled`/`blastUnitSize` yet (ignored silently), so `A` will be 4 not 6.

---

## Task 3: Implement Blast in useCalculator.js

**Files:**
- Modify: `src/useCalculator.js`

**Step 1: Add `blastEnabled`, `blastUnitSize` to the params destructure (around line 12)**

Add after `rapidFire, rapidFireX, halfRange,`:
```js
  blast, blastUnitSize,
```

**Step 2: Add Blast bonus after Rapid Fire block (after line 86)**

```js
    // Blast: add floor(unitSize / 5) attacks
    if (blast && blastUnitSize > 0) {
      const bonus = Math.floor(Number(blastUnitSize) || 0) / 5 | 0;
      if (bonus > 0) {
        A += bonus;
        log.push(`Blast: unit size ${blastUnitSize}, +${bonus} attacks. A => ${A}`);
      }
    }
```

**Step 3: Add to dependency array (line 463)**

Add `blast, blastUnitSize,` to the array.

**Step 4: Wire from App.jsx — destructure from weapon slice (around line 669)**

Add to the weapon destructure:
```js
    blast, blastUnitSize,
    meltaEnabled, meltaX,
    lance,
    antiXEnabled, antiXThreshold,
    plusOneToHit, indirectFire,
```

Add to target destructure (around line 680):
```js
    stealthSmoke, minusOneToWound,
```

**Step 5: Pass to useCalculator call (line 834)**

Add to the `useCalculator({...})` call:
```js
    blast, blastUnitSize,
```

**Step 6: Run tests**

```bash
npm test src/useCalculator.test.js
```

Expected: Blast tests PASS.

**Step 7: Commit**

```bash
git add src/useCalculator.js src/App.jsx
git commit -m "feat: implement Blast keyword (+floor(size/5) attacks)"
```

---

## Task 4: Write failing tests for Anti-X

**Files:**
- Modify: `src/useCalculator.test.js`

**Step 1: Add Anti-X tests**

```js
describe("Anti-X", () => {
  it("does not change critWoundThreshold when disabled", () => {
    // With crit wound threshold 6 and rolls of 5, no crit wounds
    const { result } = renderHook(() => useCalculator({
      ...base,
      devastatingWounds: true,
      antiXEnabled: false,
      antiXThreshold: 5,
      woundRollsText: "5 5 5 5", // all 5s — would be crit if threshold=5
    }));
    expect(result.current.critWounds).toBe(0);
    expect(result.current.mortalWoundAttacks).toBe(0);
  });

  it("lowers crit wound threshold when enabled", () => {
    const { result } = renderHook(() => useCalculator({
      ...base,
      devastatingWounds: true,
      antiXEnabled: true,
      antiXThreshold: 5,
      woundRollsText: "5 5 5 5", // all 5s — crit at threshold 5
    }));
    expect(result.current.critWounds).toBe(4);
    expect(result.current.mortalWoundAttacks).toBe(4);
  });
});
```

**Step 2: Run to verify failure**

```bash
npm test src/useCalculator.test.js
```

Expected: FAIL — `antiXEnabled` not used yet, so crit wounds remain 0.

---

## Task 5: Implement Anti-X in useCalculator.js

**Files:**
- Modify: `src/useCalculator.js`

**Step 1: Add `antiXEnabled`, `antiXThreshold` to params destructure**

Add after the crit threshold lines (around line 17):
```js
  antiXEnabled, antiXThreshold,
```

**Step 2: Override critWoundThreshold at start of useMemo (after line 44)**

```js
    const effectiveCritWoundThreshold = antiXEnabled
      ? Math.max(2, Math.min(6, Number(antiXThreshold) || 6))
      : (Number(critWoundThreshold) || 6);
```

**Step 3: Replace all uses of `(Number(critWoundThreshold) || 6)` with `effectiveCritWoundThreshold`**

There are two places — wound phase (line 219) and wound reroll phase (line 265):
```js
// line 219 — change from:
if (unmod >= (Number(critWoundThreshold) || 6)) critWounds++;
// to:
if (unmod >= effectiveCritWoundThreshold) critWounds++;

// line 265 — change from:
if (unmod >= (Number(critWoundThreshold) || 6)) newCritWounds++;
// to:
if (unmod >= effectiveCritWoundThreshold) newCritWounds++;
```

**Step 4: Add to dependency array**

Add `antiXEnabled, antiXThreshold,`

**Step 5: Pass to useCalculator in App.jsx**

```js
    antiXEnabled, antiXThreshold,
```

**Step 6: Run tests**

```bash
npm test src/useCalculator.test.js
```

Expected: Anti-X tests PASS.

**Step 7: Commit**

```bash
git add src/useCalculator.js src/App.jsx
git commit -m "feat: implement Anti-X keyword (lowers crit wound threshold)"
```

---

## Task 6: Write failing tests for Lance

**Files:**
- Modify: `src/useCalculator.test.js`

**Step 1: Add Lance tests**

```js
describe("Lance", () => {
  it("does not change AP when disabled", () => {
    // AP 0, armor 3+ → saveTarget = 3. All 1s fail → 4 failed saves.
    const { result } = renderHook(() => useCalculator({ ...base, ap: 0, armorSave: 3, lance: false }));
    expect(result.current.saveTarget).toBe(3);
    expect(result.current.failedSaves).toBe(4);
  });

  it("improves AP by 1 when enabled (AP 0 becomes AP -1)", () => {
    // AP 0 + lance = AP -1, armor 3+ → saveTarget = 3 - 1 = 2? No wait...
    // AP is negative: AP -1 means armorAfterAP = 3 - (-1) = 4. So save gets worse for target.
    // Let's verify: base AP=0 → saveTarget = chooseSaveTarget(3, null, 0) = 3.
    // With lance AP=-1 → chooseSaveTarget(3, null, -1) = 3 - (-1) = 4. Save target is 4+, harder to save.
    // With saveRollsText "3 3 3 3" (rolling 3s):
    //   Without lance: 3 >= 3 → all save → 0 failed
    //   With lance: 3 >= 4 → all fail → 4 failed
    const { result } = renderHook(() => useCalculator({
      ...base,
      ap: 0,
      armorSave: 3,
      lance: true,
      saveRollsText: "3 3 3 3",
    }));
    expect(result.current.saveTarget).toBe(4);
    expect(result.current.failedSaves).toBe(4);
  });
});
```

**Step 2: Run to verify failure**

```bash
npm test src/useCalculator.test.js
```

Expected: FAIL — `lance` not used, save target unchanged.

---

## Task 7: Implement Lance in useCalculator.js and useCalculatorSplit.js

**Files:**
- Modify: `src/useCalculator.js`
- Modify: `src/useCalculatorSplit.js`
- Modify: `src/App.jsx`

**Step 1: Add `lance` to useCalculator.js params destructure**

Add after `ap,`:
```js
  lance,
```

**Step 2: In the save phase (around line 292), apply Lance to AP**

```js
    const apForCalc = ignoreAp ? 0 : (Number(ap) || 0) - (lance ? 1 : 0);
```

This replaces the existing:
```js
    const apForCalc = ignoreAp ? 0 : Number(ap) || 0;
```

**Step 3: Add `lance` to dependency array**

**Step 4: Add `lance` to useCalculatorSplit.js**

In `useCalculatorSplit.js`, add `lance` to the params destructure (line 23):
```js
  armorSave, invulnSave, inCover, ignoreAp, saveMod, lance,
```

Apply in the save phase (line 48):
```js
    const apForCalc = ignoreAp ? 0 : (Number(ap) || 0) - (lance ? 1 : 0);
```

Add `lance` to the dependency array in `useCalculatorSplit.js`.

**Step 5: Pass lance through App.jsx**

In `sharedWeaponProps` (around line 870):
```js
  const sharedWeaponProps = { ap, damageFixed, damageValue, devastatingWounds, lance };
```

Pass `lance` to the main `useCalculator` call too.

**Step 6: Run tests**

```bash
npm test src/useCalculator.test.js
```

Expected: Lance tests PASS.

**Step 7: Run all tests to check nothing is broken**

```bash
npm test
```

Expected: All 37 existing + new tests pass.

**Step 8: Commit**

```bash
git add src/useCalculator.js src/useCalculatorSplit.js src/App.jsx
git commit -m "feat: implement Lance keyword (AP improves by 1)"
```

---

## Task 8: Write failing tests for Melta

**Files:**
- Modify: `src/useCalculator.test.js`

**Step 1: Add Melta tests**

```js
describe("Melta", () => {
  it("does not add damage when disabled", () => {
    const { result } = renderHook(() => useCalculator({ ...base, meltaEnabled: false, meltaX: 2 }));
    // 4 failed saves × D1 = 4 damage
    expect(result.current.totalPostFnp).toBe(4);
  });

  it("adds meltaX to damage per wound when enabled", () => {
    const { result } = renderHook(() => useCalculator({
      ...base,
      meltaEnabled: true,
      meltaX: 2,
      damageValue: 1,
    }));
    // 4 failed saves × (1 + 2) = 12 damage
    expect(result.current.totalPostFnp).toBe(12);
  });

  it("stacks with fixed damage correctly", () => {
    const { result } = renderHook(() => useCalculator({
      ...base,
      meltaEnabled: true,
      meltaX: 3,
      damageValue: 2,
    }));
    // 4 failed saves × (2 + 3) = 20 damage
    expect(result.current.totalPostFnp).toBe(20);
  });
});
```

**Step 2: Run to verify failure**

```bash
npm test src/useCalculator.test.js
```

Expected: FAIL — Melta not implemented, damage is base only.

---

## Task 9: Implement Melta in useCalculator.js and useCalculatorSplit.js

**Files:**
- Modify: `src/useCalculator.js`
- Modify: `src/useCalculatorSplit.js`
- Modify: `src/App.jsx`

**Step 1: Add `meltaEnabled`, `meltaX` to useCalculator.js params**

**Step 2: In the damage phase, apply Melta bonus to fixed damage (around line 353)**

```js
    const applyDamageMods = (d) => {
      let out = d;
      if (meltaEnabled) out += Math.max(0, Number(meltaX) || 0);
      if (halfDamage) out = Math.ceil(out / 2);
      if (minusOneDamage) out = Math.max(1, out - 1);
      return out;
    };
```

Note: Melta bonus is applied BEFORE half-damage and -1 damage mods (it's part of the damage characteristic, not a separate pool).

**Step 3: Add to dependency array**

**Step 4: Add `meltaEnabled`, `meltaX` to useCalculatorSplit.js**

Apply the same Melta bonus in `useCalculatorSplit.js`'s `applyDamageMods`. Find the function in useCalculatorSplit.js and add the same Melta line at the top of `applyDamageMods`.

**Step 5: Pass through App.jsx**

Add to `sharedWeaponProps`:
```js
  const sharedWeaponProps = { ap, damageFixed, damageValue, devastatingWounds, lance, meltaEnabled, meltaX };
```

Pass `meltaEnabled, meltaX` to main `useCalculator` call.

**Step 6: Run tests**

```bash
npm test src/useCalculator.test.js
```

Expected: All Melta tests PASS.

**Step 7: Run all tests**

```bash
npm test
```

Expected: All tests pass.

**Step 8: Commit**

```bash
git add src/useCalculator.js src/useCalculatorSplit.js src/App.jsx
git commit -m "feat: implement Melta keyword (+X damage per wound)"
```

---

## Task 10: Wire hit and wound modifier checkboxes in App.jsx

`hitMod` and `woundMod` already flow through to the hook. We just need to compute them from the new boolean fields and pass the computed values instead of the stored numeric ones.

**Files:**
- Modify: `src/App.jsx`

**Step 1: After the weapon/target destructure (around line 688), add effective modifier computation**

```js
  // Effective hit modifier: sum of all sources, clamped to [-1, +1] per 10th ed stacking cap
  const { clampModPlusMinusOne } = require('./calculatorUtils.js'); // already imported at top
  const effectiveHitMod = clampModPlusMinusOne(
    (plusOneToHit ? 1 : 0) - (indirectFire ? 1 : 0) - (stealthSmoke ? 1 : 0)
  );
  const effectiveWoundMod = clampModPlusMinusOne(
    -(minusOneToWound ? 1 : 0)
  );
```

Note: `clampModPlusMinusOne` is imported from `calculatorUtils.js` at the top of App.jsx already (check and add if missing).

**Step 2: Replace `hitMod` and `woundMod` in the useCalculator call (line 837, 846)**

```js
    toHit, hitMod: effectiveHitMod, strength, ap,
    ...
    inCover, ignoreAp, woundMod: effectiveWoundMod, saveMod,
```

**Step 3: Verify import of clampModPlusMinusOne at top of App.jsx**

Search for `from "./calculatorUtils"` in App.jsx. Add `clampModPlusMinusOne` to the import if not already there.

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire hit/wound modifier checkboxes through effectiveHitMod/woundMod"
```

---

## Task 11: Add weapon keyword UI in App.jsx

**Files:**
- Modify: `src/App.jsx`

**Step 1: Add setters near existing keyword setters (around line 733)**

```js
  const setPlusOneToHit  = v => dispatch({ type: "SET_WEAPON_FIELD", field: "plusOneToHit",   value: v });
  const setIndirectFire  = v => dispatch({ type: "SET_WEAPON_FIELD", field: "indirectFire",   value: v });
  const setLance         = v => dispatch({ type: "SET_WEAPON_FIELD", field: "lance",          value: v });
  const setBlastEnabled  = v => dispatch({ type: "SET_WEAPON_FIELD", field: "blastEnabled",   value: v });
  const setBlastUnitSize = v => dispatch({ type: "SET_WEAPON_FIELD", field: "blastUnitSize",  value: v });
  const setMeltaEnabled  = v => dispatch({ type: "SET_WEAPON_FIELD", field: "meltaEnabled",   value: v });
  const setMeltaX        = v => dispatch({ type: "SET_WEAPON_FIELD", field: "meltaX",         value: v });
  const setAntiXEnabled  = v => dispatch({ type: "SET_WEAPON_FIELD", field: "antiXEnabled",   value: v });
  const setAntiXThreshold = v => dispatch({ type: "SET_WEAPON_FIELD", field: "antiXThreshold", value: v });
```

**Step 2: Find the keyword toggles section in App.jsx (around line 1888)**

Add the following after the existing keyword checkboxes (after Precision, before the closing `</div>` of the keywords grid). Follow the exact same `<label>` pattern as existing keywords.

```jsx
{/* Lance */}
<label className="flex items-center gap-2 min-h-[40px]">
  <input type="checkbox" checked={lance} onChange={e => setLance(e.target.checked)} />
  <span className="font-semibold">Lance</span>
  <span className="text-xs text-gray-300">(AP improves by 1)</span>
</label>

{/* Blast */}
<label className="flex items-center gap-2 min-h-[40px]">
  <input type="checkbox" checked={blastEnabled} onChange={e => setBlastEnabled(e.target.checked)} />
  <span className="font-semibold">Blast</span>
  {blastEnabled && (
    <input
      type="number"
      min={1}
      className={`w-16 rounded border p-1 text-sm font-bold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"}`}
      value={blastUnitSize}
      onChange={e => setBlastUnitSize(Number(e.target.value))}
      title="Enemy unit size"
    />
  )}
  <span className="text-xs text-gray-300">{blastEnabled ? `(+${Math.floor((blastUnitSize||0)/5)} attacks)` : "(+1 per 5 models)"}</span>
</label>

{/* Melta */}
<label className="flex items-center gap-2 min-h-[40px]">
  <input type="checkbox" checked={meltaEnabled} onChange={e => setMeltaEnabled(e.target.checked)} />
  <span className="font-semibold">Melta</span>
  {meltaEnabled && (
    <input
      type="number"
      min={0}
      className={`w-14 rounded border p-1 text-sm font-bold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"}`}
      value={meltaX}
      onChange={e => setMeltaX(Number(e.target.value))}
      title="Melta bonus damage"
    />
  )}
  <span className="text-xs text-gray-300">(+X damage, half range)</span>
</label>

{/* Anti-X */}
<label className="flex items-center gap-2 min-h-[40px]">
  <input type="checkbox" checked={antiXEnabled} onChange={e => {
    setAntiXEnabled(e.target.checked);
    if (!e.target.checked) dispatch({ type: "SET_WEAPON_FIELD", field: "critWoundThreshold", value: 6 });
  }} />
  <span className="font-semibold">Anti-X</span>
  {antiXEnabled && (
    <input
      type="number"
      min={2}
      max={6}
      className={`w-14 rounded border p-1 text-sm font-bold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"}`}
      value={antiXThreshold}
      onChange={e => setAntiXThreshold(Number(e.target.value))}
      title="Critical wound on N+"
    />
  )}
  <span className="text-xs text-gray-300">(crit wound on N+, e.g. Anti-Infantry 4+)</span>
</label>

{/* +1 To Hit */}
<label className="flex items-center gap-2 min-h-[40px]">
  <input type="checkbox" checked={plusOneToHit} onChange={e => setPlusOneToHit(e.target.checked)} />
  <span className="font-semibold">+1 To Hit</span>
  <span className="text-xs text-gray-300">(Heavy, Guided, Markerlights)</span>
</label>

{/* Indirect Fire */}
<label className="flex items-center gap-2 min-h-[40px]">
  <input type="checkbox" checked={indirectFire} onChange={e => setIndirectFire(e.target.checked)} />
  <span className="font-semibold">Indirect Fire</span>
  <span className="text-xs text-gray-300">(-1 to hit, no line of sight)</span>
</label>
```

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add weapon keyword UI (Blast, Melta, Lance, Anti-X, +1 To Hit, Indirect Fire)"
```

---

## Task 12: Add target keyword UI in App.jsx

**Files:**
- Modify: `src/App.jsx`

**Step 1: Add setters for target fields (near existing target setters)**

```js
  const setStealthSmoke    = v => dispatch({ type: "SET_TARGET_FIELD", field: "stealthSmoke",    value: v });
  const setMinusOneToWound = v => dispatch({ type: "SET_TARGET_FIELD", field: "minusOneToWound", value: v });
```

**Step 2: Find the target section checkboxes in App.jsx**

Look for the `inCover` checkbox in the Target section. Add the new checkboxes nearby, following the same pattern:

```jsx
{/* Stealth / Smoke */}
<label className="flex items-center gap-2 min-h-[40px]">
  <input type="checkbox" checked={stealthSmoke} onChange={e => setStealthSmoke(e.target.checked)} />
  <span className="font-semibold">Stealth / Smoke</span>
  <span className="text-xs text-gray-300">(-1 to hit: Stealth ability or Smokescreen)</span>
</label>

{/* -1 To Wound */}
<label className="flex items-center gap-2 min-h-[40px]">
  <input type="checkbox" checked={minusOneToWound} onChange={e => setMinusOneToWound(e.target.checked)} />
  <span className="font-semibold">-1 To Wound</span>
  <span className="text-xs text-gray-300">(Transhuman Physiology, similar)</span>
</label>
```

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add target keyword UI (Stealth/Smoke, -1 To Wound)"
```

---

## Task 13: Run full test suite and verify build

**Step 1: Run all tests**

```bash
npm test
```

Expected: All tests pass (37 existing + new useCalculator tests).

**Step 2: Run build**

```bash
npm run build
```

Expected: Build succeeds. Pre-existing warnings about duplicate inputMode attrs in split section are harmless — ignore them.

**Step 3: Run lint**

```bash
npm run lint
```

Fix any lint errors before proceeding.

**Step 4: Commit if any lint fixes needed, then final commit**

```bash
git add -p
git commit -m "feat: keywords & modifiers expansion complete (Blast, Melta, Lance, Anti-X, hit/wound mods)"
```

---

## Implementation Notes

- **Stacking cap** is enforced in `effectiveHitMod` in App.jsx (not in the hook) — the hook just receives a pre-capped `hitMod` value as before.
- **Anti-X resets critWoundThreshold to 6** on uncheck by dispatching `SET_WEAPON_FIELD` directly in the onChange handler — the existing `critWoundThreshold` field in state is the source of truth, Anti-X just drives it.
- **Lance in split mode** is handled via `sharedWeaponProps` — all split targets inherit the lance AP adjustment automatically.
- **Melta in split mode** is applied in `useCalculatorSplit.js`'s `applyDamageMods` — same position in the chain as in `useCalculator.js`.
- **CLEAR_ALL** works automatically because `initialWeapon` and `initialTarget` already have the new fields at their default values (Task 1).
- **`woundMod` capping**: currently `woundMod` is NOT capped in the hook (line 45 just does `Number(woundMod) || 0`). Since `effectiveWoundMod` is already capped before being passed in, this is fine — no change to the hook needed for this.
