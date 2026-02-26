import { describe, it, expect } from "vitest";
import { mapToWeaponFields, mapToTargetFields } from "./claudeService.js";

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
