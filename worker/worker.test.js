import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let worker;
beforeEach(async () => {
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
    const calledUrls = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url) => {
      calledUrls.push(url);
      if (url.includes("/t-au-empire/")) return Promise.resolve({
        ok: true,
        text: () => Promise.resolve("<html>Broadside</html>"),
      });
      return Promise.resolve({ ok: false, status: 404 });
    }));
    const req = makeRequest("https://worker.example.com/search?unit=Broadside-Battlesuits&faction=tau-empire");
    const res = await worker.fetch(req);
    const data = await res.json();
    // tau-empire (invalid hint, fails FACTION_SLUGS validation) → skipped, search starts from beginning of FACTION_SLUGS
    expect(data.url).toContain("t-au-empire");
    expect(data.error).toBeUndefined();
    // First call must have been to space-marines (first in FACTION_SLUGS), not tau-empire
    expect(calledUrls[0]).toContain("space-marines");
    // t-au-empire must appear in the calls
    expect(calledUrls.some(u => u.includes("t-au-empire"))).toBe(true);
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
