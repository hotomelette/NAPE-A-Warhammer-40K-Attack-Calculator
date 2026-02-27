# Disambiguation + Resolved Name Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show which weapon/unit was resolved in the source badge, and present disambiguation chips when multiple weapon options (attacker) or unit matches (defender) exist — blocking population until the user picks one.

**Architecture:** Three layers: `claudeService.js` updates prompts to return `{ type: "stats", resolvedName, ...fields }` or `{ type: "options", options: [...] }`, plus two new `fromPage` helpers for the second call (skipping path resolution and Wahapedia fetch). `useUnitLookup.js` adds `attackerOptions`/`defenderOptions`/pageCache state and `resolveAttacker`/`resolveDefender` functions. `App.jsx` adds `DisambiguationChips` component and updates `LookupSourceBadge` to show `resolvedName`.

**Tech Stack:** React 19, Vite 7, @anthropic-ai/sdk, Vitest 4, Tailwind CSS v4.

---

## Context for the implementer

The app is a Warhammer 40K attack calculator. Key files:
- `src/claudeService.js` — Claude API calls, system prompts, mapping functions. Main file for Task 1.
- `src/useUnitLookup.js` — React hook managing lookup state. Main file for Task 2.
- `src/App.jsx` — Renders lookup UI. `LookupSourceBadge` is around line 179. The two badge usages are around lines 1358 (attacker) and 1589 (defender).
- `src/claudeService.test.js` — Tests pure mapping functions and `fetchWahapediaPage`.
- `src/useUnitLookup.test.js` — Hook tests; mocks entire `claudeService.js` module.

Run tests with: `npm test -- --run`

---

## Task 1: Update `claudeService.js`

**Files:**
- Modify: `src/claudeService.js`
- Modify: `src/claudeService.test.js`

### Step 1: Add smoke tests for new exports

Add to the bottom of `src/claudeService.test.js`:

```js
describe("fromPage helper exports", () => {
  it("fetchAttackerStatsFromPage is exported", async () => {
    const mod = await import("./claudeService.js");
    expect(typeof mod.fetchAttackerStatsFromPage).toBe("function");
  });

  it("fetchDefenderStatsFromPage is exported", async () => {
    const mod = await import("./claudeService.js");
    expect(typeof mod.fetchDefenderStatsFromPage).toBe("function");
  });
});
```

### Step 2: Run tests — confirm they fail

```bash
npm test -- --run
```

Expected: 2 failures — `fetchAttackerStatsFromPage is not a function`.

### Step 3: Replace `src/claudeService.js`

Replace the entire file with:

```js
import Anthropic from "@anthropic-ai/sdk";

const WORKER_URL = import.meta.env.VITE_WAHAPEDIA_WORKER_URL || null;
const CLAUDE_MODEL = "claude-sonnet-4-6";

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

DISAMBIGUATION: If the input names only a unit without specifying a weapon (e.g. "space marine intercessor", "crisis battlesuits"), return ALL available weapons as options. If a specific weapon is clearly named in the input, extract stats directly.

When disambiguation is needed, return ONLY this JSON:
{ "type": "options", "options": ["Weapon Name 1", "Weapon Name 2", ...] }
Include ALL ranged AND melee weapons available to the unit. Use exact weapon names from the datasheet.

When a specific weapon is identified, return ONLY this JSON:
{
  "type": "stats",
  "resolvedName": "Human-readable description e.g. 'Intercessor with Bolt Rifle'",
  "attacks": number or string,
  "bs": number,
  "strength": number,
  "ap": number,
  "damage": number or string,
  "torrent": boolean,
  "lethalHits": boolean,
  "sustainedHits": boolean,
  "sustainedHitsN": number,
  "devastatingWounds": boolean,
  "twinLinked": boolean
}

Rules:
- attacks/damage: use exact GW dice notation: 1, 4, "D3", "D6", "2D6", "D6+1". Never round.
- ap: 0 for no AP; -1, -2, -3 for AP-1/2/3.
- bs: target number e.g. 3 means 3+.
- [TWIN-LINKED] → twinLinked: true. [TORRENT] → torrent: true. [LETHAL HITS] → lethalHits: true.
- [SUSTAINED HITS X] → sustainedHits: true, sustainedHitsN: X. [DEVASTATING WOUNDS] → devastatingWounds: true.
- If a Wahapedia datasheet is provided, use it as the primary source of truth.
- Omit stat fields you are not confident in.
- Return ONLY the raw JSON object. No markdown, no explanation, no prose.`;

const DEFENDER_SYSTEM_PROMPT = `You are a Warhammer 40,000 10th edition rules expert.
Given a unit description and optionally a Wahapedia datasheet, extract defensive stats.

DISAMBIGUATION: If the input could match multiple distinct units (e.g. "fire dragon warriors" could be Fire Warriors or Fire Dragons), return the possible matches as options. If the unit is clearly identified, extract stats directly.

When disambiguation is needed, return ONLY this JSON:
{ "type": "options", "options": ["Unit Name 1", "Unit Name 2", ...] }

When the unit is clearly identified, return ONLY this JSON:
{
  "type": "stats",
  "resolvedName": "Human-readable unit name e.g. 'Space Marine Intercessor'",
  "toughness": number,
  "save": number,
  "invulnSave": number or null,
  "fnpSave": number or null
}

Rules:
- save: armor save target number, e.g. 3 means 3+.
- invulnSave: e.g. 4 means 4++. Omit if none.
- fnpSave: e.g. 5 for 5+ Feel No Pain or Reanimation Protocols. Omit if none.
- For Necron units with Reanimation Protocols, set fnpSave to 5.
- If a Wahapedia datasheet is provided, use it as the primary source of truth.
- Omit fields you are not confident in.
- Return ONLY the raw JSON object. No markdown, no explanation, no prose.`;

// ─── Pure mapping functions ───────────────────────────────────────────────────

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
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned non-JSON response: ${cleaned.slice(0, 120)}`);
  }
}

async function resolveWahapediaPath(description, client) {
  try {
    const msg = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 64,
      temperature: 0,
      system: URL_RESOLUTION_PROMPT,
      messages: [{ role: "user", content: description }],
    });
    const path = msg.content[0].text.trim();
    const pathPattern = /^[a-z0-9-]+\/[A-Za-z0-9-]+$/;
    if (!path || path === "unknown" || !pathPattern.test(path)) return null;
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
  } catch (err) {
    console.warn("[fetchWahapediaPage] failed for path", path, err);
    return null;
  }
}

async function resolveAndFetch(description, client) {
  const path = await resolveWahapediaPath(description, client);
  const wahapediaUrl = path
    ? `https://wahapedia.ru/wh40k10ed/factions/${path}`
    : "https://wahapedia.ru";
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
  return { pageContent, source, wahapediaUrl, fetchedAt };
}

function buildMeta(source, wahapediaUrl, fetchedAt, resolvedName) {
  const meta = { source, wahapediaUrl, resolvedName };
  if (source === "live") meta.fetchedAt = fetchedAt;
  return meta;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchAttackerStats(description, apiKey) {
  // Browser-direct by design; see docs/plans/2026-02-26-unit-lookup-design.md
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const { pageContent, source, wahapediaUrl, fetchedAt } = await resolveAndFetch(description, client);

  const userContent = pageContent
    ? `Unit/weapon: ${description}\n\nWahapedia datasheet:\n${pageContent}`
    : description;
  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    temperature: 0,
    system: ATTACKER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  const raw = parseJson(msg.content[0].text);

  if (raw.type === "options") {
    return {
      type: "disambiguation",
      options: raw.options,
      pageCache: { pageText: pageContent, wahapediaUrl, source, fetchedAt },
    };
  }

  return {
    type: "stats",
    fields: mapToWeaponFields(raw),
    meta: buildMeta(source, wahapediaUrl, fetchedAt, raw.resolvedName),
  };
}

export async function fetchAttackerStatsFromPage(description, chosenWeapon, pageCache, apiKey) {
  // Browser-direct by design; see docs/plans/2026-02-26-unit-lookup-design.md
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const { pageText, wahapediaUrl, source, fetchedAt } = pageCache;

  const userContent = pageText
    ? `Unit/weapon: ${description} — specifically the ${chosenWeapon}\n\nWahapedia datasheet:\n${pageText}`
    : `${description} — specifically the ${chosenWeapon}`;

  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    temperature: 0,
    system: ATTACKER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  const raw = parseJson(msg.content[0].text);
  return {
    type: "stats",
    fields: mapToWeaponFields(raw),
    meta: buildMeta(source, wahapediaUrl, fetchedAt, raw.resolvedName),
  };
}

export async function fetchDefenderStats(description, apiKey) {
  // Browser-direct by design; see docs/plans/2026-02-26-unit-lookup-design.md
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const { pageContent, source, wahapediaUrl, fetchedAt } = await resolveAndFetch(description, client);

  const userContent = pageContent
    ? `Unit: ${description}\n\nWahapedia datasheet:\n${pageContent}`
    : description;
  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    temperature: 0,
    system: DEFENDER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  const raw = parseJson(msg.content[0].text);

  if (raw.type === "options") {
    return {
      type: "disambiguation",
      options: raw.options,
      pageCache: { pageText: pageContent, wahapediaUrl, source, fetchedAt },
    };
  }

  return {
    type: "stats",
    fields: mapToTargetFields(raw),
    meta: buildMeta(source, wahapediaUrl, fetchedAt, raw.resolvedName),
  };
}

export async function fetchDefenderStatsFromPage(description, chosenUnit, pageCache, apiKey) {
  // Browser-direct by design; see docs/plans/2026-02-26-unit-lookup-design.md
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const { pageText, wahapediaUrl, source, fetchedAt } = pageCache;

  const userContent = pageText
    ? `Unit: ${description} — specifically ${chosenUnit}\n\nWahapedia datasheet:\n${pageText}`
    : `${description} — specifically ${chosenUnit}`;

  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    temperature: 0,
    system: DEFENDER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  const raw = parseJson(msg.content[0].text);
  return {
    type: "stats",
    fields: mapToTargetFields(raw),
    meta: buildMeta(source, wahapediaUrl, fetchedAt, raw.resolvedName),
  };
}
```

### Step 4: Run tests — confirm all pass

```bash
npm test -- --run
```

Expected: all tests pass (2 new smoke tests + all existing).

### Step 5: Commit

```bash
git add src/claudeService.js src/claudeService.test.js
git commit -m "feat: update claudeService for disambiguation and resolvedName"
```

---

## Task 2: Update `useUnitLookup.js`

**Files:**
- Modify: `src/useUnitLookup.js`
- Modify: `src/useUnitLookup.test.js`

### Step 1: Write failing tests

Replace the entire `src/useUnitLookup.test.js` with:

```js
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUnitLookup } from "./useUnitLookup.js";

vi.mock("./claudeService.js", () => ({
  fetchAttackerStats: vi.fn(),
  fetchDefenderStats: vi.fn(),
  fetchAttackerStatsFromPage: vi.fn(),
  fetchDefenderStatsFromPage: vi.fn(),
}));

import { fetchAttackerStats, fetchDefenderStats, fetchAttackerStatsFromPage, fetchDefenderStatsFromPage } from "./claudeService.js";

const mockApiKey = "sk-ant-test";
const getApiKey = () => mockApiKey;

const weaponFields = { attacksFixed: true, attacksValue: "1", toHit: "3", strength: "8", ap: "-3", damageFixed: true, damageValue: "3", torrent: false, lethalHits: false, sustainedHits: false, sustainedHitsN: 1, devastatingWounds: false, twinLinked: false };
const targetFields = { toughness: "8", armorSave: "3", invulnSave: "4", fnpEnabled: false, fnp: "" };

describe("useUnitLookup", () => {
  it("starts with empty text, not loading, no error", () => {
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    expect(result.current.attackerText).toBe("");
    expect(result.current.defenderText).toBe("");
    expect(result.current.attackerLoading).toBe(false);
    expect(result.current.defenderLoading).toBe(false);
    expect(result.current.attackerError).toBe(null);
    expect(result.current.defenderError).toBe(null);
    expect(result.current.lastFilled).toBe(null);
  });

  it("updates attackerText via setAttackerText", () => {
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setAttackerText("crisis commander"));
    expect(result.current.attackerText).toBe("crisis commander");
  });

  it("updates defenderText via setDefenderText", () => {
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setDefenderText("doomstalker"));
    expect(result.current.defenderText).toBe("doomstalker");
  });

  it("dispatches LOAD_WEAPON on fillAttacker success", async () => {
    fetchAttackerStats.mockResolvedValueOnce({ type: "stats", fields: weaponFields, meta: { source: "training", wahapediaUrl: "https://wahapedia.ru", resolvedName: "Intercessor with Bolt Rifle" } });
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setAttackerText("crisis commander plasma rifle"));
    await act(() => result.current.fillAttacker(dispatch));
    expect(dispatch).toHaveBeenCalledWith({ type: "LOAD_WEAPON", weapon: weaponFields });
    expect(result.current.lastFilled).toBe("attacker");
    expect(result.current.attackerError).toBe(null);
  });

  it("sets attackerError on fillAttacker failure", async () => {
    fetchAttackerStats.mockRejectedValueOnce(new Error("API error"));
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setAttackerText("???"));
    await act(() => result.current.fillAttacker(dispatch));
    expect(result.current.attackerError).toBe("Couldn't identify unit — try a different description");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches LOAD_TARGET on fillDefender success", async () => {
    fetchDefenderStats.mockResolvedValueOnce({ type: "stats", fields: targetFields, meta: { source: "training", wahapediaUrl: "https://wahapedia.ru", resolvedName: "Canoptek Doomstalker" } });
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setDefenderText("canoptek doomstalker"));
    await act(() => result.current.fillDefender(dispatch));
    expect(dispatch).toHaveBeenCalledWith({ type: "LOAD_TARGET", target: targetFields });
    expect(result.current.lastFilled).toBe("defender");
    expect(result.current.defenderError).toBe(null);
  });

  it("starts with null meta and options", () => {
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    expect(result.current.attackerMeta).toBeNull();
    expect(result.current.defenderMeta).toBeNull();
    expect(result.current.attackerOptions).toBeNull();
    expect(result.current.defenderOptions).toBeNull();
  });

  it("stores attackerMeta and clears options on fillAttacker success", async () => {
    const meta = { source: "live", wahapediaUrl: "https://wahapedia.ru/wh40k10ed/factions/tau-empire/Crisis-Battlesuits", fetchedAt: "2026-02-26T21:00:00Z", resolvedName: "Crisis Battlesuits with Plasma Rifle" };
    fetchAttackerStats.mockResolvedValueOnce({ type: "stats", fields: weaponFields, meta });
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setAttackerText("crisis battlesuits plasma"));
    await act(() => result.current.fillAttacker(dispatch));
    expect(result.current.attackerMeta).toEqual(meta);
    expect(result.current.attackerOptions).toBeNull();
  });

  it("stores defenderMeta and clears options on fillDefender success", async () => {
    const meta = { source: "training", wahapediaUrl: "https://wahapedia.ru/wh40k10ed/factions/necrons/Canoptek-Doomstalker", resolvedName: "Canoptek Doomstalker" };
    fetchDefenderStats.mockResolvedValueOnce({ type: "stats", fields: targetFields, meta });
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setDefenderText("canoptek doomstalker"));
    await act(() => result.current.fillDefender(dispatch));
    expect(result.current.defenderMeta).toEqual(meta);
    expect(result.current.defenderOptions).toBeNull();
  });

  it("stores attackerOptions and does not dispatch when fillAttacker gets disambiguation", async () => {
    const pageCache = { pageText: "datasheet...", wahapediaUrl: "https://wahapedia.ru/wh40k10ed/factions/space-marines/Intercessor-Squad", source: "live", fetchedAt: "2026-02-27T10:00:00Z" };
    fetchAttackerStats.mockResolvedValueOnce({ type: "disambiguation", options: ["Bolt Rifle", "Auto Bolt Rifle", "Stalker Bolt Rifle"], pageCache });
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setAttackerText("space marine intercessor"));
    await act(() => result.current.fillAttacker(dispatch));
    expect(result.current.attackerOptions).toEqual(["Bolt Rifle", "Auto Bolt Rifle", "Stalker Bolt Rifle"]);
    expect(dispatch).not.toHaveBeenCalled();
    expect(result.current.attackerMeta).toBeNull();
  });

  it("resolveAttacker dispatches LOAD_WEAPON, stores meta, and clears options", async () => {
    const pageCache = { pageText: "datasheet...", wahapediaUrl: "https://wahapedia.ru/wh40k10ed/factions/space-marines/Intercessor-Squad", source: "live", fetchedAt: "2026-02-27T10:00:00Z" };
    fetchAttackerStats.mockResolvedValueOnce({ type: "disambiguation", options: ["Bolt Rifle", "Auto Bolt Rifle"], pageCache });
    const resolvedMeta = { source: "live", wahapediaUrl: "https://wahapedia.ru/wh40k10ed/factions/space-marines/Intercessor-Squad", fetchedAt: "2026-02-27T10:00:00Z", resolvedName: "Intercessor with Bolt Rifle" };
    fetchAttackerStatsFromPage.mockResolvedValueOnce({ type: "stats", fields: weaponFields, meta: resolvedMeta });
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setAttackerText("space marine intercessor"));
    await act(() => result.current.fillAttacker(dispatch));
    await act(() => result.current.resolveAttacker(dispatch, "Bolt Rifle"));
    expect(fetchAttackerStatsFromPage).toHaveBeenCalledWith("space marine intercessor", "Bolt Rifle", pageCache, mockApiKey);
    expect(dispatch).toHaveBeenCalledWith({ type: "LOAD_WEAPON", weapon: weaponFields });
    expect(result.current.attackerOptions).toBeNull();
    expect(result.current.attackerMeta).toEqual(resolvedMeta);
  });

  it("stores defenderOptions and does not dispatch when fillDefender gets disambiguation", async () => {
    const pageCache = { pageText: null, wahapediaUrl: "https://wahapedia.ru", source: "training", fetchedAt: undefined };
    fetchDefenderStats.mockResolvedValueOnce({ type: "disambiguation", options: ["Fire Warriors", "Fire Dragons"], pageCache });
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setDefenderText("fire dragon warriors"));
    await act(() => result.current.fillDefender(dispatch));
    expect(result.current.defenderOptions).toEqual(["Fire Warriors", "Fire Dragons"]);
    expect(dispatch).not.toHaveBeenCalled();
    expect(result.current.defenderMeta).toBeNull();
  });

  it("resolveDefender dispatches LOAD_TARGET, stores meta, and clears options", async () => {
    const pageCache = { pageText: null, wahapediaUrl: "https://wahapedia.ru", source: "training", fetchedAt: undefined };
    fetchDefenderStats.mockResolvedValueOnce({ type: "disambiguation", options: ["Fire Warriors", "Fire Dragons"], pageCache });
    const resolvedMeta = { source: "training", wahapediaUrl: "https://wahapedia.ru/wh40k10ed/factions/tau-empire/Fire-Warriors-Strike-Team", resolvedName: "Fire Warriors" };
    fetchDefenderStatsFromPage.mockResolvedValueOnce({ type: "stats", fields: targetFields, meta: resolvedMeta });
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setDefenderText("fire dragon warriors"));
    await act(() => result.current.fillDefender(dispatch));
    await act(() => result.current.resolveDefender(dispatch, "Fire Warriors"));
    expect(fetchDefenderStatsFromPage).toHaveBeenCalledWith("fire dragon warriors", "Fire Warriors", pageCache, mockApiKey);
    expect(dispatch).toHaveBeenCalledWith({ type: "LOAD_TARGET", target: targetFields });
    expect(result.current.defenderOptions).toBeNull();
    expect(result.current.defenderMeta).toEqual(resolvedMeta);
  });
});
```

### Step 2: Run tests — confirm they fail

```bash
npm test -- --run
```

Expected: multiple failures — existing tests fail because `{ fields, meta }` destructuring no longer matches `{ type: "stats", fields, meta }`, and new tests fail because `attackerOptions`/`resolveAttacker` don't exist yet.

### Step 3: Replace `src/useUnitLookup.js`

Replace the entire file with:

```js
import { useState, useCallback } from "react";
import { fetchAttackerStats, fetchDefenderStats, fetchAttackerStatsFromPage, fetchDefenderStatsFromPage } from "./claudeService.js";

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
  const [attackerOptions, setAttackerOptions] = useState(null);
  const [defenderOptions, setDefenderOptions] = useState(null);
  const [attackerPageCache, setAttackerPageCache] = useState(null);
  const [defenderPageCache, setDefenderPageCache] = useState(null);

  const fillAttacker = useCallback(async (dispatch) => {
    setAttackerLoading(true);
    setAttackerError(null);
    try {
      const apiKey = getApiKey();
      const result = await fetchAttackerStats(attackerText, apiKey);
      if (result.type === "disambiguation") {
        setAttackerOptions(result.options);
        setAttackerPageCache(result.pageCache);
      } else {
        dispatch({ type: "LOAD_WEAPON", weapon: result.fields });
        setAttackerMeta(result.meta);
        setAttackerOptions(null);
        setAttackerPageCache(null);
        setLastFilled("attacker");
      }
    } catch (err) {
      console.error("[UnitLookup] fillAttacker failed:", err);
      setAttackerError(classifyError(err));
    } finally {
      setAttackerLoading(false);
    }
  }, [attackerText, getApiKey]);

  const resolveAttacker = useCallback(async (dispatch, choice) => {
    setAttackerLoading(true);
    setAttackerError(null);
    try {
      const apiKey = getApiKey();
      const result = await fetchAttackerStatsFromPage(attackerText, choice, attackerPageCache, apiKey);
      dispatch({ type: "LOAD_WEAPON", weapon: result.fields });
      setAttackerMeta(result.meta);
      setAttackerOptions(null);
      setAttackerPageCache(null);
      setLastFilled("attacker");
    } catch (err) {
      console.error("[UnitLookup] resolveAttacker failed:", err);
      setAttackerError(classifyError(err));
    } finally {
      setAttackerLoading(false);
    }
  }, [attackerText, attackerPageCache, getApiKey]);

  const fillDefender = useCallback(async (dispatch) => {
    setDefenderLoading(true);
    setDefenderError(null);
    try {
      const apiKey = getApiKey();
      const result = await fetchDefenderStats(defenderText, apiKey);
      if (result.type === "disambiguation") {
        setDefenderOptions(result.options);
        setDefenderPageCache(result.pageCache);
      } else {
        dispatch({ type: "LOAD_TARGET", target: result.fields });
        setDefenderMeta(result.meta);
        setDefenderOptions(null);
        setDefenderPageCache(null);
        setLastFilled("defender");
      }
    } catch (err) {
      console.error("[UnitLookup] fillDefender failed:", err);
      setDefenderError(classifyError(err));
    } finally {
      setDefenderLoading(false);
    }
  }, [defenderText, getApiKey]);

  const resolveDefender = useCallback(async (dispatch, choice) => {
    setDefenderLoading(true);
    setDefenderError(null);
    try {
      const apiKey = getApiKey();
      const result = await fetchDefenderStatsFromPage(defenderText, choice, defenderPageCache, apiKey);
      dispatch({ type: "LOAD_TARGET", target: result.fields });
      setDefenderMeta(result.meta);
      setDefenderOptions(null);
      setDefenderPageCache(null);
      setLastFilled("defender");
    } catch (err) {
      console.error("[UnitLookup] resolveDefender failed:", err);
      setDefenderError(classifyError(err));
    } finally {
      setDefenderLoading(false);
    }
  }, [defenderText, defenderPageCache, getApiKey]);

  return {
    attackerText, setAttackerText,
    defenderText, setDefenderText,
    attackerLoading, defenderLoading,
    attackerError, defenderError,
    lastFilled, fillAttacker, fillDefender,
    attackerMeta, defenderMeta,
    attackerOptions, defenderOptions,
    resolveAttacker, resolveDefender,
  };
}
```

### Step 4: Run tests — confirm all pass

```bash
npm test -- --run
```

Expected: all tests pass.

### Step 5: Commit

```bash
git add src/useUnitLookup.js src/useUnitLookup.test.js
git commit -m "feat: add disambiguation state and resolve functions to useUnitLookup"
```

---

## Task 3: Update `App.jsx`

**Files:**
- Modify: `src/App.jsx`

No unit tests — visual verification with the dev server.

### Step 1: Add `DisambiguationChips` component

In `src/App.jsx`, find the closing `}` of the `LookupSourceBadge` function (around line 209). Add the following component directly after it:

```jsx
function DisambiguationChips({ options, onSelect, loading, theme }) {
  if (!options) return null;
  const dark = theme === "dark";
  return (
    <div className="space-y-1">
      <p className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>
        Multiple options — pick one:
      </p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            disabled={loading}
            onClick={() => onSelect(opt)}
            className={`text-xs px-2 py-0.5 rounded border transition-opacity ${
              loading ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
            } ${dark
              ? "border-gray-600 text-gray-300 hover:border-gray-400 hover:text-gray-100"
              : "border-gray-300 text-gray-600 hover:border-gray-500 hover:text-gray-800"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Step 2: Update `LookupSourceBadge` to show `resolvedName`

Find the `LookupSourceBadge` function (~line 179). Replace it entirely with:

```jsx
function LookupSourceBadge({ meta, theme }) {
  if (!meta) return null;
  const dark = theme === "dark";
  const linkClass = `underline ${dark ? "hover:text-gray-200" : "hover:text-gray-700"}`;

  if (meta.source === "live") {
    const ts = meta.fetchedAt ? new Date(meta.fetchedAt) : null;
    const time = ts && !isNaN(ts) ? ts.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }) : "";
    return (
      <p className={`text-xs ${dark ? "text-green-400" : "text-green-600"}`}>
        ✓ {meta.resolvedName && <>{meta.resolvedName} · </>}
        <a href={meta.wahapediaUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
          Wahapedia
        </a>
        {time && <>{" "}· {time}</>}
      </p>
    );
  }

  return (
    <p className={`text-xs ${dark ? "text-yellow-400" : "text-yellow-600"}`}>
      ⚠ {meta.resolvedName && <>{meta.resolvedName} · </>}
      training data — verify on{" "}
      <a href={meta.wahapediaUrl || "https://wahapedia.ru"} target="_blank" rel="noopener noreferrer" className={linkClass}>
        Wahapedia
      </a>
    </p>
  );
}
```

### Step 3: Replace attacker badge slot (~line 1358)

Find:
```jsx
                  <LookupSourceBadge meta={unitLookup.attackerMeta} theme={theme} />
```

Replace with:
```jsx
                  {unitLookup.attackerOptions
                    ? <DisambiguationChips options={unitLookup.attackerOptions} onSelect={(choice) => unitLookup.resolveAttacker(dispatch, choice)} loading={unitLookup.attackerLoading} theme={theme} />
                    : <LookupSourceBadge meta={unitLookup.attackerMeta} theme={theme} />
                  }
```

### Step 4: Replace defender badge slot (~line 1589)

Find:
```jsx
                  <LookupSourceBadge meta={unitLookup.defenderMeta} theme={theme} />
```

Replace with:
```jsx
                  {unitLookup.defenderOptions
                    ? <DisambiguationChips options={unitLookup.defenderOptions} onSelect={(choice) => unitLookup.resolveDefender(dispatch, choice)} loading={unitLookup.defenderLoading} theme={theme} />
                    : <LookupSourceBadge meta={unitLookup.defenderMeta} theme={theme} />
                  }
```

### Step 5: Run tests

```bash
npm test -- --run
```

Expected: all tests pass.

### Step 6: Visual check

```bash
npm run dev
```

- Type `space marine intercessor` in attacker field → Fill → chips appear with all weapons → click one → fields populate, badge shows `✓ Intercessor with Bolt Rifle · Wahapedia · HH:MM`
- Type `space marine intercessor` in defender field → Fill → populates immediately, badge shows `✓ Space Marine Intercessor · Wahapedia · HH:MM`
- Type `fire dragon warriors` in defender field → Fill → disambiguation chips appear → pick one → fields populate

### Step 7: Commit

```bash
git add src/App.jsx
git commit -m "feat: add DisambiguationChips and resolvedName to LookupSourceBadge"
```

---

## Task 4: Push

```bash
git push
```

---

## Summary

| File | Change |
|------|--------|
| `src/claudeService.js` | Updated prompts, `type`/`resolvedName` return shapes, `fromPage` helpers |
| `src/claudeService.test.js` | Smoke tests for new exports |
| `src/useUnitLookup.js` | `attackerOptions`/`defenderOptions`/pageCache state, `resolveAttacker`/`resolveDefender` |
| `src/useUnitLookup.test.js` | Full rewrite with new return shapes + disambiguation tests |
| `src/App.jsx` | `DisambiguationChips` component, `resolvedName` in `LookupSourceBadge` |
