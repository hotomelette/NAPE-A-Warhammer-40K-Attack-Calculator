# Natural Language Unit Lookup — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users type a unit name into a text bar and auto-fill attacker or defender stats via the Claude API (called directly from the browser), with an API key stored in localStorage.

**Architecture:** A new `src/claudeService.js` module handles the Claude API call and maps the JSON response to app state fields. A `src/useUnitLookup.js` hook manages loading/error state. A `src/SettingsPanel.jsx` component handles API key entry. The text input lives in the sticky header; "Fill Attacker" and "Fill Defender" buttons live inside their respective stat sections in `src/App.jsx`.

**Tech Stack:** React 19, `@anthropic-ai/sdk`, Tailwind CSS v4, Vite, Vitest (added in Task 1)

---

### Task 1: Install dependencies and configure Vitest

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Create: `src/test/setup.js`

**Step 1: Install packages**

```bash
npm install @anthropic-ai/sdk
npm install --save-dev vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
```

**Step 2: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 3: Configure vitest in vite.config.js**

Replace the entire file with:
```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    globals: true,
  },
});
```

**Step 4: Create test setup file**

Create `src/test/setup.js`:
```js
import "@testing-library/jest-dom";
```

**Step 5: Verify tests can run**

```bash
npm test
```
Expected: "No test files found" — that's fine, confirms vitest is wired up.

**Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.js src/test/setup.js
git commit -m "chore: add @anthropic-ai/sdk and vitest test setup"
```

---

### Task 2: Create claudeService.js — API call and response mapping

**Files:**
- Create: `src/claudeService.js`
- Create: `src/claudeService.test.js`

**Background:** The Claude API is called with a system prompt instructing it to return only JSON. The response is parsed and mapped to either weapon fields (attacker) or target fields (defender). The API key is read from `localStorage` at call time.

**Step 1: Write the failing tests**

Create `src/claudeService.test.js`:
```js
import { describe, it, expect } from "vitest";
import { mapToWeaponFields, mapToTargetFields } from "./claudeService.js";

describe("mapToWeaponFields", () => {
  it("maps numeric attacker fields from Claude JSON", () => {
    const raw = { attacks: 1, bs: 3, strength: 8, ap: -3, damage: 3 };
    const result = mapToWeaponFields(raw);
    expect(result.attacksFixed).toBe(true);
    expect(result.attacksValue).toBe("1");
    expect(result.toHit).toBe("3");
    expect(result.strength).toBe("8");
    expect(result.ap).toBe("-3");
    expect(result.damageFixed).toBe(true);
    expect(result.damageValue).toBe("3");
  });

  it("maps boolean keywords", () => {
    const raw = { attacks: 4, bs: 3, strength: 5, ap: 0, damage: 1, torrent: true, twinLinked: true };
    const result = mapToWeaponFields(raw);
    expect(result.torrent).toBe(true);
    expect(result.twinLinked).toBe(true);
    expect(result.lethalHits).toBe(false);
  });

  it("maps sustainedHitsN when sustainedHits is true", () => {
    const raw = { attacks: 2, bs: 3, strength: 4, ap: 0, damage: 1, sustainedHits: true, sustainedHitsN: 2 };
    const result = mapToWeaponFields(raw);
    expect(result.sustainedHits).toBe(true);
    expect(result.sustainedHitsN).toBe(2);
  });

  it("handles string damage like 'D6'", () => {
    const raw = { attacks: 1, bs: 4, strength: 9, ap: -4, damage: "D6" };
    const result = mapToWeaponFields(raw);
    expect(result.damageFixed).toBe(false);
    expect(result.damageValue).toBe("D6");
  });

  it("handles string attacks like 'D6'", () => {
    const raw = { attacks: "D6", bs: 3, strength: 6, ap: -1, damage: 2 };
    const result = mapToWeaponFields(raw);
    expect(result.attacksFixed).toBe(false);
    expect(result.attacksValue).toBe("D6");
  });
});

describe("mapToTargetFields", () => {
  it("maps numeric defender fields", () => {
    const raw = { toughness: 8, save: 3, invulnSave: 4 };
    const result = mapToTargetFields(raw);
    expect(result.toughness).toBe("8");
    expect(result.armorSave).toBe("3");
    expect(result.invulnSave).toBe("4");
  });

  it("maps fnpSave to fnpEnabled=true and fnp value", () => {
    const raw = { toughness: 5, save: 3, fnpSave: 5 };
    const result = mapToTargetFields(raw);
    expect(result.fnpEnabled).toBe(true);
    expect(result.fnp).toBe("5");
  });

  it("omits invulnSave if not present", () => {
    const raw = { toughness: 4, save: 4 };
    const result = mapToTargetFields(raw);
    expect(result.invulnSave).toBe("");
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
npm test
```
Expected: FAIL — `mapToWeaponFields` and `mapToTargetFields` not defined.

**Step 3: Implement claudeService.js**

Create `src/claudeService.js`:
```js
import Anthropic from "@anthropic-ai/sdk";

const ATTACKER_SYSTEM_PROMPT = `You are a Warhammer 40,000 10th edition rules expert.
Given a unit/weapon description, return ONLY a valid JSON object with these fields (omit any you are unsure of):
{
  "attacks": number or string (e.g. 1, 4, "D6", "2D6+1"),
  "bs": number (the target number to hit, e.g. 3 means roll 3+),
  "strength": number,
  "ap": number (negative values, e.g. -3 for AP-3; use 0 for no AP),
  "damage": number or string (e.g. 1, 3, "D3", "D6"),
  "torrent": boolean,
  "lethalHits": boolean,
  "sustainedHits": boolean,
  "sustainedHitsN": number,
  "devastatingWounds": boolean,
  "twinLinked": boolean
}
Use your best judgement for misspellings and partial names.
Pick the most common/standard loadout if none is specified.
Return ONLY the raw JSON object with no markdown, no explanation, no prose.`;

const DEFENDER_SYSTEM_PROMPT = `You are a Warhammer 40,000 10th edition rules expert.
Given a unit description, return ONLY a valid JSON object with these fields (omit any you are unsure of):
{
  "toughness": number,
  "save": number (the armor save target number, e.g. 3 means 3+),
  "invulnSave": number or null (e.g. 4 means 4++ invulnerable; omit if none),
  "fnpSave": number or null (e.g. 5 for 5+ Feel No Pain or Reanimation Protocols; omit if none)
}
Use your best judgement for misspellings and partial names.
Return ONLY the raw JSON object with no markdown, no explanation, no prose.`;

export function mapToWeaponFields(raw) {
  const isDiceString = (v) => typeof v === "string" && /[dD]/.test(v);

  const attacksFixed = !isDiceString(raw.attacks);
  const damageFixed = !isDiceString(raw.damage);

  return {
    attacksFixed,
    attacksValue: raw.attacks != null ? String(raw.attacks) : "",
    toHit: raw.bs != null ? String(raw.bs) : "",
    strength: raw.strength != null ? String(raw.strength) : "",
    ap: raw.ap != null ? String(raw.ap) : "",
    damageFixed,
    damageValue: raw.damage != null ? String(raw.damage) : "",
    torrent: Boolean(raw.torrent),
    lethalHits: Boolean(raw.lethalHits),
    sustainedHits: Boolean(raw.sustainedHits),
    sustainedHitsN: raw.sustainedHitsN != null ? Number(raw.sustainedHitsN) : 1,
    devastatingWounds: Boolean(raw.devastatingWounds),
    twinLinked: Boolean(raw.twinLinked),
  };
}

export function mapToTargetFields(raw) {
  const result = {
    toughness: raw.toughness != null ? String(raw.toughness) : "",
    armorSave: raw.save != null ? String(raw.save) : "",
    invulnSave: raw.invulnSave != null ? String(raw.invulnSave) : "",
    fnpEnabled: raw.fnpSave != null,
    fnp: raw.fnpSave != null ? String(raw.fnpSave) : "",
  };
  return result;
}

export async function fetchAttackerStats(description, apiKey) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: ATTACKER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: description }],
  });
  const text = message.content[0].text.trim();
  const raw = JSON.parse(text);
  return mapToWeaponFields(raw);
}

export async function fetchDefenderStats(description, apiKey) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 128,
    system: DEFENDER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: description }],
  });
  const text = message.content[0].text.trim();
  const raw = JSON.parse(text);
  return mapToTargetFields(raw);
}
```

**Step 4: Run tests to confirm they pass**

```bash
npm test
```
Expected: All tests in `claudeService.test.js` PASS.

**Step 5: Commit**

```bash
git add src/claudeService.js src/claudeService.test.js
git commit -m "feat: add claudeService with unit lookup and field mapping"
```

---

### Task 3: Create useUnitLookup hook

**Files:**
- Create: `src/useUnitLookup.js`
- Create: `src/useUnitLookup.test.js`

**Background:** This hook holds the text input value, loading state, and error state. It exposes `fillAttacker(dispatch)` and `fillDefender(dispatch)` methods that call the service and dispatch the results.

**Step 1: Write the failing tests**

Create `src/useUnitLookup.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUnitLookup } from "./useUnitLookup.js";

vi.mock("./claudeService.js", () => ({
  fetchAttackerStats: vi.fn(),
  fetchDefenderStats: vi.fn(),
}));

import { fetchAttackerStats, fetchDefenderStats } from "./claudeService.js";

const mockApiKey = "sk-ant-test";
const getApiKey = () => mockApiKey;

describe("useUnitLookup", () => {
  it("starts with empty text, not loading, no error", () => {
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    expect(result.current.text).toBe("");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.lastFilled).toBe(null);
  });

  it("updates text via setText", () => {
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setText("crisis commander"));
    expect(result.current.text).toBe("crisis commander");
  });

  it("dispatches LOAD_WEAPON on fillAttacker success", async () => {
    const weaponFields = { attacksFixed: true, attacksValue: "1", toHit: "3", strength: "8", ap: "-3", damageFixed: true, damageValue: "3", torrent: false, lethalHits: false, sustainedHits: false, sustainedHitsN: 1, devastatingWounds: false, twinLinked: false };
    fetchAttackerStats.mockResolvedValueOnce(weaponFields);
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setText("crisis commander plasma rifle"));
    await act(() => result.current.fillAttacker(dispatch));
    expect(dispatch).toHaveBeenCalledWith({ type: "LOAD_WEAPON", weapon: weaponFields });
    expect(result.current.lastFilled).toBe("attacker");
    expect(result.current.error).toBe(null);
  });

  it("sets error on fillAttacker failure", async () => {
    fetchAttackerStats.mockRejectedValueOnce(new Error("API error"));
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setText("???"));
    await act(() => result.current.fillAttacker(dispatch));
    expect(result.current.error).toBe("Couldn't identify unit — try a different description");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches LOAD_TARGET on fillDefender success", async () => {
    const targetFields = { toughness: "8", armorSave: "3", invulnSave: "4", fnpEnabled: false, fnp: "" };
    fetchDefenderStats.mockResolvedValueOnce(targetFields);
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setText("canoptek doomstalker"));
    await act(() => result.current.fillDefender(dispatch));
    expect(dispatch).toHaveBeenCalledWith({ type: "LOAD_TARGET", target: targetFields });
    expect(result.current.lastFilled).toBe("defender");
  });
});
```

**Step 2: Run to confirm failure**

```bash
npm test
```
Expected: FAIL — `useUnitLookup` not defined.

**Step 3: Implement useUnitLookup.js**

Create `src/useUnitLookup.js`:
```js
import { useState, useCallback } from "react";
import { fetchAttackerStats, fetchDefenderStats } from "./claudeService.js";

export function useUnitLookup(getApiKey) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFilled, setLastFilled] = useState(null);

  const fillAttacker = useCallback(async (dispatch) => {
    setLoading(true);
    setError(null);
    try {
      const apiKey = getApiKey();
      const fields = await fetchAttackerStats(text, apiKey);
      dispatch({ type: "LOAD_WEAPON", weapon: fields });
      setLastFilled("attacker");
    } catch {
      setError("Couldn't identify unit — try a different description");
    } finally {
      setLoading(false);
    }
  }, [text, getApiKey]);

  const fillDefender = useCallback(async (dispatch) => {
    setLoading(true);
    setError(null);
    try {
      const apiKey = getApiKey();
      const fields = await fetchDefenderStats(text, apiKey);
      dispatch({ type: "LOAD_TARGET", target: fields });
      setLastFilled("defender");
    } catch {
      setError("Couldn't identify unit — try a different description");
    } finally {
      setLoading(false);
    }
  }, [text, getApiKey]);

  return { text, setText, loading, error, lastFilled, fillAttacker, fillDefender };
}
```

**Step 4: Run tests**

```bash
npm test
```
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/useUnitLookup.js src/useUnitLookup.test.js
git commit -m "feat: add useUnitLookup hook"
```

---

### Task 4: Create SettingsPanel component

**Files:**
- Create: `src/SettingsPanel.jsx`

**Background:** A gear icon (⚙) in the header opens an inline settings panel. The panel has a masked text input for the API key. Key is stored in `localStorage` under `nape_claude_api_key`. No dedicated test — the logic is trivial localStorage read/write.

**Step 1: Create SettingsPanel.jsx**

```jsx
import React, { useState } from "react";

const STORAGE_KEY = "nape_claude_api_key";

export function getApiKey() {
  try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
}

export function SettingsPanel({ theme }) {
  const dark = theme === "dark";
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(() => getApiKey());
  const [saved, setSaved] = useState(false);

  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, key.trim()); } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const clear = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setKey("");
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Settings"
        className={`rounded px-2 py-1 text-xs font-bold border transition ${open ? "bg-blue-600/80 text-white border-blue-500/40" : "bg-gray-900/80 text-gray-300 border-gray-700 hover:bg-gray-800"}`}
      >
        ⚙
      </button>
      {open && (
        <div className={`absolute right-0 top-9 z-50 w-72 rounded-lg border p-3 shadow-2xl space-y-2 ${dark ? "bg-gray-900 border-gray-600 text-gray-200" : "bg-white border-gray-300 text-gray-800"}`}>
          <div className="text-xs font-bold">Claude API Key</div>
          <input
            type="password"
            value={key}
            onChange={e => { setKey(e.target.value); setSaved(false); }}
            placeholder="sk-ant-..."
            className={`w-full rounded border px-2 py-1 text-xs font-mono ${dark ? "bg-gray-800 border-gray-600 text-gray-100" : "bg-gray-50 border-gray-300 text-gray-900"}`}
          />
          <div className="flex gap-2">
            <button type="button" onClick={save} className="flex-1 rounded bg-blue-600 text-white text-xs py-1 hover:bg-blue-500 transition">
              {saved ? "Saved ✓" : "Save"}
            </button>
            <button type="button" onClick={clear} className={`rounded border px-2 text-xs py-1 transition ${dark ? "border-gray-600 text-gray-400 hover:text-gray-200" : "border-gray-300 text-gray-500 hover:text-gray-700"}`}>
              Clear
            </button>
          </div>
          <p className={`text-xs leading-snug ${dark ? "text-gray-500" : "text-gray-400"}`}>
            Key is stored locally in your browser. Never sent anywhere except the Claude API.
          </p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify the app still builds**

```bash
npm run build
```
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add src/SettingsPanel.jsx
git commit -m "feat: add SettingsPanel component with localStorage API key management"
```

---

### Task 5: Add unit lookup text bar to App.jsx header

**Files:**
- Modify: `src/App.jsx`

**Background:** Add the text input bar directly below the sticky header row (between the header row and the main grid). Wire up `useUnitLookup` and `SettingsPanel`. Also add the gear icon to the header controls row.

**Step 1: Add imports at the top of App.jsx**

Find the existing import block at the top of `src/App.jsx`. Add after the last import line:
```js
import { SettingsPanel, getApiKey } from "./SettingsPanel.jsx";
import { useUnitLookup } from "./useUnitLookup.js";
```

**Step 2: Wire up the hook inside the App component**

Find the line in `App()` that reads:
```js
const [state, dispatch] = useReducer(appReducer, initialState);
```

Add immediately after it:
```js
const unitLookup = useUnitLookup(getApiKey);
```

**Step 3: Add gear icon to header controls row**

Find the header controls row that ends with the theme toggle button:
```jsx
            <button type="button"
              className="rounded px-2 py-1 text-xs font-bold border bg-gray-900/80 text-gray-300 border-gray-700 hover:bg-gray-800 transition shrink-0"
              onClick={toggleTheme}>
              {theme === "dark" ? "🌙" : "☀️"}
            </button>
          </div>
        </div>
```

Add `<SettingsPanel theme={theme} />` immediately before the closing `</div></div>`:
```jsx
            <button type="button"
              className="rounded px-2 py-1 text-xs font-bold border bg-gray-900/80 text-gray-300 border-gray-700 hover:bg-gray-800 transition shrink-0"
              onClick={toggleTheme}>
              {theme === "dark" ? "🌙" : "☀️"}
            </button>
            <SettingsPanel theme={theme} />
          </div>
        </div>
```

**Step 4: Add the unit lookup bar below the header, above the main grid**

Find the line:
```jsx
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-visible">
```

Insert the lookup bar immediately before it:
```jsx
                {/* ── Unit Lookup Bar ── */}
                <div className="max-w-screen-2xl mx-auto px-2 pb-1">
                  <div className={`flex gap-2 items-start rounded-lg border px-3 py-2 ${theme === "dark" ? "bg-gray-900/60 border-gray-700" : "bg-white/80 border-gray-300"}`}>
                    <input
                      type="text"
                      value={unitLookup.text}
                      onChange={e => unitLookup.setText(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !unitLookup.loading && unitLookup.text.trim() && getApiKey() && unitLookup.fillAttacker(dispatch)}
                      placeholder="Unit name — e.g. 'crisis commander plasma rifle' or 'doomstalker'"
                      className={`flex-1 rounded border px-2 py-1 text-sm ${theme === "dark" ? "bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500" : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400"}`}
                    />
                    {unitLookup.error && (
                      <span className="text-xs text-red-400 self-center shrink-0">{unitLookup.error}</span>
                    )}
                  </div>
                  {unitLookup.lastFilled && (
                    <p className="text-xs text-gray-500 mt-1 px-1">
                      Stats from Claude's training data — verify against your datasheet or{" "}
                      <a href="https://wahapedia.ru" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">Wahapedia</a>.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-visible">
```

**Step 5: Verify the app runs**

```bash
npm run dev
```
Expected: App loads, text bar appears below the header, gear icon appears in header.

**Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add unit lookup text bar and settings gear icon to header"
```

---

### Task 6: Add "Fill Attacker" button to Weapon section

**Files:**
- Modify: `src/App.jsx`

**Background:** The Weapon section is rendered inside a `<Section>` component. Find the `<Section theme={theme} title="Weapon">` tag and add a "Fill Attacker" button that calls `unitLookup.fillAttacker(dispatch)`. Show a tooltip if no API key is set.

**Step 1: Find the Weapon section opening tag**

Search in `src/App.jsx` for:
```jsx
<Section theme={theme} title="Weapon">
```
It is around line 1270.

**Step 2: The `Section` component accepts an `action` prop**

Look at the Section component definition (around line 99):
```jsx
function Section({ title, theme, children, action }) {
```
It renders `action` in the section header. Use this to place the Fill button.

**Step 3: Add the Fill Attacker button via the action prop**

Replace:
```jsx
<Section theme={theme} title="Weapon">
```
With:
```jsx
<Section theme={theme} title="Weapon" action={
  <FillButton
    label="Fill Attacker"
    loading={unitLookup.loading}
    disabled={!unitLookup.text.trim()}
    hasKey={!!getApiKey()}
    onClick={() => unitLookup.fillAttacker(dispatch)}
    theme={theme}
  />
}>
```

**Step 4: Add the FillButton helper component**

Add this component near the top of `App.jsx` (after the existing helper components, before the `App` function). A good place is just before the `getViz` function:

```jsx
function FillButton({ label, loading, disabled, hasKey, onClick, theme }) {
  const dark = theme === "dark";
  const noKey = !hasKey;
  const title = noKey ? "Add your Claude API key in ⚙ settings" : disabled ? "Type a unit name above first" : label;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled || noKey}
      title={title}
      className={`rounded px-2 py-0.5 text-xs font-bold border transition shrink-0 ${
        loading
          ? "opacity-50 cursor-wait border-blue-500/40 text-blue-300 bg-blue-900/30"
          : noKey || disabled
          ? "opacity-40 cursor-not-allowed border-gray-600 text-gray-500 bg-transparent"
          : dark
          ? "border-blue-500/60 text-blue-300 bg-blue-900/40 hover:bg-blue-800/60"
          : "border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100"
      }`}
    >
      {loading ? "…" : label}
    </button>
  );
}
```

**Step 5: Verify the app runs and the button appears**

```bash
npm run dev
```
Expected: "Fill Attacker" button appears in the Weapon section header.

**Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add Fill Attacker button to Weapon section"
```

---

### Task 7: Add "Fill Defender" button to Target section

**Files:**
- Modify: `src/App.jsx`

**Step 1: Find the Target section opening tag**

Search for `<Section theme={theme} title="Target">` in `src/App.jsx`.

**Step 2: Add the Fill Defender button via the action prop**

Replace:
```jsx
<Section theme={theme} title="Target">
```
With:
```jsx
<Section theme={theme} title="Target" action={
  <FillButton
    label="Fill Defender"
    loading={unitLookup.loading}
    disabled={!unitLookup.text.trim()}
    hasKey={!!getApiKey()}
    onClick={() => unitLookup.fillDefender(dispatch)}
    theme={theme}
  />
}>
```

**Step 3: Verify the app runs and the button appears**

```bash
npm run dev
```
Expected: "Fill Defender" button appears in the Target section header.

**Step 4: Run all tests**

```bash
npm test
```
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add Fill Defender button to Target section"
```

---

### Task 8: Manual integration test

**No files changed — this is a verification step.**

**Step 1: Start the dev server**

```bash
npm run dev
```

**Step 2: Add your Claude API key**
- Click the ⚙ gear icon in the header
- Paste a valid Claude API key (starts with `sk-ant-`)
- Click Save
- Close the panel

**Step 3: Test attacker fill**
- Type `crisis commander plasma rifle` in the lookup bar
- Click "Fill Attacker"
- Expected: Attacks=1, BS=3, S=8, AP=-3, D=3 are filled in the Weapon section
- Disclaimer appears: "Stats from Claude's training data — verify against your datasheet or Wahapedia"

**Step 4: Test defender fill**
- Type `canoptek doomstalker` in the lookup bar
- Click "Fill Defender"
- Expected: T=8, Save=3, Invuln=4, FNP=5+ are filled in the Target section

**Step 5: Test fuzzy/misspelling**
- Type `spase marin intersesor` in the lookup bar
- Click "Fill Attacker"
- Expected: Sensible Space Marine Intercessor bolt rifle stats appear

**Step 6: Test missing API key**
- Clear the API key in settings
- Expected: Fill buttons are greyed out with tooltip "Add your Claude API key in ⚙ settings"

**Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete natural language unit lookup feature"
```
