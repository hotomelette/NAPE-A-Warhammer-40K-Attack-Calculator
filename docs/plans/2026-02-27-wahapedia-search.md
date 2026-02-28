# Wahapedia Live Search & URL Verification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the silent "guess a URL, fall back to training data on 404" behavior with genuine live search: the worker iterates all known Wahapedia faction slugs to find and confirm the correct unit page, the client uses the verified URL and live page content, and training data is only used when the worker is not configured.

**Architecture:** Three-layer fix. (1) Correct the wrong faction slug example in the Claude prompt so the guess is right more often. (2) Add a `/search` endpoint to the Cloudflare Worker that accepts a unit name + faction hint and iterates known faction slugs until it finds the live page. (3) Update `resolveAndFetch` in `claudeService.js` to call the search endpoint as a fallback when the direct path fetch fails, using the confirmed URL from whichever call succeeded.

**Tech Stack:** React 19, Vite 7, Cloudflare Worker (vanilla JS), Vitest 4. Tests in `src/claudeService.test.js` and new `worker/worker.test.js`. Run tests with `npm test -- --run`.

---

## Background: What Is Actually Broken

`resolveAndFetch` in `claudeService.js`:
1. Asks Claude to guess a Wahapedia path (e.g. `tau-empire/Broadside-Battlesuits`)
2. Sends that path to the worker (`/wahapedia?path=...`)
3. Worker fetches `https://wahapedia.ru/wh40k10ed/factions/{path}` — if Wahapedia returns 404, worker returns `{ error: "not_found" }`
4. Client sees the error, sets `pageContent = null`, `source = "training"` — **but keeps the bad URL**
5. Claude is then called with no page content — pure training data

When you pick a weapon from the disambiguation list, `fetchAttackerStatsFromPage` gets `pageCache.pageText = null` and also uses training data. The feature is effectively inert whenever the URL guess is wrong.

The wrong example in `URL_RESOLUTION_PROMPT` (`tau-empire/Crisis-Battlesuits`) actively teaches Claude the wrong slug for all T'au units. The real slug is `t-au-empire`. Similarly `emperors-children` should be `emperor-s-children`.

---

## Faction Slug Reference (authoritative — from live Wahapedia research)

```
space-marines, grey-knights, adeptus-custodes, adepta-sororitas,
adeptus-mechanicus, astra-militarum, imperial-knights, imperial-agents,
chaos-space-marines, death-guard, thousand-sons, world-eaters, emperor-s-children,
t-au-empire, aeldari, drukhari, tyranids, necrons, orks,
genestealer-cults, leagues-of-votann, chaos-knights,
dark-angels, blood-angels, space-wolves, black-templars, deathwatch
```

Note: apostrophes become `-` + the letter + `-` in slugs (T'au → `t-au`, Emperor's → `emperor-s`).

---

## Task 1: Fix URL_RESOLUTION_PROMPT Faction Slug Examples

**Files:**
- Modify: `src/claudeService.js` lines 8–23

**Step 1: Read the current URL_RESOLUTION_PROMPT**

Read `src/claudeService.js` offset=7 limit=18.

**Step 2: Replace the prompt with corrected examples and faction slug reference**

Replace the entire `URL_RESOLUTION_PROMPT` constant:

```js
const URL_RESOLUTION_PROMPT = `You are a Warhammer 40,000 10th edition rules expert.
Given a unit or weapon description, return ONLY the Wahapedia path for the unit's datasheet page.
The path format is: {faction-slug}/{Unit-Name-With-Hyphens}

Examples:
- "space marine intercessor bolt rifle" → space-marines/Intercessor-Squad
- "crisis battlesuits plasma" → t-au-empire/Crisis-Battlesuits
- "broadside battlesuits" → t-au-empire/Broadside-Battlesuits
- "forgefiend" → chaos-space-marines/Forgefiend
- "canoptek doomstalker" → necrons/Canoptek-Doomstalker
- "ork boy" → orks/Boyz
- "noise marine" → emperor-s-children/Noise-Marines

Faction slug reference — use these EXACT slugs:
space-marines | grey-knights | adeptus-custodes | adepta-sororitas | adeptus-mechanicus
astra-militarum | imperial-knights | imperial-agents | chaos-space-marines | death-guard
thousand-sons | world-eaters | emperor-s-children | t-au-empire | aeldari | drukhari
tyranids | necrons | orks | genestealer-cults | leagues-of-votann | chaos-knights
dark-angels | blood-angels | space-wolves | black-templars | deathwatch

Rules:
- Return ONLY the path string. No URL prefix, no explanation, no markdown.
- For weapons, return the unit page that contains that weapon.
- Handle misspellings — match to the closest Wahapedia entry.
- If truly unknown, return: unknown`;
```

**Step 3: Run tests to verify nothing broke**

```bash
npm test -- --run 2>&1 | tail -10
```

Expected: all existing tests pass (no test touches the prompt string directly).

**Step 4: Commit**

```bash
git add src/claudeService.js
git commit -m "fix: correct faction slug examples in URL_RESOLUTION_PROMPT (t-au-empire, emperor-s-children)"
```

---

## Task 2: Add `/search` Endpoint to Cloudflare Worker

**Files:**
- Modify: `worker/worker.js`
- Create: `worker/worker.test.js`

The search endpoint accepts `?unit=<UnitName>&faction=<faction-hint>`. It tries the faction hint first, then iterates all known faction slugs until one returns a live Wahapedia page. Returns `{ text, url }` on success, `{ error: "not_found" }` on failure.

**Step 1: Write failing tests first**

Create `worker/worker.test.js`:

```js
import { describe, it, expect, vi, afterEach } from "vitest";

// The worker exports a default object with a fetch(request) method.
// We import it and call fetch() with a synthetic Request.

let worker;
beforeEach(async () => {
  // Re-import each time so vi.stubGlobal takes effect
  vi.resetModules();
  worker = (await import("./worker.js")).default;
});
afterEach(() => vi.unstubAllGlobals());

function makeRequest(url) {
  return new Request(url);
}

describe("worker /wahapedia (existing endpoint)", () => {
  it("returns page text when Wahapedia responds 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html>Broadside content</html>"),
    }));
    const req = makeRequest("https://worker.example.com/wahapedia?path=t-au-empire/Broadside-Battlesuits");
    const res = await worker.fetch(req);
    const data = await res.json();
    expect(data.text).toContain("Broadside content");
    expect(data.url).toBe("https://wahapedia.ru/wh40k10ed/factions/t-au-empire/Broadside-Battlesuits");
  });

  it("returns not_found when Wahapedia 404s", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const req = makeRequest("https://worker.example.com/wahapedia?path=bad/Path");
    const res = await worker.fetch(req);
    const data = await res.json();
    expect(data.error).toBe("not_found");
  });
});

describe("worker /search endpoint", () => {
  it("returns page when faction hint is correct on first try", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html>Broadside</html>"),
    }));
    const req = makeRequest("https://worker.example.com/search?unit=Broadside-Battlesuits&faction=t-au-empire");
    const res = await worker.fetch(req);
    const data = await res.json();
    expect(data.url).toBe("https://wahapedia.ru/wh40k10ed/factions/t-au-empire/Broadside-Battlesuits");
    expect(data.text).toContain("Broadside");
  });

  it("finds unit via fallback when faction hint 404s", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url) => {
      callCount++;
      // First call (wrong faction) fails, second call (correct faction) succeeds
      if (url.includes("tau-empire")) return Promise.resolve({ ok: false, status: 404 });
      if (url.includes("t-au-empire")) return Promise.resolve({
        ok: true,
        text: () => Promise.resolve("<html>Broadside</html>"),
      });
      return Promise.resolve({ ok: false, status: 404 });
    }));
    const req = makeRequest("https://worker.example.com/search?unit=Broadside-Battlesuits&faction=tau-empire");
    const res = await worker.fetch(req);
    const data = await res.json();
    expect(data.url).toContain("t-au-empire");
    expect(data.error).toBeUndefined();
  });

  it("normalizes lowercase unit name to PascalCase", async () => {
    let fetchedUrl = null;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url) => {
      fetchedUrl = url;
      if (url.includes("Broadside-Battlesuits")) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve("<html>ok</html>") });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }));
    const req = makeRequest("https://worker.example.com/search?unit=broadside-battlesuits&faction=t-au-empire");
    const res = await worker.fetch(req);
    const data = await res.json();
    expect(fetchedUrl).toContain("Broadside-Battlesuits");
    expect(data.error).toBeUndefined();
  });

  it("returns not_found when unit exists in no faction", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const req = makeRequest("https://worker.example.com/search?unit=Totally-Fake-Unit&faction=orks");
    const res = await worker.fetch(req);
    const data = await res.json();
    expect(data.error).toBe("not_found");
  });

  it("returns 400 when unit param is missing", async () => {
    const req = makeRequest("https://worker.example.com/search?faction=orks");
    const res = await worker.fetch(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("missing_unit");
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
npm test -- --run worker/worker.test.js 2>&1 | tail -20
```

Expected: FAIL — the `/search` route doesn't exist yet.

**Step 3: Implement the search endpoint in `worker/worker.js`**

Replace the full contents of `worker/worker.js`:

```js
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Authoritative Wahapedia faction slugs (verified Feb 2026)
const FACTION_SLUGS = [
  "space-marines", "grey-knights", "adeptus-custodes", "adepta-sororitas",
  "adeptus-mechanicus", "astra-militarum", "imperial-knights", "imperial-agents",
  "chaos-space-marines", "death-guard", "thousand-sons", "world-eaters", "emperor-s-children",
  "t-au-empire", "aeldari", "drukhari", "tyranids", "necrons", "orks",
  "genestealer-cults", "leagues-of-votann", "chaos-knights",
  "dark-angels", "blood-angels", "space-wolves", "black-templars", "deathwatch",
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// Capitalize first letter of each hyphen-separated word, preserve existing casing of remainder.
// "broadside-battlesuits" → "Broadside-Battlesuits"
// "XV88-Broadside" → "XV88-Broadside" (already correct)
function normalizeUnitName(name) {
  return name
    .replace(/\s+/g, "-")
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join("-");
}

async function scrapeWahapediaPage(faction, unitName) {
  const url = `https://wahapedia.ru/wh40k10ed/factions/${faction}/${unitName}`;
  const res = await fetch(url, { headers: { "User-Agent": "NAPE-40K-Calculator/1.0" } });
  if (!res.ok) return null;
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
  return { text, url };
}

async function handleSearch(searchParams) {
  const rawUnit = searchParams.get("unit");
  if (!rawUnit) return json({ error: "missing_unit" }, 400);

  const unitName = normalizeUnitName(rawUnit);
  const factionHint = searchParams.get("faction") || null;

  // Build ordered list of factions to try: hint first (if valid), then the rest
  const orderedFactions = factionHint
    ? [factionHint, ...FACTION_SLUGS.filter((f) => f !== factionHint)]
    : FACTION_SLUGS;

  for (const faction of orderedFactions) {
    try {
      const result = await scrapeWahapediaPage(faction, unitName);
      if (result) return json(result);
    } catch {
      // network error on this faction — continue to next
    }
  }

  return json({ error: "not_found" }, 404);
}

async function handleWahapedia(searchParams) {
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
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const { pathname, searchParams } = new URL(request.url);

    if (pathname === "/search") return handleSearch(searchParams);
    return handleWahapedia(searchParams); // existing /wahapedia behaviour (path-agnostic)
  },
};
```

**Step 4: Run tests — expect them to pass**

```bash
npm test -- --run worker/worker.test.js 2>&1 | tail -20
```

Expected: all 7 worker tests pass.

**Step 5: Run full test suite**

```bash
npm test -- --run 2>&1 | tail -10
```

Expected: all tests pass (27 existing + 7 new = 34).

**Step 6: Commit**

```bash
git add worker/worker.js worker/worker.test.js
git commit -m "feat: add /search endpoint to worker — iterates faction slugs to find live Wahapedia page"
```

---

## Task 3: Update `claudeService.js` — Search Fallback in `resolveAndFetch`

**Files:**
- Modify: `src/claudeService.js`

When `fetchWahapediaPage` returns null (path 404'd), call the new `/search` endpoint with the unit name and faction hint extracted from Claude's path. Use the confirmed URL returned by the search (not Claude's guessed URL). Only fall back to training data if the worker is not configured OR the search also returns nothing.

**Step 1: Write failing tests first**

Add to `src/claudeService.test.js` after the existing `fetchWahapediaPage` describe block:

```js
describe("fetchWahapediaSearch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns text and confirmed url on success", async () => {
    const { fetchWahapediaSearch } = await import("./claudeService.js");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        text: "live datasheet",
        url: "https://wahapedia.ru/wh40k10ed/factions/t-au-empire/Broadside-Battlesuits",
      }),
    }));
    const result = await fetchWahapediaSearch("Broadside-Battlesuits", "tau-empire", "https://worker.example.com");
    expect(result.text).toBe("live datasheet");
    expect(result.url).toContain("t-au-empire");
  });

  it("returns null when worker returns not_found", async () => {
    const { fetchWahapediaSearch } = await import("./claudeService.js");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ error: "not_found" }),
    }));
    const result = await fetchWahapediaSearch("Fake-Unit", "orks", "https://worker.example.com");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    const { fetchWahapediaSearch } = await import("./claudeService.js");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const result = await fetchWahapediaSearch("Any-Unit", "necrons", "https://worker.example.com");
    expect(result).toBeNull();
  });
});
```

**Step 2: Run tests — expect them to fail**

```bash
npm test -- --run src/claudeService.test.js 2>&1 | tail -20
```

Expected: 3 new tests fail with "fetchWahapediaSearch is not a function".

**Step 3: Add `fetchWahapediaSearch` and update `resolveAndFetch`**

In `src/claudeService.js`, add after the existing `fetchWahapediaPage` function (around line 161):

```js
export async function fetchWahapediaSearch(unitName, factionHint, workerUrl) {
  try {
    const url = `${workerUrl}/search?unit=${encodeURIComponent(unitName)}&faction=${encodeURIComponent(factionHint)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) return null;
    return data; // { text, url }
  } catch (err) {
    console.warn("[fetchWahapediaSearch] failed", unitName, err);
    return null;
  }
}
```

Then update `resolveAndFetch` (around line 163) to use the search fallback and prefer the confirmed URL:

```js
async function resolveAndFetch(description, client) {
  const path = await resolveWahapediaPath(description, client);
  let wahapediaUrl = path
    ? `https://wahapedia.ru/wh40k10ed/factions/${path}`
    : "https://wahapedia.ru";
  let pageContent = null;
  let source = "training";
  let fetchedAt;

  if (WORKER_URL && path) {
    // Try the direct path first
    let page = await fetchWahapediaPage(path, WORKER_URL);

    // If direct path failed, search by unit name across all faction slugs
    if (!page) {
      const slashIdx = path.indexOf("/");
      const factionHint = slashIdx !== -1 ? path.slice(0, slashIdx) : path;
      const unitName = slashIdx !== -1 ? path.slice(slashIdx + 1) : path;
      page = await fetchWahapediaSearch(unitName, factionHint, WORKER_URL);
    }

    if (page) {
      pageContent = page.text;
      source = "live";
      fetchedAt = new Date().toISOString();
      // Use the confirmed URL from whichever call succeeded
      if (page.url) wahapediaUrl = page.url;
    }
  }

  return { pageContent, source, wahapediaUrl, fetchedAt };
}
```

**Step 4: Run claudeService tests**

```bash
npm test -- --run src/claudeService.test.js 2>&1 | tail -20
```

Expected: all tests pass including the 3 new ones.

**Step 5: Run full test suite**

```bash
npm test -- --run 2>&1 | tail -10
```

Expected: all 37 tests pass (27 original + 7 worker + 3 new claudeService).

**Step 6: Build check**

```bash
npm run build 2>&1 | tail -10
```

Expected: `✓ built` with no new errors.

**Step 7: Commit**

```bash
git add src/claudeService.js src/claudeService.test.js
git commit -m "feat: search fallback in resolveAndFetch — use worker /search when direct path 404s"
```

---

## Task 4: Final Verification

```bash
npm run build 2>&1 | tail -15
npm test -- --run 2>&1 | tail -10
git log --oneline -5
```

Expected:
- Build clean (only pre-existing `inputMode` duplicate attribute warnings)
- All 37 tests pass
- 3 commits since session start

### Manual smoke test (requires deployed worker)

1. Open the app with `VITE_WAHAPEDIA_WORKER_URL` set
2. Type "broadside battlesuits" in the attacker lookup bar and click Fill Attacker
3. A weapon disambiguation list should appear with weapons from the **live** Wahapedia page
4. The source badge should show `live` not `training`
5. The displayed URL should be `https://wahapedia.ru/wh40k10ed/factions/t-au-empire/Broadside-Battlesuits` (confirmed, not guessed)
6. Pick a weapon — stats should populate from live data
7. Repeat with "crisis battlesuits" — same faction, should also resolve to `t-au-empire`
8. Try "noise marine" — should resolve to `emperor-s-children`
