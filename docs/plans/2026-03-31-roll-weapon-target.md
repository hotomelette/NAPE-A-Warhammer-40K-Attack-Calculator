# Roll Weapon / Roll Target Buttons — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ⚔️ Roll weapon and 🎯 Roll target buttons to the Dice entry header and fix the Roll All bug where variable attacks grey it out.

**Architecture:** All changes in `src/App.jsx`. New generic `RollButton` component replaces `RollAllButton`. Two new async functions (`rollWeapon`, `rollTarget`) mirror the phase structure of `rollAll`. One-line bug fix in `missingWeapon`. No new files.

**Tech Stack:** React 19, Vite 7, Tailwind CSS v4. Tests: Vitest 4 (`npm test`). No TypeScript.

---

## Reference: Key Line Numbers

Read the file in chunks (offset/limit) — it is ~2500 lines.

| Item | Lines |
|------|-------|
| `RollAllButton` component | 86–99 |
| `isRollingAll` useState | 823 |
| `displayComputed` | ~850 |
| `missingWeapon` block | 963–975 |
| `statsReady` | 982 |
| `rollAll` function | 1149–1276 |
| Dice entry section header action div | 1851–1866 |

---

## Task 1: Fix the statsReady Bug (variable attacks)

**Files:**
- Modify: `src/App.jsx:967`

**Step 1: Read the missingWeapon block**

```bash
# Read tool: offset=963 limit=15
```

Confirm line 967 reads:
```js
if (parseDiceList(attacksRolls).length === 0) missingWeapon.push("Attacks rolls");
```

**Step 2: Replace the variable attacks check**

Change line 967 from checking rolls to checking expression validity:

```js
// Before (line 967):
    if (parseDiceList(attacksRolls).length === 0) missingWeapon.push("Attacks rolls");
// After:
    if (!parseDiceSpec(attacksValue).ok) missingWeapon.push("Attacks expression");
```

**Step 3: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

Expected: `✓ built` with no new errors.

**Step 4: Manual test**

In the running app (http://localhost:5173):
1. Fill in all weapon stats (To Hit, Strength, AP, Damage) and target stats
2. Uncheck "Fixed attacks", type `D6` in the Attacks field
3. Confirm Roll All button is now **enabled** (amber, not greyed out)
4. Click Roll All — confirm it rolls attack dice then proceeds through hits/wounds/saves

**Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "fix: enable Roll All when attacks are variable (check expression validity, not filled rolls)"
```

---

## Task 2: Add isRollingWeapon and isRollingTarget State

**Files:**
- Modify: `src/App.jsx:823–850`

**Step 1: Read the state declaration and displayComputed**

```bash
# Read tool: offset=820 limit=35
```

Confirm line 823: `const [isRollingAll, setIsRollingAll] = useState(false);`
Confirm ~line 850: `const displayComputed = isRollingAll ? computed : activeComputed;`

**Step 2: Add two new state booleans after isRollingAll**

```js
// After line 823:
  const [isRollingAll, setIsRollingAll] = useState(false);
  const [isRollingWeapon, setIsRollingWeapon] = useState(false);
  const [isRollingTarget, setIsRollingTarget] = useState(false);
```

**Step 3: Extend displayComputed freeze to all three flags**

```js
// Before:
  const displayComputed = isRollingAll ? computed : activeComputed;
// After:
  const displayComputed = (isRollingAll || isRollingWeapon || isRollingTarget) ? computed : activeComputed;
```

**Step 4: Update rollAll guard to also block during partial rolls**

At line 1150:
```js
// Before:
    if (isRollingAll || !statsReady) return;
// After:
    if (isRollingAll || isRollingWeapon || isRollingTarget || !statsReady) return;
```

**Step 5: Build and verify**

```bash
npm run build 2>&1 | tail -10
npm test 2>&1 | tail -10
```

Expected: build clean, 37/37 tests pass.

**Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add isRollingWeapon/isRollingTarget state and extend display freeze"
```

---

## Task 3: Replace RollAllButton with Generic RollButton Component

**Files:**
- Modify: `src/App.jsx:86–99`

**Step 1: Read current RollAllButton**

```bash
# Read tool: offset=86 limit=14
```

**Step 2: Replace RollAllButton with generic RollButton**

Replace the entire `RollAllButton` function (lines 86–99) with:

```jsx
function RollButton({ onClick, disabled, isRolling, isReady, emoji, label, readyClass, rollingClass }) {
  const cls = isRolling
    ? `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-extrabold border transition ${rollingClass} animate-pulse cursor-wait`
    : isReady
      ? `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-extrabold border transition ${readyClass}`
      : "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-extrabold border transition bg-transparent border-gray-500 text-gray-400 cursor-not-allowed opacity-60";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {isRolling ? `${emoji} Rolling…` : `${emoji} ${label}`}
    </button>
  );
}
```

**Step 3: Update the RollAllButton usage in the Dice entry header (~line 1860)**

Read lines 1851–1866 to find the exact JSX, then replace the `<RollAllButton .../>` with:

```jsx
<RollButton
  onClick={rollAll}
  disabled={!statsReady || isRollingAll || isRollingWeapon || isRollingTarget}
  isRolling={isRollingAll}
  isReady={statsReady}
  emoji="🎲"
  label="Roll all"
  readyClass="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 border-amber-400/40 text-gray-950"
  rollingClass="bg-amber-600 border-amber-400 text-gray-950"
/>
```

**Step 4: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

Expected: `✓ built`. Roll All still works visually — same amber colors, same behavior.

**Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "refactor: replace RollAllButton with generic RollButton component"
```

---

## Task 4: Implement rollWeapon Function

**Files:**
- Modify: `src/App.jsx` (add after rollAll, ~line 1277)

**Step 1: Read rollAll phases 1–3 for reference**

```bash
# Read tool: offset=1149 limit=100
```

Study phases 1–3 to copy the animation pattern exactly.

**Step 2: Add rollWeapon immediately after the rollAll closing brace (~line 1276)**

```js
  const rollWeapon = async () => {
    if (isRollingAll || isRollingWeapon || isRollingTarget || !statsReady) return;
    setIsRollingWeapon(true);

    const attackSpecNow = parseDiceSpec(attacksValue);
    const toHitNum = Number(toHit);
    const critHitT = Number(critHitThreshold) || 6;
    const strengthNum = Number(strength);
    const toughnessNum = Number(toughness);
    const woundTarget = strengthNum >= toughnessNum * 2 ? 2 : strengthNum > toughnessNum ? 3 : strengthNum === toughnessNum ? 4 : strengthNum * 2 <= toughnessNum ? 6 : 5;

    const { flushSync } = await import("react-dom");
    const animateField = (setter, finalRolls, sides) => new Promise(resolve => {
      if (finalRolls.length === 0) { resolve(); return; }
      let step = 0;
      const ticker = setInterval(() => {
        flushSync(() => {
          setter(Array.from({ length: finalRolls.length }, () => Math.ceil(Math.random() * sides)).join(" "));
        });
        if (++step >= 10) { clearInterval(ticker); flushSync(() => setter(finalRolls.join(" "))); resolve(); }
      }, 60);
    });
    const pause = (ms) => new Promise(r => setTimeout(r, ms));

    // Phase 1: Attack dice (only when variable)
    let attacksTotal = attacksFixed ? (Number(attacksValue) || 0) : 0;
    if (!attacksFixed && attackSpecNow.n > 0) {
      const rolls = Array.from({ length: attackSpecNow.n }, () => Math.ceil(Math.random() * attackSpecNow.sides));
      await animateField(setAttacksRolls, rolls, attackSpecNow.sides);
      attacksTotal = rolls.reduce((s, d) => s + d, 0) + attackSpecNow.mod;
      await pause(120);
    }
    if (attacksTotal <= 0) { setIsRollingWeapon(false); return; }

    // Phase 2: Hits
    let hitRollsFinal = [];
    let normalHits = 0, lethalAutoWounds = 0, sustainedExtra = 0;
    if (!torrent) {
      hitRollsFinal = Array.from({ length: attacksTotal }, () => Math.ceil(Math.random() * 6));
      await animateField(setHitRollsText, hitRollsFinal, 6);
      if (rerollHitOnes || rerollHitFails) {
        const eligible = hitRollsFinal.filter(d => rerollHitOnes ? d === 1 : d < toHitNum);
        if (eligible.length > 0) {
          const rr = Array.from({ length: eligible.length }, () => Math.ceil(Math.random() * 6));
          await pause(80); await animateField(setHitRerollRollsText, rr, 6);
          let ri = 0;
          hitRollsFinal = hitRollsFinal.map(d => ((rerollHitOnes && d === 1) || (rerollHitFails && d < toHitNum)) ? (rr[ri++] ?? d) : d);
        }
      }
      for (const d of hitRollsFinal) {
        if (d >= critHitT) {
          if (sustainedHits) sustainedExtra += Number(sustainedHitsN) || 1;
          if (lethalHits) lethalAutoWounds++; else normalHits++;
        } else if (d >= toHitNum) normalHits++;
      }
      normalHits += sustainedExtra;
    } else {
      normalHits = attacksTotal;
    }
    await pause(120);

    // Phase 3: Wounds
    if (normalHits > 0) {
      const woundRollsFinal = Array.from({ length: normalHits }, () => Math.ceil(Math.random() * 6));
      await animateField(setWoundRollsText, woundRollsFinal, 6);
      if (twinLinked || rerollWoundOnes || rerollWoundFails) {
        const eligible = woundRollsFinal.filter(d => (twinLinked || rerollWoundOnes) ? d === 1 : d < woundTarget);
        if (eligible.length > 0) {
          const rr = Array.from({ length: eligible.length }, () => Math.ceil(Math.random() * 6));
          await pause(80); await animateField(setWoundRerollRollsText, rr, 6);
        }
      }
    }

    setIsRollingWeapon(false);
  };
```

**Step 3: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add rollWeapon function (phases 1-3: attack dice, hits, wounds)"
```

---

## Task 5: Implement rollTarget Function

**Files:**
- Modify: `src/App.jsx` (add after rollWeapon)

**Step 1: Read rollAll phases 4–6 for reference**

```bash
# Read tool: offset=1241 limit=40
```

**Step 2: Check what field activeComputed uses for mortal wounds**

Search the file:
```bash
grep -n "mortal\|mortals\|mortalWound" src/App.jsx | head -20
grep -n "mortal\|mortals" src/useCalculator.js | head -20
```

Find the exact field name on `activeComputed` that holds mortal wound attack count (used in Phase 5 for damage dice count). It may be `activeComputed.mortals`, `activeComputed.mortalWoundAttacks`, or similar.

**Step 3: Add rollTarget immediately after rollWeapon**

Replace `MORTALS_FIELD` below with the actual field name found in Step 2:

```js
  const rollTarget = async () => {
    if (isRollingAll || isRollingWeapon || isRollingTarget) return;
    const currentSaveNeeded = splitEnabled ? target1Wounds : (activeComputed.savableWounds || 0);
    if (currentSaveNeeded <= 0) return;
    setIsRollingTarget(true);

    const armorSaveNum = Number(armorSave);
    const apNum = Number(ap) || 0;
    const saveTarget = Math.min(7, Math.max(2, ignoreAp ? armorSaveNum : armorSaveNum - apNum - (inCover ? 1 : 0)));
    const dmgSpec = parseDiceSpec(damageValue);

    const { flushSync } = await import("react-dom");
    const animateField = (setter, finalRolls, sides) => new Promise(resolve => {
      if (finalRolls.length === 0) { resolve(); return; }
      let step = 0;
      const ticker = setInterval(() => {
        flushSync(() => {
          setter(Array.from({ length: finalRolls.length }, () => Math.ceil(Math.random() * sides)).join(" "));
        });
        if (++step >= 10) { clearInterval(ticker); flushSync(() => setter(finalRolls.join(" "))); resolve(); }
      }, 60);
    });
    const pause = (ms) => new Promise(r => setTimeout(r, ms));

    // Phase 4: Saves
    const saveRollsFinal = Array.from({ length: currentSaveNeeded }, () => Math.ceil(Math.random() * 6));
    await animateField(setSaveRollsText, saveRollsFinal, 6);
    const failedSaves = saveRollsFinal.filter(d => d < saveTarget).length;
    const failedEffective = Math.max(0, failedSaves - (ignoreFirstFailedSave ? 1 : 0));
    await pause(120);

    // Phase 5: Variable damage
    const mortalWoundAttacks = activeComputed.MORTALS_FIELD || 0;
    let totalDmg = 0;
    if (!damageFixed && dmgSpec.hasDie) {
      const totalDmgDice = failedEffective + mortalWoundAttacks;
      if (totalDmgDice > 0) {
        const rolls = Array.from({ length: totalDmgDice }, () => Math.ceil(Math.random() * dmgSpec.sides));
        await animateField(setDamageRolls, rolls, dmgSpec.sides);
        totalDmg = rolls.reduce((s, d) => s + d + dmgSpec.mod, 0);
        await pause(120);
      }
    } else if (damageFixed) {
      const d = Number(damageValue) || 0;
      totalDmg = (failedEffective + mortalWoundAttacks) * d;
    }

    // Phase 6: FNP
    if (fnpEnabled && fnp !== "" && totalDmg > 0) {
      const fnpRolls = Array.from({ length: totalDmg }, () => Math.ceil(Math.random() * 6));
      await animateField(setFnpRollsText, fnpRolls, 6);
    }

    setIsRollingTarget(false);
  };
```

**Step 4: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

**Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add rollTarget function (phases 4-6: saves, damage dice, FNP)"
```

---

## Task 6: Add Buttons to Dice Entry Header and Resize Clear Dice

**Files:**
- Modify: `src/App.jsx:1851–1866`

**Step 1: Read current Dice entry header action div**

```bash
# Read tool: offset=1851 limit=20
```

Confirm the current layout: small Clear dice button → RollAllButton (now RollButton).

**Step 2: Replace the action div with four equal-sized buttons**

Replace the entire `action={...}` prop (the `<div className="flex items-center gap-2">` block) with:

```jsx
action={
  <div className="flex items-center gap-2">
    <RollButton
      onClick={rollWeapon}
      disabled={!statsReady || isRollingAll || isRollingWeapon || isRollingTarget}
      isRolling={isRollingWeapon}
      isReady={statsReady}
      emoji="⚔️"
      label="Roll weapon"
      readyClass="bg-gradient-to-r from-red-700 to-rose-700 hover:from-red-600 hover:to-rose-600 border-red-500/40 text-white"
      rollingClass="bg-red-700 border-red-500 text-white"
    />
    <RollButton
      onClick={rollTarget}
      disabled={!((splitEnabled ? target1Wounds : (activeComputed.savableWounds || 0)) > 0) || isRollingAll || isRollingWeapon || isRollingTarget}
      isRolling={isRollingTarget}
      isReady={(splitEnabled ? target1Wounds : (activeComputed.savableWounds || 0)) > 0}
      emoji="🎯"
      label="Roll target"
      readyClass="bg-gradient-to-r from-teal-700 to-cyan-700 hover:from-teal-600 hover:to-cyan-600 border-teal-500/40 text-white"
      rollingClass="bg-teal-700 border-teal-500 text-white"
    />
    <RollButton
      onClick={rollAll}
      disabled={!statsReady || isRollingAll || isRollingWeapon || isRollingTarget}
      isRolling={isRollingAll}
      isReady={statsReady}
      emoji="🎲"
      label="Roll all"
      readyClass="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 border-amber-400/40 text-gray-950"
      rollingClass="bg-amber-600 border-amber-400 text-gray-950"
    />
    <button
      type="button"
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-extrabold border transition ${theme === "dark" ? "bg-transparent border-gray-600 text-gray-400 hover:bg-gray-800 hover:text-gray-300" : "bg-transparent border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-gray-700"}`}
      onClick={clearDice}
    >
      Clear dice
    </button>
  </div>
}
```

**Step 3: Build and verify**

```bash
npm run build 2>&1 | tail -10
npm test 2>&1 | tail -10
```

Expected: build clean (only pre-existing `inputMode` warnings), 37/37 tests pass.

**Step 4: Manual test all three roll buttons**

In the running app:
1. Fill weapon (fixed attacks) + target stats → Roll weapon button turns red → click it → hits + wounds animate
2. After wounds, Roll target button turns teal → click it → saves + FNP animate
3. Clear all → set variable attacks (D6) → fill other stats → Roll weapon turns red → click it → attack dice animate first, then hits, then wounds
4. Click Roll all → all phases animate in sequence including attack dice
5. Verify Roll weapon, Roll target, and Roll all cannot be clicked simultaneously (each disables the others while running)

**Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add Roll weapon and Roll target buttons to Dice entry header"
```

---

## Final Verification

```bash
npm run build 2>&1 | tail -15
npm test 2>&1 | tail -10
git log --oneline -6
```

Expected: clean build, 37/37 tests pass, 5 commits for this feature.
