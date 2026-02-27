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
