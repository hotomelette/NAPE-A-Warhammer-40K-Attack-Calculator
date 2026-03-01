# Wahapedia Worker Caching Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Cache successful Wahapedia responses in the Cloudflare Worker for 24 hours so repeated unit lookups make zero outbound requests to Wahapedia.

**Architecture:** Use Cloudflare's built-in `caches.default` (Cache API, free tier). Both `/wahapedia` and `/search` handlers receive the full `request` object as their cache key. On miss, fetch as normal; on success, add `Cache-Control: public, max-age=86400` to the response and store it with `cache.put`. Error responses are never cached. Tests stub `caches.default` in `beforeEach` so existing tests continue passing after the cache calls are added.

**Tech Stack:** Cloudflare Workers (Cache API), Vitest 4. Only `worker/worker.js` and `worker/worker.test.js` change.

---

## Background: How `caches.default` Works in Tests

Cloudflare Workers expose `caches.default` as a global. Vitest runs in Node.js where this global doesn't exist. Every test must stub it or the worker will throw `caches is not defined`.

The `beforeEach` block already stubs `fetch` — after this plan it will also stub `caches.default` with a default no-op (cache always misses, `put` does nothing). Individual cache tests override this with their own mock. The existing `afterEach(() => vi.unstubAllGlobals())` cleans up both.

---

## Task 1: Update Test Setup + Write Failing Cache Tests

**Files:**
- Modify: `worker/worker.test.js`

### Step 1: Read current `beforeEach` and `afterEach` in `worker/worker.test.js`

Read `worker/worker.test.js` offset=1 limit=15 to see the current setup.

### Step 2: Add `caches.default` stub to `beforeEach`

Find the current `beforeEach`:
```js
beforeEach(async () => {
  vi.resetModules();
  worker = (await import("./worker.js")).default;
});
```

Replace with:
```js
beforeEach(async () => {
  vi.resetModules();
  worker = (await import("./worker.js")).default;
  // Default cache stub: always miss, put is a no-op.
  // Individual tests override this as needed.
  vi.stubGlobal("caches", {
    default: {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    },
  });
});
```

### Step 3: Run existing tests to confirm they still pass

```bash
cd "C:/Users/XXIV/NAPE-A-Warhammer-40K-Attack-Calculator" && npm test -- --run worker/worker.test.js 2>&1 | tail -10
```

Expected: all 8 existing tests pass (they now go through a cache miss and proceed as normal).

### Step 4: Add three new cache tests at the end of `worker/worker.test.js`

Append a new `describe` block after the last existing `describe`:

```js
describe("worker caching", () => {
  it("returns cached response without fetching Wahapedia on cache hit", async () => {
    const cachedBody = JSON.stringify({ text: "cached content", url: "https://wahapedia.ru/wh40k10ed/factions/necrons/Canoptek-Doomstalker" });
    const cachedResponse = new Response(cachedBody, { headers: { "Content-Type": "application/json" } });
    vi.stubGlobal("caches", {
      default: {
        match: vi.fn().mockResolvedValue(cachedResponse),
        put: vi.fn(),
      },
    });
    vi.stubGlobal("fetch", vi.fn()); // must not be called

    const req = makeRequest("https://worker.example.com/wahapedia?path=necrons/Canoptek-Doomstalker");
    const res = await worker.fetch(req);
    const data = await res.json();

    expect(data.text).toBe("cached content");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stores successful response in cache with 24h Cache-Control header", async () => {
    const mockPut = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("caches", {
      default: {
        match: vi.fn().mockResolvedValue(undefined),
        put: mockPut,
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><body>unit content</body></html>"),
    }));

    const req = makeRequest("https://worker.example.com/wahapedia?path=necrons/Canoptek-Doomstalker");
    await worker.fetch(req);

    expect(mockPut).toHaveBeenCalledOnce();
    const storedResponse = mockPut.mock.calls[0][1];
    expect(storedResponse.headers.get("Cache-Control")).toBe("public, max-age=86400");
  });

  it("does not cache error responses", async () => {
    const mockPut = vi.fn();
    vi.stubGlobal("caches", {
      default: {
        match: vi.fn().mockResolvedValue(undefined),
        put: mockPut,
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const req = makeRequest("https://worker.example.com/wahapedia?path=bad/Path");
    await worker.fetch(req);

    expect(mockPut).not.toHaveBeenCalled();
  });
});
```

### Step 5: Run tests to confirm the 3 new tests fail

```bash
cd "C:/Users/XXIV/NAPE-A-Warhammer-40K-Attack-Calculator" && npm test -- --run worker/worker.test.js 2>&1 | tail -15
```

Expected: 8 pass, 3 fail (caching not implemented yet — `caches.default.match` is called but the handler doesn't use the result).

---

## Task 2: Implement Caching in the Worker

**Files:**
- Modify: `worker/worker.js`

### Step 1: Read current `handleWahapedia`, `handleSearch`, and the `fetch` export

Read `worker/worker.js` offset=55 limit=55 to see the two handlers and the export.

### Step 2: Update `handleSearch` signature and add cache logic

Find:
```js
async function handleSearch(searchParams) {
  const rawUnit = searchParams.get("unit");
  if (!rawUnit) return json({ error: "missing_unit" }, 400);

  const unitName = normalizeUnitName(rawUnit);
  const rawFaction = searchParams.get("faction");
  const factionHint = rawFaction && FACTION_SLUGS.includes(rawFaction) ? rawFaction : null;

  // Try faction hint first, then all remaining factions
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
```

Replace with:
```js
async function handleSearch(request, searchParams) {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  const rawUnit = searchParams.get("unit");
  if (!rawUnit) return json({ error: "missing_unit" }, 400);

  const unitName = normalizeUnitName(rawUnit);
  const rawFaction = searchParams.get("faction");
  const factionHint = rawFaction && FACTION_SLUGS.includes(rawFaction) ? rawFaction : null;

  // Try faction hint first, then all remaining factions
  const orderedFactions = factionHint
    ? [factionHint, ...FACTION_SLUGS.filter((f) => f !== factionHint)]
    : FACTION_SLUGS;

  for (const faction of orderedFactions) {
    try {
      const result = await scrapeWahapediaPage(faction, unitName);
      if (result) {
        const response = json(result);
        response.headers.set("Cache-Control", "public, max-age=86400");
        await cache.put(request, response.clone());
        return response;
      }
    } catch {
      // network error on this faction — continue to next
    }
  }

  return json({ error: "not_found" }, 404);
}
```

### Step 3: Update `handleWahapedia` signature and add cache logic

Find:
```js
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
    return json({ text: stripHtml(html), url: wahapediaUrl });
  } catch (e) {
    return json({ error: "fetch_failed", message: e.message }, 502);
  }
}
```

Replace with:
```js
async function handleWahapedia(request, searchParams) {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  const path = searchParams.get("path");
  if (!path) return json({ error: "missing_path" }, 400);

  const wahapediaUrl = `https://wahapedia.ru/wh40k10ed/factions/${path}`;
  try {
    const res = await fetch(wahapediaUrl, {
      headers: { "User-Agent": "NAPE-40K-Calculator/1.0" },
    });
    if (!res.ok) return json({ error: "not_found", status: res.status }, 404);
    const html = await res.text();
    const response = json({ text: stripHtml(html), url: wahapediaUrl });
    response.headers.set("Cache-Control", "public, max-age=86400");
    await cache.put(request, response.clone());
    return response;
  } catch (e) {
    return json({ error: "fetch_failed", message: e.message }, 502);
  }
}
```

### Step 4: Update the `fetch` export to pass `request` to both handlers

Find:
```js
export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const { pathname, searchParams } = new URL(request.url);

    if (pathname === "/search") return handleSearch(searchParams);
    return handleWahapedia(searchParams);
  },
};
```

Replace with:
```js
export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const { pathname, searchParams } = new URL(request.url);

    if (pathname === "/search") return handleSearch(request, searchParams);
    return handleWahapedia(request, searchParams);
  },
};
```

### Step 5: Run worker tests — expect all 11 to pass

```bash
cd "C:/Users/XXIV/NAPE-A-Warhammer-40K-Attack-Calculator" && npm test -- --run worker/worker.test.js 2>&1 | tail -10
```

Expected: 11/11 pass.

### Step 6: Run full test suite

```bash
cd "C:/Users/XXIV/NAPE-A-Warhammer-40K-Attack-Calculator" && npm test -- --run 2>&1 | tail -8
```

Expected: 41 tests pass (38 existing + 3 new cache tests).

### Step 7: Commit

```bash
cd "C:/Users/XXIV/NAPE-A-Warhammer-40K-Attack-Calculator" && git add worker/worker.js worker/worker.test.js && git commit -m "feat: cache Wahapedia responses for 24h in worker (Cache API)"
```

---

## Task 3: Deploy and Verify

### Step 1: Deploy worker

```bash
cd "C:/Users/XXIV/NAPE-A-Warhammer-40K-Calculator/worker" && npx wrangler deploy 2>&1 | tail -5
```

Expected: `Deployed nape-wahapedia triggers` with a new Version ID.

### Step 2: Smoke test — first request (cache miss)

```bash
node -e "
const WORKER = 'https://nape-wahapedia.nape-wahapedia.workers.dev';
async function run() {
  console.time('first');
  const res = await fetch(\`\${WORKER}/search?unit=Broadside-Battlesuits&faction=t-au-empire\`);
  const data = await res.json();
  console.timeEnd('first');
  console.log('CF-Cache-Status:', res.headers.get('CF-Cache-Status'));
  console.log('URL:', data.url ?? data.error);
}
run();
" 2>&1
```

Expected: responds correctly, `CF-Cache-Status` will be `MISS` on first request.

### Step 3: Smoke test — second request (cache hit)

Run the exact same command again immediately after:

```bash
node -e "
const WORKER = 'https://nape-wahapedia.nape-wahapedia.workers.dev';
async function run() {
  console.time('second');
  const res = await fetch(\`\${WORKER}/search?unit=Broadside-Battlesuits&faction=t-au-empire\`);
  const data = await res.json();
  console.timeEnd('second');
  console.log('CF-Cache-Status:', res.headers.get('CF-Cache-Status'));
  console.log('URL:', data.url ?? data.error);
}
run();
" 2>&1
```

Expected: `CF-Cache-Status: HIT`, noticeably faster response time.

### Step 4: Push to git

```bash
cd "C:/Users/XXIV/NAPE-A-Warhammer-40K-Attack-Calculator" && git push origin main 2>&1 | tail -3
```

---

## Final Verification

```bash
cd "C:/Users/XXIV/NAPE-A-Warhammer-40K-Attack-Calculator" && npm test -- --run 2>&1 | tail -8 && git log --oneline -5
```

Expected: 41 tests pass, clean build, cache commit in log.
