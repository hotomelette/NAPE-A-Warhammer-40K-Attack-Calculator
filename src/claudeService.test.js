import { describe, it, expect, vi, afterEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { mapToWeaponFields, mapToTargetFields } from "./claudeService.js";

vi.mock("@anthropic-ai/sdk");

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

  it("returns empty strings for absent numeric fields", () => {
    const raw = { attacks: 2, damage: 1 };
    const result = mapToWeaponFields(raw);
    expect(result.toHit).toBe("");
    expect(result.strength).toBe("");
    expect(result.ap).toBe("");
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

describe("fetchWahapediaSearch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns text and confirmed url on success", async () => {
    const { fetchWahapediaSearch } = await import("./claudeService.js");
    let capturedUrl = null;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          text: "live datasheet",
          url: "https://wahapedia.ru/wh40k10ed/factions/t-au-empire/Broadside-Battlesuits",
        }),
      });
    }));
    const result = await fetchWahapediaSearch("Broadside-Battlesuits", "t-au-empire", "https://worker.example.com");
    expect(result.text).toBe("live datasheet");
    expect(result.url).toContain("t-au-empire");
    // Verify the outgoing request encoded both params correctly
    expect(capturedUrl).toContain("unit=Broadside-Battlesuits");
    expect(capturedUrl).toContain("faction=t-au-empire");
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

describe("fetchAttackerStatsFromPage — parallel target extraction", () => {
  afterEach(() => vi.resetAllMocks());

  const pageCache = {
    pageText: "some datasheet text",
    wahapediaUrl: "https://wahapedia.ru/wh40k10ed/factions/t-au-empire/Crisis-Battlesuits",
    source: "live",
    fetchedAt: "2026-04-01T00:00:00.000Z",
  };

  it("returns targetFields when the parallel defender call succeeds", async () => {
    // No resolveWahapediaPath call — goes straight to Promise.all
    // Call 1: weapon extraction
    // Call 2: defender extraction
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({ content: [{ text: JSON.stringify({
        type: "stats", resolvedName: "Crisis Suit with Plasma Rifle",
        attacks: 2, bs: 4, strength: 7, ap: -2, damage: 2,
      })}]})
      .mockResolvedValueOnce({ content: [{ text: JSON.stringify({
        type: "stats", resolvedName: "Crisis Suit",
        toughness: 5, save: 3, invulnSave: 5,
      })}]});
    vi.mocked(Anthropic).mockImplementation(function() {
      return { messages: { create: mockCreate } };
    });

    const { fetchAttackerStatsFromPage } = await import("./claudeService.js");
    const result = await fetchAttackerStatsFromPage(
      "crisis battlesuits", "Plasma Rifle", pageCache, "test-key"
    );

    expect(result.type).toBe("stats");
    expect(result.targetFields).toMatchObject({ toughness: "5", armorSave: "3", invulnSave: "5" });
  });

  it("returns targetFields: null when the defender call fails", async () => {
    // Call 1: weapon extraction succeeds
    // Call 2: defender extraction rejects
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({ content: [{ text: JSON.stringify({
        type: "stats", resolvedName: "Crisis Suit with Missile Pod",
        attacks: 2, bs: 4, strength: 7, ap: -2, damage: "D3",
      })}]})
      .mockRejectedValueOnce(new Error("timeout"));
    vi.mocked(Anthropic).mockImplementation(function() {
      return { messages: { create: mockCreate } };
    });

    const { fetchAttackerStatsFromPage } = await import("./claudeService.js");
    const result = await fetchAttackerStatsFromPage(
      "crisis battlesuits", "Missile Pod", pageCache, "test-key"
    );

    expect(result.type).toBe("stats");
    expect(result.targetFields).toBeNull();
  });
});

describe("fetchAttackerStats — parallel target extraction", () => {
  afterEach(() => vi.resetAllMocks());

  it("returns targetFields when defender call succeeds", async () => {
    // Call 1: resolveWahapediaPath (returns "unknown" → null, skips page fetch)
    // Call 2: weapon extraction (via Promise.all)
    // Call 3: defender extraction (via Promise.all)
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({ content: [{ text: "unknown" }] })
      .mockResolvedValueOnce({ content: [{ text: JSON.stringify({
        type: "stats", resolvedName: "Crisis Suit with Plasma Rifle",
        attacks: 2, bs: 4, strength: 7, ap: -2, damage: 2,
      })}]})
      .mockResolvedValueOnce({ content: [{ text: JSON.stringify({
        type: "stats", resolvedName: "Crisis Suit",
        toughness: 5, save: 3,
      })}]});
    vi.mocked(Anthropic).mockImplementation(function() {
      return { messages: { create: mockCreate } };
    });

    const { fetchAttackerStats } = await import("./claudeService.js");
    const result = await fetchAttackerStats("crisis suit plasma", "test-key");

    expect(result.type).toBe("stats");
    expect(result.targetFields).toMatchObject({ toughness: "5", armorSave: "3" });
  });

  it("returns targetFields: null when defender call fails gracefully", async () => {
    // Call 1: resolveWahapediaPath → "unknown" → null
    // Call 2: weapon extraction
    // Call 3: defender extraction → rejects
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({ content: [{ text: "unknown" }] })
      .mockResolvedValueOnce({ content: [{ text: JSON.stringify({
        type: "stats", resolvedName: "Crisis Suit",
        attacks: 2, bs: 4, strength: 7, ap: -2, damage: 2,
      })}]})
      .mockRejectedValueOnce(new Error("timeout"));
    vi.mocked(Anthropic).mockImplementation(function() {
      return { messages: { create: mockCreate } };
    });

    const { fetchAttackerStats } = await import("./claudeService.js");
    const result = await fetchAttackerStats("crisis suit", "test-key");

    expect(result.type).toBe("stats");
    expect(result.targetFields).toBeNull();
  });

  it("includes targetFields in disambiguation result", async () => {
    // Call 1: resolveWahapediaPath → "unknown" → null
    // Call 2: weapon extraction → options (disambiguation)
    // Call 3: defender extraction → stats
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({ content: [{ text: "unknown" }] })
      .mockResolvedValueOnce({ content: [{ text: JSON.stringify({
        type: "options", options: ["Plasma Rifle", "Missile Pod"],
      })}]})
      .mockResolvedValueOnce({ content: [{ text: JSON.stringify({
        type: "stats", toughness: 5, save: 3,
      })}]});
    vi.mocked(Anthropic).mockImplementation(function() {
      return { messages: { create: mockCreate } };
    });

    const { fetchAttackerStats } = await import("./claudeService.js");
    const result = await fetchAttackerStats("crisis suit", "test-key");

    expect(result.type).toBe("disambiguation");
    expect(result.targetFields).toMatchObject({ toughness: "5", armorSave: "3" });
  });
});
