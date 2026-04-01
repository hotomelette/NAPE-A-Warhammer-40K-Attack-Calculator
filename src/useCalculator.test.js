import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCalculator } from "./useCalculator.js";

const base = {
  attacksFixed: true,
  attacksValue: 4,
  attacksRolls: "",
  toHit: 4,
  hitMod: 0,
  strength: 4,
  ap: 0,
  damageFixed: true,
  damageValue: 1,
  damageRolls: "",
  critHitThreshold: 6,
  critWoundThreshold: 6,
  rapidFire: false, rapidFireX: 0, halfRange: false,
  torrent: false, lethalHits: false, sustainedHits: false, sustainedHitsN: 1,
  devastatingWounds: false, precision: false,
  rerollHitOnes: false, rerollHitFails: false,
  rerollWoundOnes: false, rerollWoundFails: false, twinLinked: false,
  hitRerollRollsText: "", woundRerollRollsText: "",
  toughness: 4,
  armorSave: 3, invulnSave: "",
  inCover: false, ignoreAp: false, woundMod: 0, saveMod: 0,
  ignoreFirstFailedSave: false, minusOneDamage: false, halfDamage: false,
  fnp: "", fnpEnabled: false, fnpRollsText: "",
  hitRollsText: "4 4 4 4",
  woundRollsText: "4 4 4 4",
  saveRollsText: "1 1 1 1",
  hasLeaderAttached: false, allocatePrecisionToLeader: false,
  blastEnabled: false, blastUnitSize: 10,
  meltaEnabled: false, meltaX: 0,
  lance: false,
  antiXEnabled: false, antiXThreshold: 5,
};

describe("Blast", () => {
  it("does not add attacks when disabled", () => {
    const { result } = renderHook(() => useCalculator({ ...base, blastEnabled: false, blastUnitSize: 10 }));
    expect(result.current.A).toBe(4);
  });

  it("adds floor(unitSize/5) attacks when enabled with 10 models", () => {
    const { result } = renderHook(() => useCalculator({
      ...base,
      blastEnabled: true,
      blastUnitSize: 10,
      hitRollsText: "4 4 4 4 4 4",
      woundRollsText: "4 4 4 4 4 4",
      saveRollsText: "1 1 1 1 1 1",
    }));
    expect(result.current.A).toBe(6);
    expect(result.current.totalPostFnp).toBe(6);
  });

  it("adds 0 attacks for unitSize < 5", () => {
    const { result } = renderHook(() => useCalculator({ ...base, blastEnabled: true, blastUnitSize: 4 }));
    expect(result.current.A).toBe(4);
  });

  it("adds 3 attacks for unitSize 15", () => {
    const { result } = renderHook(() => useCalculator({
      ...base,
      blastEnabled: true,
      blastUnitSize: 15,
      hitRollsText: "4 4 4 4 4 4 4",
      woundRollsText: "4 4 4 4 4 4 4",
      saveRollsText: "1 1 1 1 1 1 1",
    }));
    expect(result.current.A).toBe(7);
  });
});

describe("Anti-X", () => {
  it("does not change crit wound threshold when disabled", () => {
    const { result } = renderHook(() => useCalculator({
      ...base,
      devastatingWounds: true,
      antiXEnabled: false,
      antiXThreshold: 5,
      woundRollsText: "5 5 5 5",
    }));
    expect(result.current.critWounds).toBe(0);
    expect(result.current.mortalWoundAttacks).toBe(0);
  });

  it("lowers crit wound threshold when enabled", () => {
    const { result } = renderHook(() => useCalculator({
      ...base,
      devastatingWounds: true,
      antiXEnabled: true,
      antiXThreshold: 5,
      woundRollsText: "5 5 5 5",
    }));
    expect(result.current.critWounds).toBe(4);
    expect(result.current.mortalWoundAttacks).toBe(4);
  });
});

describe("Lance", () => {
  it("does not change save target when disabled", () => {
    const { result } = renderHook(() => useCalculator({ ...base, ap: 0, armorSave: 3, lance: false }));
    expect(result.current.saveTarget).toBe(3);
  });

  it("improves AP by 1 (AP 0 → effective AP -1, save target 3 → 4)", () => {
    // AP 0 with lance = effective AP -1
    // chooseSaveTarget(3, null, -1) = 3 - (-1) = 4
    // Rolling 3s: without lance 3>=3 saves, with lance 3>=4 fails
    const { result } = renderHook(() => useCalculator({
      ...base,
      ap: 0,
      armorSave: 3,
      lance: true,
      saveRollsText: "3 3 3 3",
    }));
    expect(result.current.saveTarget).toBe(4);
    expect(result.current.failedSaves).toBe(4);
  });
});
