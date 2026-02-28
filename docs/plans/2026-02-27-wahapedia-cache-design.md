# Wahapedia Worker Caching Design

**Date:** 2026-02-27
**Status:** Approved

## Problem

The Cloudflare Worker proxies requests to Wahapedia on every lookup with no caching. The `/search` endpoint can make up to 27 sequential Wahapedia requests in the worst case (iterating all faction slugs). Repeated lookups of the same unit hammer Wahapedia unnecessarily and risk the app losing access to the site.

## Goal

Cache successful Wahapedia responses at the edge so that repeated lookups of the same unit within a 24-hour window make zero outbound requests to Wahapedia.

## Approach: Cache API (cache-aside pattern)

Use Cloudflare's built-in `caches.default` (the Cache API, available on the free tier) to cache successful responses keyed by the full request URL.

**Pattern applied to both `/wahapedia` and `/search` endpoints:**

1. Check `caches.default.match(request)` — on hit, return immediately
2. On miss, run existing fetch/scrape logic
3. On success only, add `Cache-Control: public, max-age=86400` to the response, call `cache.put(request, response.clone())`, then return
4. Error responses (`not_found`, `missing_unit`, `fetch_failed`, etc.) are never cached

**Why not cache errors:** A 404 for a misspelled unit name would be cached and appear "permanently broken" until the TTL expires. Always re-evaluating errors is the correct standard practice.

**Cache key:** Full request URL including query params. A `/search` for `Broadside-Battlesuits` with `faction=tau-empire` and one with `faction=t-au-empire` are separate cache entries — both resolve correctly and both get cached after their first successful hit.

**TTL: 24 hours.** Wahapedia datasheet stats change only when GW releases errata or a new codex — a few times per year. 24 hours balances freshness against Wahapedia load. If a datasheet changes urgently, the stale window is at most one day.

## What Does Not Change

- No new Cloudflare resources (no KV namespace, no paid features)
- `wrangler.toml` unchanged
- Error handling logic unchanged
- `json()` helper unchanged — cache headers added at call site on success only
- All existing tests continue to pass

## Testing

Two new tests in `worker/worker.test.js`:

1. **Cache hit skips fetch** — stub `caches.default.match` to return a cached response; assert `fetch` (the Wahapedia outbound call) is never invoked
2. **Errors not cached** — stub a 404 response; assert `caches.default.put` is never called

## Trade-offs Considered

| Option | Verdict |
|--------|---------|
| Cache API (chosen) | Free, zero new dependencies, standard HTTP caching semantics |
| KV-backed cache | Globally consistent but uses 1k writes/day free limit, overkill |
| Cache only `/wahapedia` | Less effective — `/search` is where the 27-request worst case lives |
| Conditional requests (ETag/If-Modified-Since) | More polite scraping but requires Wahapedia to support those headers |
