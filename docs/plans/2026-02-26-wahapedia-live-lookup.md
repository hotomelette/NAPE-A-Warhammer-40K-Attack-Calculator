# Wahapedia Live Lookup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace training-data-only unit lookup with a two-phase flow that fetches the real Wahapedia datasheet, returning accurate stats, a direct unit page link, and a clear live-vs-training source indicator.

**Architecture:** Phase 1 — Claude resolves the unit description to a Wahapedia path (e.g. `tau-empire/Crisis-Battlesuits`). Phase 2 — a Cloudflare Worker CORS proxy fetches that page and returns stripped text. Phase 3 — Claude reads the real datasheet text (or falls back to training data if the fetch fails) and returns stats JSON plus metadata. `useUnitLookup` stores the metadata and `App.jsx` renders a source badge.

**Tech Stack:** React 19, Vite 7, @anthropic-ai/sdk, Vitest 4, Cloudflare Workers (wrangler CLI), Tailwind CSS v4.

---

## Context for the implementer

The app is a Warhammer 40K attack calculator. Two "Fill" buttons let users type a unit name and auto-populate stats via Claude. The relevant files are:

- `src/claudeService.js` — all Claude API calls. Currently a single-phase call per lookup. **This is the main file you will change.**
- `src/useUnitLookup.js` — React hook holding lookup text/loading/error state. Calls the service, dispatches to app reducer.
- `src/App.jsx` — renders the fill UI. Look for the two `{hasApiKey && ...}` blocks around lines 1311 and 1541.
- `src/claudeService.test.js` — pure-function tests for `mapToWeaponFields` / `mapToTargetFields`.
- `src/useUnitLookup.test.js` — hook tests; mocks `fetchAttackerStats` and `fetchDefenderStats`.

Run tests with: `npm test -- --run`

---

## Task 1: Cloudflare Worker CORS proxy

**Files:**
- Create: `worker/worker.js`
- Create: `worker/wrangler.toml`

This is a standalone mini-project. No automated tests — verify manually with curl after deploy.

**Step 1: Create `worker/worker.js`**

```js
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");
    if (!path) return json({ error: "missing_path" }, 400);

    const wahapediaUrl = `https://wahapedia.ru/wh40k10ed/factions/${path}`;
    try {
      const res = await fetch(wahapediaUrl, {
        headers: { "User-Agent": "NAPE-40K-Calculator/1.0" },
      });
      if (!res.ok) return json({ error: "not_found", status: res.status }, 404);

      const html = await res.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000);

      return json({ text, url: wahapediaUrl });
    } catch (e) {
      return json({ error: "fetch_failed", message: e.message }, 502);
    }
  },
};
```

**Step 2: Create `worker/wrangler.toml`**

```toml
name = "nape-wahapedia"
main = "worker.js"
compatibility_date = "2024-01-01"
```

**Step 3: Deploy the worker**

```bash
# Install wrangler if not already installed
npm install -g wrangler

# Log in to Cloudflare (opens browser)
wrangler login

# Deploy from the worker directory
cd worker
wrangler deploy
```

Expected output: `Published nape-wahapedia (first time deploy) https://nape-wahapedia.YOURSUBDOMAIN.workers.dev`

Note the URL — you will need it in the next task.

**Step 4: Test the worker with curl**

```bash
curl "https://nape-wahapedia.YOURSUBDOMAIN.workers.dev/wahapedia?path=necrons%2FCanoptek-Doomstalker"
```

Expected: JSON object with `text` (long string of datasheet content) and `url` fields.

```bash
curl "https://nape-wahapedia.YOURSUBDOMAIN.workers.dev/wahapedia?path=necrons%2FDoesNotExist"
```

Expected: `{"error":"not_found","status":404}`

**Step 5: Add worker URL to environment**

Create `.env.local` in the project root (this file is gitignored):

```
VITE_WAHAPEDIA_WORKER_URL=https://nape-wahapedia.YOURSUBDOMAIN.workers.dev
```

**Step 6: Commit**

```bash
cd ..
git add worker/worker.js worker/wrangler.toml
git commit -m "feat: add Cloudflare Worker CORS proxy for Wahapedia"
```

---

## Task 2: Two-phase lookup in `claudeService.js`

**Files:**
- Modify: `src/claudeService.js`
- Modify: `src/claudeService.test.js`

**Step 1: Write failing tests**

Add these tests to the bottom of `src/claudeService.test.js`:

```js
import { describe, it, expect, vi, afterEach } from "vitest";
// (keep existing imports at top, just add afterEach to the import)

// Add these describe blocks at the bottom of the file:

describe("fetchWahapediaPage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns text and url on success", async () => {
    const { fetchWahapediaPage } = await import("./claudeService.js");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: "datasheet content", url: "https://wahapedia.ru/wh40k10ed/factions/necrons/Canoptek-Doomstalker" }),
    }));
    const result = await fetchWahapediaPage("necrons/Canoptek-Doomstalker", "https://worker.example.com");
    expect(result).toEqual({ text: "datasheet content", url: "https://wahapedia.ru/wh40k10ed/factions/necrons/Canoptek-Doomstalker" });
  });

  it("returns null when worker reports not_found", async () => {
    const { fetchWahapediaPage } = await import("./claudeService.js");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ error: "not_found" }),
    }));
    const result = await fetchWahapediaPage("bad/Path", "https://worker.example.com");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    const { fetchWahapediaPage } = await import("./claudeService.js");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const result = await fetchWahapediaPage("any/Path", "https://worker.example.com");
    expect(result).toBeNull();
  });
});
```

**Step 2: Run tests — confirm they fail**

```bash
npm test -- --run
```

Expected: 3 new test failures — `fetchWahapediaPage is not a function` or similar.

**Step 3: Rewrite `src/claudeService.js`**

Replace the entire file with:

```js
import Anthropic from "@anthropic-ai/sdk";

const WORKER_URL = import.meta.env.VITE_WAHAPEDIA_WORKER_URL || null;

// ─── System prompts ──────────────────────────────────────────────────────────

const URL_RESOLUTION_PROMPT = `You are a Warhammer 40,000 10th edition rules expert.
Given a unit or weapon description, return ONLY the Wahapedia path for the unit's datasheet page.
The path format is: {faction-slug}/{Unit-Name-With-Hyphens}

Examples:
- "space marine intercessor bolt rifle" → space-marines/Intercessor-Squad
- "crisis battlesuits plasma" → tau-empire/Crisis-Battlesuits
- "forgefiend" → chaos-space-marines/Forgefiend
- "canoptek doomstalker" → necrons/Canoptek-Doomstalker
- "ork boy" → orks/Boyz

Rules:
- Return ONLY the path string. No URL prefix, no explanation, no markdown.
- For weapons, return the unit page that contains that weapon.
- Handle misspellings — match to the closest Wahapedia entry.
- If truly unknown, return: unknown`;

const ATTACKER_SYSTEM_PROMPT = `You are a Warhammer 40,000 10th edition rules expert.
Given a weapon description and optionally a Wahapedia datasheet, extract weapon stats.
Return ONLY a valid JSON object with these fields (omit any you are unsure of):
{
  "attacks": number or string — use exact GW dice notation: 1, 4, "D3", "D6", "2D6", "D6+1", "2D3+1",
  "bs": number (target number to hit, e.g. 3 means 3+),
  "strength": number,
  "ap": number (0 for no AP; use -1, -2, -3 for AP-1/2/3),
  "damage": number or string — use exact GW dice notation: 1, 3, "D3", "D6", "2D6", "D6+2",
  "torrent": boolean,
  "lethalHits": boolean,
  "sustainedHits": boolean,
  "sustainedHitsN": number (the X in SUSTAINED HITS X),
  "devastatingWounds": boolean,
  "twinLinked": boolean
}
Rules:
- If a Wahapedia datasheet is provided below, use it as the primary source of truth.
- Otherwise use your training knowledge of 10th edition datasheets.
- For dice values, use the exact GW notation. Never round — e.g. "2D6" not 7, "D6+1" not "D6".
- [TWIN-LINKED] → twinLinked: true. [TORRENT] → torrent: true. [LETHAL HITS] → lethalHits: true.
- [SUSTAINED HITS X] → sustainedHits: true, sustainedHitsN: X. [DEVASTATING WOUNDS] → devastatingWounds: true.
- If a unit has multiple weapon options, use the one named or the most common/iconic.
- Omit any field you are not confident in.
- Return ONLY the raw JSON object with no markdown, no explanation, no prose.`;

const DEFENDER_SYSTEM_PROMPT = `You are a Warhammer 40,000 10th edition rules expert.
Given a unit description and optionally a Wahapedia datasheet, extract defensive stats.
Return ONLY a valid JSON object with these fields (omit any you are unsure of):
{
  "toughness": number,
  "save": number (armor save target number, e.g. 3 means 3+),
  "invulnSave": number or null (e.g. 4 means 4++; omit if none),
  "fnpSave": number or null (e.g. 5 for 5+ Feel No Pain or Reanimation Protocols; omit if none)
}
Rules:
- If a Wahapedia datasheet is provided below, use it as the primary source of truth.
- Otherwise use your training knowledge of 10th edition datasheets.
- For Necron units with Reanimation Protocols, set fnpSave to 5.
- Omit any field you are not confident in.
- Return ONLY the raw JSON object with no markdown, no explanation, no prose.`;

// ─── Pure mapping functions (unchanged) ──────────────────────────────────────

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
  return {
    toughness: raw.toughness != null ? String(raw.toughness) : "",
    armorSave: raw.save != null ? String(raw.save) : "",
    invulnSave: raw.invulnSave != null ? String(raw.invulnSave) : "",
    fnpEnabled: raw.fnpSave != null,
    fnp: raw.fnpSave != null ? String(raw.fnpSave) : "",
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function parseJson(text) {
  const cleaned = text.trim().replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

async function resolveWahapediaPath(description, client) {
  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 64,
      temperature: 0,
      system: URL_RESOLUTION_PROMPT,
      messages: [{ role: "user", content: description }],
    });
    const path = msg.content[0].text.trim();
    if (!path || path === "unknown" || path.includes(" ")) return null;
    return path;
  } catch {
    return null;
  }
}

export async function fetchWahapediaPage(path, workerUrl) {
  try {
    const url = `${workerUrl}/wahapedia?path=${encodeURIComponent(path)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchAttackerStats(description, apiKey) {
  // Browser-direct by design; see docs/plans/2026-02-26-unit-lookup-design.md
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  // Phase 1: resolve Wahapedia path (always — gives a specific link even on training fallback)
  const path = await resolveWahapediaPath(description, client);
  const wahapediaUrl = path
    ? `https://wahapedia.ru/wh40k10ed/factions/${path}`
    : "https://wahapedia.ru";

  // Phase 2: fetch live page if worker is configured
  let pageContent = null;
  let source = "training";
  let fetchedAt;
  if (WORKER_URL && path) {
    const page = await fetchWahapediaPage(path, WORKER_URL);
    if (page) {
      pageContent = page.text;
      source = "live";
      fetchedAt = new Date().toISOString();
    }
  }

  // Phase 3: extract stats (with or without live page)
  const userContent = pageContent
    ? `Unit/weapon: ${description}\n\nWahapedia datasheet:\n${pageContent}`
    : description;
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    temperature: 0,
    system: ATTACKER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  const raw = parseJson(msg.content[0].text);
  return { fields: mapToWeaponFields(raw), meta: { source, wahapediaUrl, fetchedAt } };
}

export async function fetchDefenderStats(description, apiKey) {
  // Browser-direct by design; see docs/plans/2026-02-26-unit-lookup-design.md
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  // Phase 1: resolve Wahapedia path
  const path = await resolveWahapediaPath(description, client);
  const wahapediaUrl = path
    ? `https://wahapedia.ru/wh40k10ed/factions/${path}`
    : "https://wahapedia.ru";

  // Phase 2: fetch live page if worker is configured
  let pageContent = null;
  let source = "training";
  let fetchedAt;
  if (WORKER_URL && path) {
    const page = await fetchWahapediaPage(path, WORKER_URL);
    if (page) {
      pageContent = page.text;
      source = "live";
      fetchedAt = new Date().toISOString();
    }
  }

  // Phase 3: extract stats
  const userContent = pageContent
    ? `Unit: ${description}\n\nWahapedia datasheet:\n${pageContent}`
    : description;
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 128,
    temperature: 0,
    system: DEFENDER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  const raw = parseJson(msg.content[0].text);
  return { fields: mapToTargetFields(raw), meta: { source, wahapediaUrl, fetchedAt } };
}
```

**Step 4: Run tests — confirm new tests pass, old ones still pass**

```bash
npm test -- --run
```

Expected: all tests pass (the 3 new `fetchWahapediaPage` tests + all 9 existing).

**Step 5: Commit**

```bash
git add src/claudeService.js src/claudeService.test.js
git commit -m "feat: two-phase Wahapedia lookup with live page fetch and source metadata"
```

---

## Task 3: Metadata state in `useUnitLookup.js`

**Files:**
- Modify: `src/useUnitLookup.js`
- Modify: `src/useUnitLookup.test.js`

`fetchAttackerStats` and `fetchDefenderStats` now return `{ fields, meta }` instead of a flat object. Update the hook to destructure this and expose `attackerMeta`/`defenderMeta`.

**Step 1: Write failing tests**

Add these tests to `src/useUnitLookup.test.js` (inside the existing `describe("useUnitLookup", ...)` block, after the last `it(...)`):

```js
  it("starts with null attackerMeta and defenderMeta", () => {
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    expect(result.current.attackerMeta).toBeNull();
    expect(result.current.defenderMeta).toBeNull();
  });

  it("stores attackerMeta on fillAttacker success", async () => {
    const weaponFields = { attacksFixed: true, attacksValue: "4", toHit: "3", strength: "7", ap: "-1", damageFixed: true, damageValue: "1", torrent: false, lethalHits: false, sustainedHits: false, sustainedHitsN: 1, devastatingWounds: false, twinLinked: false };
    const meta = { source: "live", wahapediaUrl: "https://wahapedia.ru/wh40k10ed/factions/tau-empire/Crisis-Battlesuits", fetchedAt: "2026-02-26T21:00:00Z" };
    fetchAttackerStats.mockResolvedValueOnce({ fields: weaponFields, meta });
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setAttackerText("crisis battlesuits plasma"));
    await act(() => result.current.fillAttacker(dispatch));
    expect(result.current.attackerMeta).toEqual(meta);
    expect(dispatch).toHaveBeenCalledWith({ type: "LOAD_WEAPON", weapon: weaponFields });
  });

  it("stores defenderMeta on fillDefender success", async () => {
    const targetFields = { toughness: "8", armorSave: "3", invulnSave: "4", fnpEnabled: false, fnp: "" };
    const meta = { source: "training", wahapediaUrl: "https://wahapedia.ru/wh40k10ed/factions/necrons/Canoptek-Doomstalker" };
    fetchDefenderStats.mockResolvedValueOnce({ fields: targetFields, meta });
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setDefenderText("canoptek doomstalker"));
    await act(() => result.current.fillDefender(dispatch));
    expect(result.current.defenderMeta).toEqual(meta);
    expect(dispatch).toHaveBeenCalledWith({ type: "LOAD_TARGET", target: targetFields });
  });
```

Also update the **existing** `"dispatches LOAD_WEAPON on fillAttacker success"` test — `fetchAttackerStats` now returns `{ fields, meta }`, so update its mock:

```js
  it("dispatches LOAD_WEAPON on fillAttacker success", async () => {
    const weaponFields = { attacksFixed: true, attacksValue: "1", toHit: "3", strength: "8", ap: "-3", damageFixed: true, damageValue: "3", torrent: false, lethalHits: false, sustainedHits: false, sustainedHitsN: 1, devastatingWounds: false, twinLinked: false };
    fetchAttackerStats.mockResolvedValueOnce({ fields: weaponFields, meta: { source: "training", wahapediaUrl: "https://wahapedia.ru" } });
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setAttackerText("crisis commander plasma rifle"));
    await act(() => result.current.fillAttacker(dispatch));
    expect(dispatch).toHaveBeenCalledWith({ type: "LOAD_WEAPON", weapon: weaponFields });
    expect(result.current.lastFilled).toBe("attacker");
    expect(result.current.attackerError).toBe(null);
  });
```

And update the **existing** `"dispatches LOAD_TARGET on fillDefender success"` test:

```js
  it("dispatches LOAD_TARGET on fillDefender success", async () => {
    const targetFields = { toughness: "8", armorSave: "3", invulnSave: "4", fnpEnabled: false, fnp: "" };
    fetchDefenderStats.mockResolvedValueOnce({ fields: targetFields, meta: { source: "training", wahapediaUrl: "https://wahapedia.ru" } });
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setDefenderText("canoptek doomstalker"));
    await act(() => result.current.fillDefender(dispatch));
    expect(dispatch).toHaveBeenCalledWith({ type: "LOAD_TARGET", target: targetFields });
    expect(result.current.lastFilled).toBe("defender");
    expect(result.current.defenderError).toBe(null);
  });
```

**Step 2: Run tests — confirm they fail**

```bash
npm test -- --run
```

Expected: several failures because `useUnitLookup` still destructures the old flat return value.

**Step 3: Update `src/useUnitLookup.js`**

Replace the entire file:

```js
import { useState, useCallback } from "react";
import { fetchAttackerStats, fetchDefenderStats } from "./claudeService.js";

function classifyError(err) {
  const msg = err?.message ?? "";
  if (msg.includes("credit balance is too low"))
    return "Insufficient API credits — add funds at console.anthropic.com";
  if (msg.includes("401") || msg.includes("authentication"))
    return "Invalid API key — check your key in ⚙ settings";
  return "Couldn't identify unit — try a different description";
}

export function useUnitLookup(getApiKey) {
  const [attackerText, setAttackerText] = useState("");
  const [defenderText, setDefenderText] = useState("");
  const [attackerLoading, setAttackerLoading] = useState(false);
  const [defenderLoading, setDefenderLoading] = useState(false);
  const [attackerError, setAttackerError] = useState(null);
  const [defenderError, setDefenderError] = useState(null);
  const [lastFilled, setLastFilled] = useState(null);
  const [attackerMeta, setAttackerMeta] = useState(null);
  const [defenderMeta, setDefenderMeta] = useState(null);

  const fillAttacker = useCallback(async (dispatch) => {
    setAttackerLoading(true);
    setAttackerError(null);
    try {
      const apiKey = getApiKey();
      const { fields, meta } = await fetchAttackerStats(attackerText, apiKey);
      dispatch({ type: "LOAD_WEAPON", weapon: fields });
      setAttackerMeta(meta);
      setLastFilled("attacker");
    } catch (err) {
      console.error("[UnitLookup] fillAttacker failed:", err);
      setAttackerError(classifyError(err));
    } finally {
      setAttackerLoading(false);
    }
  }, [attackerText, getApiKey]);

  const fillDefender = useCallback(async (dispatch) => {
    setDefenderLoading(true);
    setDefenderError(null);
    try {
      const apiKey = getApiKey();
      const { fields, meta } = await fetchDefenderStats(defenderText, apiKey);
      dispatch({ type: "LOAD_TARGET", target: fields });
      setDefenderMeta(meta);
      setLastFilled("defender");
    } catch (err) {
      console.error("[UnitLookup] fillDefender failed:", err);
      setDefenderError(classifyError(err));
    } finally {
      setDefenderLoading(false);
    }
  }, [defenderText, getApiKey]);

  return {
    attackerText, setAttackerText,
    defenderText, setDefenderText,
    attackerLoading, defenderLoading,
    attackerError, defenderError,
    lastFilled, fillAttacker, fillDefender,
    attackerMeta, defenderMeta,
  };
}
```

**Step 4: Run tests — confirm all pass**

```bash
npm test -- --run
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/useUnitLookup.js src/useUnitLookup.test.js
git commit -m "feat: expose attackerMeta/defenderMeta from useUnitLookup"
```

---

## Task 4: Source indicator UI in `App.jsx`

**Files:**
- Modify: `src/App.jsx`

Replace the two static "Stats from Claude's training data" paragraphs with a `LookupSourceBadge` component that shows live vs training state.

**Step 1: Add the `LookupSourceBadge` component**

In `src/App.jsx`, find the `FillButton` function (around line 154). Add the following component **directly after** the closing `}` of `FillButton`:

```jsx
function LookupSourceBadge({ meta, theme }) {
  if (!meta) return null;
  const dark = theme === "dark";
  const linkClass = `underline ${dark ? "hover:text-gray-200" : "hover:text-gray-700"}`;

  if (meta.source === "live") {
    const time = new Date(meta.fetchedAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
    return (
      <p className={`text-xs ${dark ? "text-green-400" : "text-green-600"}`}>
        ✓ Pulled from{" "}
        <a href={meta.wahapediaUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
          Wahapedia
        </a>
        {" "}· {time}
      </p>
    );
  }

  return (
    <p className={`text-xs ${dark ? "text-yellow-400" : "text-yellow-600"}`}>
      ⚠ Training data — verify on{" "}
      <a href={meta.wahapediaUrl || "https://wahapedia.ru"} target="_blank" rel="noopener noreferrer" className={linkClass}>
        Wahapedia
      </a>
    </p>
  );
}
```

**Step 2: Replace the attacker source message**

Find this exact line (~line 1325):
```jsx
                  {unitLookup.lastFilled === "attacker" && <p className="text-xs text-gray-500">Stats from Claude's training data — verify against your datasheet or <a href="https://wahapedia.ru" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">Wahapedia</a>.</p>}
```

Replace it with:
```jsx
                  <LookupSourceBadge meta={unitLookup.attackerMeta} theme={theme} />
```

**Step 3: Replace the defender source message**

Find this exact line (~line 1556):
```jsx
                  {unitLookup.lastFilled === "defender" && <p className="text-xs text-gray-500">Stats from Claude's training data — verify against your datasheet or <a href="https://wahapedia.ru" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">Wahapedia</a>.</p>}
```

Replace it with:
```jsx
                  <LookupSourceBadge meta={unitLookup.defenderMeta} theme={theme} />
```

**Step 4: Run tests**

```bash
npm test -- --run
```

Expected: all tests pass (App.jsx has no unit tests, but existing hook and service tests should still be green).

**Step 5: Visual check**

Run the dev server and test a lookup:
```bash
npm run dev
```

- Without `VITE_WAHAPEDIA_WORKER_URL` set: fill a unit → should show yellow ⚠ badge with a specific Wahapedia link (not generic wahapedia.ru — the path is resolved by Phase 1 even without a worker).
- With `VITE_WAHAPEDIA_WORKER_URL` set: fill a unit → should show green ✓ badge with timestamp.

**Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: replace static disclaimer with live/training source badge"
```

---

## Task 5: Push

```bash
git push
```

---

## Summary of what changed

| File | Change |
|------|--------|
| `worker/worker.js` | New — Cloudflare Worker CORS proxy |
| `worker/wrangler.toml` | New — Worker config |
| `src/claudeService.js` | Two-phase lookup, new prompts, returns `{ fields, meta }` |
| `src/useUnitLookup.js` | Stores `attackerMeta`/`defenderMeta`, destructures new return shape |
| `src/App.jsx` | `LookupSourceBadge` component replaces static disclaimers |
| `src/claudeService.test.js` | Tests for `fetchWahapediaPage` |
| `src/useUnitLookup.test.js` | Updated mocks + new meta state tests |
| `.env.local` | Created by you (gitignored) — holds `VITE_WAHAPEDIA_WORKER_URL` |
