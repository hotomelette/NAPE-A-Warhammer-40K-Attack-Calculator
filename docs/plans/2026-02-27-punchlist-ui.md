# Punchlist UI Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A set of UI/UX improvements: button relocations, a new Rerolls section, step-by-step log visibility fix, split-volley contrast and save-roll validation fixes, autohide dice fields, footer cleanup, and limitations content update.

**Architecture:** All changes are in `src/App.jsx` (monolithic ~1600-line component). One task touches `src/App.jsx` only per task. No new files. No logic changes except tasks 5 and 6 (validation + conditional rendering).

**Tech Stack:** React 19, Vite 7, Tailwind CSS v4. No TypeScript. Tests use Vitest 4 + @testing-library/react. Run tests with `npm test -- --run`.

---

## Reference: Key Line Numbers in `src/App.jsx`

Read the file in chunks (offset/limit) — it is too large to read at once.

| Item | Lines |
|------|-------|
| `Section` component | 101–117 |
| `LookupSourceBadge` | 179–234 |
| Sticky header | ~1370–1392 |
| `<Section title="Weapon">` | 1396 |
| `<Section title="Target 1">` | 1635 |
| Split Volley block | 1698–1795 |
| `<Section title="Dice entry">` | 1801–1813 |
| Rerolls box (inside Dice entry) | 1818–1840 |
| Wound rolls Field | 1906–1921 |
| Wound reroll Field | 1923–1935 |
| Save rolls (T1) Field | 1937–1953 |
| FNP rolls Field | 1955–1972 |
| Split target dice sections | 1976–2041 |
| `<Section title="Results">` | 2043 |
| Split summary block | ~2193–2225 |
| Load example + Clear all buttons | 2227–2267 |
| `<Section title="Step-by-step log">` | 2277–2295 |
| Footer start | 2300 |
| Reference & accuracy panel | 2300–2327 |
| Accuracy chips row | 2329–2343 |
| showLimitations block | 2370–2404 |
| showCheatSheet block | 2406–2426 |
| Bottom credits text | 2430–2437 |

## Reference: Key Variables

```js
// Computed in App.jsx (~line 924–957)
const hitEntered = parseDiceList(hitRollsText).length;
const woundNeeded = activeComputed.woundRollPool;   // 0 before hits, 0 if all miss
const saveNeeded = splitEnabled ? target1Wounds : (activeComputed.savableWounds || 0);
const hasSaveCountError = saveNeeded > 0 && saveEntered !== saveNeeded;

// Section component supports action prop (right side of header):
<Section theme={theme} title="Weapon" action={<button ...>Clear weapon</button>}>
```

---

## Task 1: Move Action Buttons to Section Headers

**Files:**
- Modify: `src/App.jsx` (Weapon header ~1396, Target 1 header ~1635, Dice entry header ~1801, Results header ~2043, Results body ~2227–2267)

The clear buttons currently live inside the Results section body. Move them to their respective section headers using the `action` prop. Remove them from the Results body.

**Step 1: Read current Weapon section header (~line 1396)**

```bash
# Use Read tool offset=1394 limit=8
```

Current:
```jsx
<Section theme={theme} title="Weapon">
```

**Step 2: Add `clearWeapon` to Weapon header**

Replace with:
```jsx
<Section theme={theme} title="Weapon" action={
  <button
    type="button"
    className={`rounded px-2 py-1 text-xs font-semibold border transition ${theme === "dark" ? "bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700" : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100"}`}
    onClick={clearWeapon}
  >
    Clear weapon
  </button>
}>
```

**Step 3: Read Target 1 section header (~line 1635)**

Current:
```jsx
<Section theme={theme} title="Target 1">
```

**Step 4: Add `clearTarget` to Target 1 header**

Replace with:
```jsx
<Section theme={theme} title="Target 1" action={
  <button
    type="button"
    className={`rounded px-2 py-1 text-xs font-semibold border transition ${theme === "dark" ? "bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700" : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100"}`}
    onClick={clearTarget}
  >
    Clear target
  </button>
}>
```

**Step 5: Read Dice entry section header (~line 1801)**

Current:
```jsx
<Section theme={theme} title={<span ...>Dice entry <DiceEntryTooltip .../></span>} action={<RollAllButton .../>}>
```

**Step 6: Add `clearDice` to Dice entry header alongside RollAllButton**

Replace the `action={<RollAllButton .../>}` with:
```jsx
action={
  <div className="flex items-center gap-2">
    <button
      type="button"
      className={`rounded px-2 py-1 text-xs font-semibold border transition ${theme === "dark" ? "bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700" : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100"}`}
      onClick={() => clearDice()}
    >
      Clear dice
    </button>
    <RollAllButton
      onClick={rollAll}
      disabled={!statsReady || isRollingAll}
      isRolling={isRollingAll}
      isReady={statsReady}
    />
  </div>
}
```

**Step 7: Read Results section header (~line 2043)**

Current:
```jsx
<Section theme={theme} title="Results">
```

**Step 8: Add Load example + Clear all to Results header**

Replace with:
```jsx
<Section theme={theme} title="Results" action={
  <div className="flex gap-2">
    <button
      type="button"
      className={`rounded px-2 py-1.5 text-xs font-extrabold border transition bg-gradient-to-r from-yellow-400/80 to-amber-400/80 text-gray-950 border-yellow-200/40 hover:from-yellow-300/90 hover:to-amber-300/90`}
      onClick={loadExample}
      title="Fill all fields with a known working example"
    >
      Load example
    </button>
    <button
      type="button"
      className={`rounded px-2 py-1.5 text-xs font-semibold border transition ${theme === "dark" ? "bg-gray-900 text-gray-100 border-gray-700 hover:bg-gray-800" : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"}`}
      onClick={() => { handleClearAllEaster(); clearAll(); }}
    >
      Clear all
    </button>
  </div>
}>
```

**Step 9: Remove old buttons from Results body**

Read lines 2227–2270 and delete the entire `<div className="mt-3">` block containing:
- Row 1: Load example + Clear all (grid-cols-2)
- Row 2: Clear weapon / Clear target / Clear dice (grid-cols-3)

Replace that entire `<div className="mt-3">...</div>` block with nothing (delete it).

**Step 10: Build and verify**

```bash
npm run build 2>&1 | tail -10
```
Expected: `✓ built` with no new errors.

**Step 11: Commit**

```bash
git add src/App.jsx
git commit -m "feat: move clear buttons and load/clear-all to section headers"
```

---

## Task 2: Move Rerolls to Own Section (Complex Mode Only)

**Files:**
- Modify: `src/App.jsx`

Rerolls currently lives inside the Dice entry Section (~lines 1818–1840). Move it to the LEFT column as its own `<Section>` after the Split Volley block, visible only when `!simpleMode`.

**Step 1: Read the rerolls block (~lines 1818–1840)**

```jsx
{/* ── Rerolls (collapsed by default) ── */}
<div className={`rounded-xl border p-3 ...`}>
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <div className="text-sm font-extrabold">Rerolls</div>
      <div className="inline-flex ...">EXPERIMENTAL</div>
    </div>
    <button ... onClick={() => setShowRerolls(!showRerolls)}>
      {showRerolls ? "Hide" : "Show"}
    </button>
  </div>
  {showRerolls && (
    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
      <label ...>Reroll hit 1s</label>
      <label ...>Reroll failed hits</label>
      <label ...>Reroll wound 1s</label>
      <label ...>Reroll failed wounds / Twin-linked</label>
    </div>
  )}
</div>
```

**Step 2: Delete the rerolls block from inside Dice entry**

Remove the entire `{/* ── Rerolls ── */}` div (the `<div className="rounded-xl border p-3...">` at lines ~1818–1840) from inside the Dice entry Section.

Also remove the `{/* ── ⚔️ Weapon — Dice sub-header ── */}` line immediately above the rerolls block (~line 1815–1816) since its job was to introduce the weapon dice area including rerolls. The sub-header for "🎯 Target 1 — Dice" at line ~1937 can stay.

**Step 3: Read the closing of Split Volley block in the left column (~line 1793–1800)**

The left column ends around line 1797 with `</div>` closing the `lg:col-span-6 space-y-4` div. Find the exact closing tag.

**Step 4: Add new Rerolls Section after Split Volley, before left column closing tag**

Insert before the `</div>` that closes the left `lg:col-span-6` div:

```jsx
{!simpleMode && (
  <Section theme={theme} title="Rerolls">
    <div className="flex items-center gap-2 mb-3">
      <div className="inline-flex items-center text-xs font-semibold text-amber-200 bg-amber-900/40 border border-amber-700/50 rounded-full px-2 py-0.5">EXPERIMENTAL</div>
    </div>
    <div className="grid grid-cols-2 gap-2 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={rerollHitOnes} onChange={e => setRerollHitOnes(e.target.checked)} />
        Reroll hit 1s
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={rerollHitFails} onChange={e => setRerollHitFails(e.target.checked)} />
        Reroll failed hits
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={rerollWoundOnes} onChange={e => setRerollWoundOnes(e.target.checked)} />
        Reroll wound 1s
      </label>
      <label className={`flex items-center gap-2 ${twinLinked ? "opacity-75" : ""}`}>
        <input type="checkbox" checked={rerollWoundFails || twinLinked} disabled={twinLinked} onChange={e => setRerollWoundFails(e.target.checked)} />
        Reroll failed wounds {twinLinked ? <span className="text-xs text-gray-500">(Twin-linked)</span> : null}
      </label>
    </div>
  </Section>
)}
```

Note: No show/hide toggle needed — the whole Section is hidden in simple mode, and always expanded in complex mode. Remove the `showRerolls` / `setShowRerolls` state entirely if it is only used for the Rerolls box (check first — it might be referenced in `appReducer.js` or `initialState`).

**Step 5: Check if showRerolls is used elsewhere**

```bash
grep -n "showRerolls" src/App.jsx src/appReducer.js
```

If `showRerolls` only appeared in the old rerolls box, remove its `useState` declaration and `setShowRerolls` call. If it's wired to the reducer, leave the state variable but just stop using it.

**Step 6: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

**Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat: move rerolls to own section in left column, complex mode only"
```

---

## Task 3: Fix Step-by-Step Log Section Visibility

**Files:**
- Modify: `src/App.jsx` (~lines 2277–2295)

**Problem:** The `<Section title="Step-by-step log">` is always rendered. Inside it, content toggles with `showLog`. The footer also has a "Show log" button toggling `showLog`. This duplicates the functionality and the section header is always visible even when `showLog = false`.

**Fix:** Wrap the entire Section in `{showLog && (...)}`. Remove the inner show/hide button from inside the section (the description text and button row ~lines 2278–2287). The footer "Show log" / "Hide log" button already toggles `showLog`.

**Step 1: Read current step-by-step section (~lines 2277–2295)**

```jsx
<Section theme={theme} title="Step-by-step log">
  <div className="flex items-center justify-between mb-2">
    <div className={`text-xs ...`}>Detailed resolution trace...</div>
    <button ... onClick={() => setShowLog(!showLog)}>
      {showLog ? "Hide log" : "Show log"}
    </button>
  </div>
  {showLog && (
    <ol ...>
      {activeComputed.log.map(...)}
    </ol>
  )}
</Section>
```

**Step 2: Replace with section gated by showLog, log always visible inside**

```jsx
{showLog && (
  <Section theme={theme} title="Step-by-step log">
    <ol className={`text-sm leading-relaxed list-decimal pl-5 space-y-1 ${theme === "dark" ? "text-gray-100" : "text-gray-800"}`}>
      {activeComputed.log.map((line, idx) => (
        <li key={idx}>{line}</li>
      ))}
    </ol>
  </Section>
)}
```

The footer "Show log" button (in the reference/footer area) already reads `{ label: showLog ? "Hide log" : "Show log", action: () => setShowLog(!showLog) }` — this remains the sole toggle. When the user hides the log via the footer button, the whole section disappears.

**Step 3: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "fix: step-by-step log section hidden entirely when showLog is false"
```

---

## Task 4: Fix Split Volley Font Contrast in Light Mode

**Files:**
- Modify: `src/App.jsx` (Split Volley block ~1698–1795, split dice sections ~1976–2041)

**Problem:** Several color classes in the split volley section use amber/green/gray values hardcoded for dark backgrounds (e.g., `text-amber-400`, `text-green-400`, `text-red-400`, `text-gray-400`) that are too low contrast in light mode.

**Step 1: Read split volley section (~lines 1716–1756)**

Find all theme-unconditional color classes and make them theme-conditional.

**Step 2: Fix wound allocation "X/Y allocated" count color (~line 1720)**

Current:
```jsx
<div className={`text-xs font-bold ${extraWoundsSum <= totalSavableWounds ? "text-green-400" : "text-red-400"}`}>
```
Replace with:
```jsx
<div className={`text-xs font-bold ${extraWoundsSum <= totalSavableWounds ? (theme === "dark" ? "text-green-400" : "text-green-700") : (theme === "dark" ? "text-red-400" : "text-red-600")}`}>
```

**Step 3: Fix Target 1 wounds display value (~line 1727)**

Current:
```jsx
<span className={`w-14 rounded border p-1.5 text-center font-bold text-base ${theme === "dark" ? "bg-gray-900/20 border-gray-700 text-amber-400" : "bg-gray-50 border-gray-200 text-amber-600"}`}>{target1Wounds}</span>
```
This is already theme-conditional (`text-amber-400` dark, `text-amber-600` light). ✓ No change needed.

**Step 4: Fix "wounds (remainder)" label (~line 1728)**

Current:
```jsx
<span className="text-xs text-gray-400">wounds (remainder)</span>
```
Replace with:
```jsx
<span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>wounds (remainder)</span>
```

**Step 5: Fix "wounds" label on extra targets (~line 1740)**

Current:
```jsx
<span className="text-xs text-gray-400">wounds</span>
```
Replace with:
```jsx
<span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>wounds</span>
```

**Step 6: Fix extra target stats panel header (~line 1756)**

Current:
```jsx
<div className="text-sm font-extrabold mb-3 text-amber-400">🎯 Target {i + 2} — Stats</div>
```
Replace with:
```jsx
<div className={`text-sm font-extrabold mb-3 ${theme === "dark" ? "text-amber-400" : "text-amber-700"}`}>🎯 Target {i + 2} — Stats</div>
```

**Step 7: Fix split dice section allocation text (~line 1981)**

Current:
```jsx
<div className={`text-xs mb-2 ${theme === "dark" ? "text-amber-400" : "text-amber-600"}`}>
```
This is already theme-conditional. ✓ No change needed.

**Step 8: Fix split summary header "⚔️ Split Volley Summary" (~line ~2199)**

Read lines ~2195–2205 to find the exact line. Look for `text-amber-` or hard-coded colors in that area.

Current (likely):
```jsx
<div className="text-sm font-semibold mb-2 ...">⚔️ Split Volley Summary</div>
```
Make any unthemed text color conditional.

**Step 9: Fix split summary tile text colors (~lines 2204–2216)**

Look for `text-gray-400` in the split summary tile labels — these labels may be too light in light mode. Change to:
```jsx
className={`text-xs uppercase tracking-widest ${theme === "dark" ? "text-gray-400" : "text-gray-500"} mb-1`}
```
(Apply to each tile's label.)

The damage number colors (`text-amber-400`, `text-orange-400`, `text-amber-300`) are fine on dark but need adjusting for light:
```jsx
// Target A damage number
<div className={`text-2xl font-black ${theme === "dark" ? "text-amber-400" : "text-amber-700"}`}>...</div>
// Target B
<div className={`text-2xl font-black ${theme === "dark" ? "text-orange-400" : "text-orange-700"}`}>...</div>
// Total
<div className={`text-2xl font-black ${theme === "dark" ? "text-amber-300" : "text-amber-800"}`}>...</div>
```

**Step 10: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

**Step 11: Commit**

```bash
git add src/App.jsx
git commit -m "fix: split volley font contrast in light mode"
```

---

## Task 5: Fix Split Volley Save Roll Validation

**Files:**
- Modify: `src/App.jsx` (~line 956)

**Problem:** In split mode, `hasSaveCountError` uses `saveEntered !== saveNeeded`. But in split mode, the calculator slices the first `target1Wounds` dice from `saveRollsText`. If the user enters MORE dice than `target1Wounds` (e.g., they had all wounds entered before splitting), the display incorrectly shows a red border even though the calculator is using the correct number of sliced dice.

**Step 1: Read `hasSaveCountError` definition (~line 956)**

Current:
```js
const hasSaveCountError = saveNeeded > 0 && saveEntered !== saveNeeded;
```

**Step 2: Change to allow extra dice in split mode**

```js
const hasSaveCountError = splitEnabled
  ? (saveNeeded > 0 && saveEntered < saveNeeded)
  : (saveNeeded > 0 && saveEntered !== saveNeeded);
```

This means: in split mode, a red border only appears when the user has entered FEWER dice than `target1Wounds`. Having more is fine (the calculator slices them). In non-split mode, the existing exact-count check is preserved.

**Step 3: No tests exist for hasSaveCountError computation, so verify visually via build**

```bash
npm run build 2>&1 | tail -10
npm test -- --run 2>&1 | tail -10
```
Expected: build clean, 27/27 tests pass.

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "fix: split volley T1 save roll validation allows excess dice (sliced by calculator)"
```

---

## Task 6: Autohide Wound Rolls and Save Rolls

**Files:**
- Modify: `src/App.jsx` (~lines 1906–1972)

**Goal:** Progressively reveal dice fields as the attack sequence advances:
- Wound rolls: only show when `woundNeeded > 0` (i.e., there are actual hits to wound)
- Wound reroll field: only show when `woundNeeded > 0` (already gated on reroll checkbox — add the extra condition)
- Save rolls (T1): only show when `saveNeeded > 0`
- FNP rolls: only show when `fnpNeeded > 0` (already computes to 0 when no damage)

When hit dice are entered but all miss, `woundNeeded` is already 0 — the wound field simply doesn't appear, and the existing 0-damage result is shown in Results.

**Step 1: Read wound rolls Field (~lines 1906–1921)**

Current:
```jsx
<Field
  label={<CounterLabel prefix="Wound rolls" need={woundNeeded} ... />}
  hint={`One die per hit...`}
>
  ...
</Field>
```

**Step 2: Wrap wound rolls in `{woundNeeded > 0 && (...)}`**

```jsx
{woundNeeded > 0 && (
  <Field
    label={<CounterLabel prefix="Wound rolls" need={woundNeeded} entered={woundEntered} remaining={woundNeeded - woundEntered} theme={theme} />}
    hint={`One die per hit (incl. Sustained bonus hits). Lethal Hits skip directly to saves — auto-wounds this volley: ${activeComputed.autoWoundsFromLethal}. Count must match the wound roll pool.`}
  >
    <div className="flex gap-2">
      <input
        className={`flex-1 rounded border p-2 text-lg font-semibold ${hasWoundCountError ? "border-red-500 ring-2 ring-red-200" : ""}`}
        value={woundRollsText}
        onChange={(e) => setWoundRollsText(e.target.value)}
        placeholder="e.g. 6 4 3 1 ..."
      />
      <button type="button" title="Roll for me" disabled={woundNeeded === 0}
        onClick={() => setWoundRollsText(rollDice(woundNeeded, 6))}
        className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
    </div>
  </Field>
)}
```

**Step 3: Read wound reroll field (~lines 1923–1935)**

Current:
```jsx
{(rerollWoundOnes || rerollWoundFails || twinLinked) ? (
  <Field label={<CounterLabel prefix="Wound reroll dice" .../>} ...>
    ...
  </Field>
) : null}
```

**Step 4: Add `&& woundNeeded > 0` to wound reroll condition**

```jsx
{(rerollWoundOnes || rerollWoundFails || twinLinked) && woundNeeded > 0 ? (
  <Field label={<CounterLabel prefix="Wound reroll dice" need={woundRerollNeeded} entered={woundRerollEntered} remaining={woundRerollNeeded - woundRerollEntered} theme={theme} />}
    hint="Enter rerolled wound dice in order for each eligible reroll."
  >
    <input
      className={`w-full rounded border p-2 text-lg font-semibold ${hasWoundRerollCountError ? "border-red-500 ring-2 ring-red-200" : ""}`}
      value={woundRerollRollsText}
      onChange={(e) => setWoundRerollRollsText(e.target.value)}
      placeholder="e.g. 5 4 ..."
    />
  </Field>
) : null}
```

**Step 5: Read save rolls (T1) Field (~lines 1937–1953)**

Current:
```jsx
<div className={`text-sm font-extrabold ... mt-2 mb-0`}>🎯 Target 1 — Dice</div>
<Field
  label={<CounterLabel prefix={splitEnabled ? "Save rolls (T1)" : "Save rolls"} need={saveNeeded} .../>}
  hint="One die per savable wound..."
>
  ...
</Field>
```

**Step 6: Wrap save rolls in `{saveNeeded > 0 && (...)}`**

Also wrap the "🎯 Target 1 — Dice" sub-header in the same condition (no point showing it if the save rolls are hidden):

```jsx
{saveNeeded > 0 && (
  <>
    <div className={`text-sm font-extrabold tracking-wide mt-2 mb-0 uppercase ${theme === "dark" ? "text-amber-300/80" : "text-amber-700/80"}`}>🎯 Target 1 — Dice</div>
    <Field
      label={<CounterLabel prefix={splitEnabled ? "Save rolls (T1)" : "Save rolls"} need={saveNeeded} entered={saveEntered} remaining={saveNeeded - saveEntered} />}
      hint="One die per savable wound. Mortal wounds (Devastating) bypass saves and go straight to damage. Count must equal wounds allocated to this target."
    >
      <div className="flex gap-2">
        <input
          className={`flex-1 rounded border p-2 text-lg font-semibold ${hasSaveCountError ? "border-red-500 ring-2 ring-red-200" : ""}`}
          value={saveRollsText}
          onChange={(e) => setSaveRollsText(e.target.value)}
          placeholder="e.g. 5 2 6 ..."
        />
        <button type="button" title="Roll for me" disabled={saveNeeded === 0}
          onClick={() => setSaveRollsText(rollDice(saveNeeded, 6))}
          className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
      </div>
    </Field>
  </>
)}
```

**Step 7: Read FNP field (~lines 1955–1972)**

Current:
```jsx
{(fnpEnabled && fnp !== "") ? (
  <Field label={<CounterLabel prefix="FNP rolls" need={fnpNeeded} .../>} hint="...">
    ...
  </Field>
) : null}
```

**Step 8: Change FNP condition to `fnpNeeded > 0`**

`fnpNeeded` is already computed as `fnpEnabled && fnp !== "" ? activeComputed.totalPreFnp : 0`. It is 0 when there's no damage (before save rolls produce failed saves). Using `fnpNeeded > 0` auto-reveals FNP only when there is actual damage to save:

```jsx
{fnpNeeded > 0 ? (
  <Field
    label={<CounterLabel prefix="FNP rolls" need={fnpNeeded} entered={fnpEntered} remaining={fnpNeeded - fnpEntered} />}
    hint="Only if FNP is enabled. One die per point of damage."
  >
    <div className="flex gap-2">
      <input
        className={`flex-1 rounded border p-2 text-lg font-semibold ${hasFnpCountError ? "border-red-500 ring-2 ring-red-200" : ""}`}
        value={fnpRollsText}
        onChange={(e) => setFnpRollsText(e.target.value)}
        placeholder="e.g. 1 5 6 2 ..."
      />
      <button type="button" title="Roll for me" disabled={fnpNeeded === 0}
        onClick={() => setFnpRollsText(rollDice(fnpNeeded, 6))}
        className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
    </div>
  </Field>
) : null}
```

**Step 9: Update `diceReady` to not require wound/save count checks when fields are hidden**

Read ~lines 981–987. Current:
```js
const diceReady =
  statsReady &&
  activeComputed.errors.length === 0 &&
  !hasHitCountError &&
  !hasWoundCountError &&
  !hasSaveCountError &&
  !hasFnpCountError;
```

With autohide, if `woundNeeded = 0` then `hasWoundCountError = woundEntered !== 0` could still be true if a user previously entered wounds. Guard it:

```js
const diceReady =
  statsReady &&
  activeComputed.errors.length === 0 &&
  !hasHitCountError &&
  (woundNeeded === 0 || !hasWoundCountError) &&
  (saveNeeded === 0 || !hasSaveCountError) &&
  (fnpNeeded === 0 || !hasFnpCountError);
```

**Step 10: Build and run tests**

```bash
npm run build 2>&1 | tail -10
npm test -- --run 2>&1 | tail -10
```
Expected: build clean, 27/27 tests pass.

**Step 11: Commit**

```bash
git add src/App.jsx
git commit -m "feat: autohide wound/save/FNP fields until prior phase has results"
```

---

## Task 7: Footer Cleanup

**Files:**
- Modify: `src/App.jsx` (sticky header ~1370–1392, footer ~2300–2437)

**Changes:**
1. Add theme toggle button to sticky header (next to simple/complex)
2. Remove the entire "Reference and accuracy" panel (lines ~2300–2327) and accuracy chips row (lines ~2329–2343)
3. Replace it with a compact toggle row for the remaining footer sections
4. Remove the "Deterministic Combat Patrol-first rules interpretation. Manual dice entry. Not official rules." line (~line 2435)

**Step 1: Read sticky header (~lines 1370–1392)**

Find where the simple/complex toggle button is.

**Step 2: Add theme toggle button in sticky header, right of simple/complex**

Find this button:
```jsx
<button ... onClick={toggleSimpleMode}>
  {simpleMode ? "Simple" : "Complex"}
</button>
```

Add immediately after it:
```jsx
<button
  type="button"
  className={`rounded px-2 py-1 text-xs font-bold border transition shrink-0 ${theme === "dark" ? "bg-slate-800 border-gray-600 text-gray-300 hover:bg-slate-700" : "bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200"}`}
  onClick={toggleTheme}
  title="Toggle dark/light theme"
>
  {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
</button>
```

**Step 3: Read footer reference section (~lines 2300–2343)**

The block to remove:
```jsx
<div className="rounded-2xl bg-gray-900/40 border border-gray-700 text-gray-100 p-4">
  ...Reference and accuracy heading, accuracy text, toggle buttons row...
</div>

<div className="mt-3 flex flex-wrap ...">
  <Chip>~96–98% Combat Patrol</Chip>
  <Chip>~85–95% full 40k</Chip>
  ...
</div>
```

**Step 4: Remove reference section and chips row**

Delete lines ~2300–2343 entirely (the `rounded-2xl bg-gray-900/40` div and the chips `mt-3 flex flex-wrap` div below it).

**Step 5: Add compact toggle row in place of removed section**

Insert at that position:
```jsx
<div className="flex flex-wrap gap-2 mb-3">
  {[
    { label: showTableUse ? "Hide table guide" : "📋 Table guide", on: showTableUse, action: () => setShowTableUse(!showTableUse) },
    { label: showDiceRef ? "Hide dice ref" : "🎲 Dice ref", on: showDiceRef, action: () => setShowDiceRef(!showDiceRef) },
    { label: showLimitations ? "Hide limitations" : "Limitations", on: showLimitations, action: () => setShowLimitations(!showLimitations) },
    { label: showCheatSheet ? "Hide cheat sheet" : "Cheat sheet", on: showCheatSheet, action: () => setShowCheatSheet(!showCheatSheet) },
    { label: `Preserve hooks: ${preserveHooks ? "ON" : "OFF"}`, on: preserveHooks, action: () => setPreserveHooks(!preserveHooks) },
    { label: `Strict: ${strictMode ? "ON" : "OFF"}`, on: strictMode, action: () => setStrictMode(!strictMode) },
    { label: showLog ? "Hide log" : "Show log", on: showLog, action: () => setShowLog(!showLog) },
  ].map(({ label, on, action }) => (
    <button key={label} type="button"
      className={`rounded px-2 py-1 text-xs font-semibold border transition ${on ? "bg-amber-600/70 text-white border-amber-500/40" : "bg-gray-900 text-gray-300 border-gray-700 hover:bg-gray-800"}`}
      onClick={action}>
      {label}
    </button>
  ))}
</div>
```

**Step 6: Remove "Deterministic Combat Patrol..." line (~line 2435)**

Find in the bottom credits block:
```jsx
<div>Deterministic Combat Patrol-first rules interpretation. Manual dice entry. Not official rules.</div>
```
Delete this line only. Keep the copyright line.

**Step 7: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

**Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat: footer cleanup — remove reference section, add theme toggle to header"
```

---

## Task 8: Update Limitations and Not-Implemented Content

**Files:**
- Modify: `src/App.jsx` (~lines 2370–2403)

**Changes:**
1. Remove "Multi-target allocation" from Not implemented (split volley now handles up to 4 targets)
2. Add "Split Volley (up to 4 targets)" and "Wahapedia lookup (live or training data)" to Implemented
3. Update accuracy language to reflect live data source
4. Update "not implemented" list with current gaps

**Step 1: Read limitations block (~lines 2370–2404)**

**Step 2: Update the Implemented list**

Current implemented list items (roughly):
- Manual dice entry with step-by-step log
- Hit, wound, save, FNP sequencing
- Crit thresholds, Sustained Hits, Lethal Hits, Devastating Wounds
- Rerolls: reroll 1s and reroll fails for both hit and wound rolls; Twin-linked
- Rapid Fire X
- Variable attacks
- Cover, Ignore AP, Ignore first failed save, Half damage, -1 Damage
- Step-by-step Wizard with auto-roll

Add to Implemented:
```jsx
<li>Split Volley — divide wounds across up to 4 targets, each with their own stats and save dice</li>
<li>Unit lookup via Wahapedia (live data) or training data — fill weapon/target stats by description</li>
```

**Step 3: Update accuracy note at top of limitations block (~line 2372)**

Change:
```jsx
<div className="text-sm font-semibold">Accuracy and limitations (Combat Patrol focus)</div>
```
To:
```jsx
<div className="text-sm font-semibold">Accuracy and limitations</div>
```
And change the sub-text:
```jsx
<div className="text-xs text-gray-300 mt-1">
  Goal: accurate, table-friendly attack resolution. This tool is not a full game tracker.
</div>
```
To:
```jsx
<div className="text-xs text-gray-300 mt-1">
  Goal: accurate, table-friendly attack resolution for 40k 10th edition. Weapon stats sourced live from Wahapedia where available.
</div>
```

**Step 4: Update Not implemented list**

Current:
```jsx
<ul className="mt-2 list-disc pl-5 text-gray-200 space-y-1">
  <li>Multi-target allocation</li>
  <li>Model-level damage caps and unit wound tracking</li>
  <li>All full-40k edge-case keyword interactions</li>
</ul>
```

Replace with:
```jsx
<ul className="mt-2 list-disc pl-5 text-gray-200 space-y-1">
  <li>Unit wound tracking and model removal (no health-pool management)</li>
  <li>Look Out Sir and leader targeting rules</li>
  <li>Stratagems and command point spending</li>
  <li>All full-40k edge-case keyword interactions (Indirect Fire, Blast, etc.)</li>
</ul>
```

**Step 5: Build and run tests**

```bash
npm run build 2>&1 | tail -10
npm test -- --run 2>&1 | tail -10
```
Expected: build clean, 27/27 tests pass.

**Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "docs: update limitations section — add split volley/lookup to implemented, refresh not-implemented list"
```

---

## Final Verification

After all 8 tasks:

```bash
npm run build 2>&1 | tail -15
npm test -- --run 2>&1 | tail -10
git log --oneline -10
```

Expected: clean build (only pre-existing `inputMode` duplicate warnings), 27/27 tests pass, 8+ commits since the disambiguation feature.
