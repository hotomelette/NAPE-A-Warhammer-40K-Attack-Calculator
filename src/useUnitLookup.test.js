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
    const weaponFields = { attacksFixed: true, attacksValue: "1", toHit: "3", strength: "8", ap: "-3", damageFixed: true, damageValue: "3", torrent: false, lethalHits: false, sustainedHits: false, sustainedHitsN: 1, devastatingWounds: false, twinLinked: false };
    fetchAttackerStats.mockResolvedValueOnce(weaponFields);
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
    const targetFields = { toughness: "8", armorSave: "3", invulnSave: "4", fnpEnabled: false, fnp: "" };
    fetchDefenderStats.mockResolvedValueOnce(targetFields);
    const dispatch = vi.fn();
    const { result } = renderHook(() => useUnitLookup(getApiKey));
    act(() => result.current.setDefenderText("canoptek doomstalker"));
    await act(() => result.current.fillDefender(dispatch));
    expect(dispatch).toHaveBeenCalledWith({ type: "LOAD_TARGET", target: targetFields });
    expect(result.current.lastFilled).toBe("defender");
    expect(result.current.defenderError).toBe(null);
  });
});
