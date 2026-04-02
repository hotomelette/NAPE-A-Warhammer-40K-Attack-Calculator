import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUnitHistory } from "./useUnitHistory.js";

const SAMPLE_TARGET = { toughness: "6", armorSave: "3", invulnSave: "", fnpEnabled: false, fnp: "" };
const SAMPLE_WEAPON = { attacksFixed: true, attacksValue: "3", toHit: "4", strength: "5", ap: "-1", damageFixed: true, damageValue: "1" };

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useUnitHistory", () => {
  it("starts with empty history when localStorage is empty", () => {
    const { result } = renderHook(() => useUnitHistory());
    expect(result.current.history).toEqual([]);
  });

  it("addOrUpdateEntry creates a new entry", () => {
    const { result } = renderHook(() => useUnitHistory());
    act(() => {
      result.current.addOrUpdateEntry("devilfish", "Devilfish", SAMPLE_TARGET, "https://wahapedia.ru/devilfish");
    });
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].unitName).toBe("Devilfish");
    expect(result.current.history[0].targetFields).toEqual(SAMPLE_TARGET);
  });

  it("addOrUpdateEntry updates existing entry and moves it to front", () => {
    const { result } = renderHook(() => useUnitHistory());
    act(() => {
      result.current.addOrUpdateEntry("devilfish", "Devilfish", SAMPLE_TARGET, "https://wahapedia.ru/devilfish");
      result.current.addOrUpdateEntry("crisis-suit", "Crisis Suit", SAMPLE_TARGET, "https://wahapedia.ru/crisis");
      result.current.addOrUpdateEntry("devilfish", "Devilfish", { ...SAMPLE_TARGET, toughness: "7" }, "https://wahapedia.ru/devilfish");
    });
    expect(result.current.history).toHaveLength(2);
    expect(result.current.history[0].id).toBe("devilfish");
    expect(result.current.history[0].targetFields.toughness).toBe("7");
  });

  it("addWeapon appends weapon to existing entry", () => {
    const { result } = renderHook(() => useUnitHistory());
    act(() => {
      result.current.addOrUpdateEntry("devilfish", "Devilfish", SAMPLE_TARGET, "https://wahapedia.ru/devilfish");
      result.current.addWeapon("devilfish", "Twin Pulse Carbine", SAMPLE_WEAPON);
    });
    expect(result.current.history[0].weapons).toHaveLength(1);
    expect(result.current.history[0].weapons[0].label).toBe("Twin Pulse Carbine");
  });

  it("addWeapon does not duplicate weapons with same label", () => {
    const { result } = renderHook(() => useUnitHistory());
    act(() => {
      result.current.addOrUpdateEntry("devilfish", "Devilfish", SAMPLE_TARGET, "https://wahapedia.ru/devilfish");
      result.current.addWeapon("devilfish", "Twin Pulse Carbine", SAMPLE_WEAPON);
      result.current.addWeapon("devilfish", "Twin Pulse Carbine", SAMPLE_WEAPON);
    });
    expect(result.current.history[0].weapons).toHaveLength(1);
  });

  it("removeEntry removes by id", () => {
    const { result } = renderHook(() => useUnitHistory());
    act(() => {
      result.current.addOrUpdateEntry("devilfish", "Devilfish", SAMPLE_TARGET, "https://wahapedia.ru/devilfish");
      result.current.addOrUpdateEntry("crisis-suit", "Crisis Suit", SAMPLE_TARGET, "https://wahapedia.ru/crisis");
      result.current.removeEntry("devilfish");
    });
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].id).toBe("crisis-suit");
  });

  it("clearAll empties history and localStorage", () => {
    const { result } = renderHook(() => useUnitHistory());
    act(() => {
      result.current.addOrUpdateEntry("devilfish", "Devilfish", SAMPLE_TARGET, "https://wahapedia.ru/devilfish");
      result.current.clearAll();
    });
    expect(result.current.history).toEqual([]);
    expect(localStorage.getItem("nape_unit_history")).toBeNull();
  });

  it("persists to localStorage on every change", () => {
    const { result } = renderHook(() => useUnitHistory());
    act(() => {
      result.current.addOrUpdateEntry("devilfish", "Devilfish", SAMPLE_TARGET, "https://wahapedia.ru/devilfish");
    });
    const stored = JSON.parse(localStorage.getItem("nape_unit_history"));
    expect(stored).toHaveLength(1);
    expect(stored[0].unitName).toBe("Devilfish");
  });

  it("loads existing history from localStorage on mount", () => {
    localStorage.setItem("nape_unit_history", JSON.stringify([
      { id: "devilfish", unitName: "Devilfish", targetFields: SAMPLE_TARGET, wahapediaUrl: "", timestamp: "", weapons: [] }
    ]));
    const { result } = renderHook(() => useUnitHistory());
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].unitName).toBe("Devilfish");
  });

  it("caps history at 20 entries", () => {
    const { result } = renderHook(() => useUnitHistory());
    act(() => {
      for (let i = 0; i < 25; i++) {
        result.current.addOrUpdateEntry(`unit-${i}`, `Unit ${i}`, SAMPLE_TARGET, "");
      }
    });
    expect(result.current.history).toHaveLength(20);
  });
});
