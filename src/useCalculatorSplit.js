import { useMemo } from "react";
import { parseDiceList, parseDiceSpec, clampModPlusMinusOne, chooseSaveTarget, clampMin2Plus, meets } from "./calculatorUtils.js";

/**
 * useCalculatorSplit
 * Runs the saves → damage → FNP pipeline for ONE target.
 * Called once per target in split-volley mode.
 *
 * Takes:
 *   - savableWounds: number (from shared wound phase)
 *   - mortalWoundAttacks: number (from shared wound phase, Dev Wounds)
 *   - woundsAllocated: number (how many of the savable wounds go to this target)
 *   - target stats (armorSave, invulnSave, toughness, ap, etc.)
 *   - dice (saveRollsText, damageRolls, fnpRollsText)
 *   - weapon damage stats (damageFixed, damageValue)
 *   - label: "A" | "B" for log clarity
 */
export function useCalculatorSplit({
  // Wound allocation
  woundsAllocated,
  mortalWoundsAllocated,
  // Target
  armorSave, invulnSave, inCover, ignoreAp, saveMod,
  ignoreFirstFailedSave, minusOneDamage, halfDamage,
  fnp, fnpEnabled,
  // Weapon damage
  ap, damageFixed, damageValue, devastatingWounds,
  // Dice
  saveRollsText, damageRolls, fnpRollsText,
  // Meta
  label,
  enabled,
}) {
  return useMemo(() => {
    if (!enabled) return null;

    const log = [];
    const errors = [];
    const saveModCapped = clampModPlusMinusOne(Number(saveMod) || 0);

    const savableWounds = woundsAllocated;
    const mortalWoundAttacks = mortalWoundsAllocated;

    // ── Saves ──
    const inv = invulnSave === "" ? null : Number(invulnSave);
    const armorBase = Number(armorSave) || 7;
    const armorWithCover = inCover ? clampMin2Plus(armorBase - 1) : armorBase;
    const apForCalc = ignoreAp ? 0 : Number(ap) || 0;
    const saveTarget = clampMin2Plus(chooseSaveTarget(armorWithCover, inv, apForCalc));

    const saveRolls = parseDiceList(saveRollsText);
    if (savableWounds > 0 && saveRolls.length !== savableWounds) {
      errors.push(`Target ${label}: Save rolls provided (${saveRolls.length}) must equal wounds allocated (${savableWounds}).`);
    }

    let failedSaves = 0;
    for (let i = 0; i < savableWounds; i++) {
      const unmod = saveRolls[i];
      if (!(unmod >= 1 && unmod <= 6)) {
        errors.push(`Target ${label}: Save roll #${i + 1} is not a valid D6 result (1-6).`);
        continue;
      }
      const success = unmod !== 1 && meets(saveTarget, unmod, saveModCapped);
      if (!success) failedSaves++;
    }

    log.push(`[Target ${label}] Save phase: target ${saveTarget}+. ${savableWounds} wounds allocated, ${failedSaves} failed.`);

    const ignoredByRule = ignoreFirstFailedSave && failedSaves > 0 ? 1 : 0;
    const failedSavesEffective = Math.max(0, failedSaves - ignoredByRule);

    // ── Damage ──
    const applyDamageMods = (d) => {
      let out = d;
      if (halfDamage) out = Math.ceil(out / 2);
      if (minusOneDamage) out = Math.max(1, out - 1);
      return out;
    };

    const damageDice = parseDiceList(damageRolls);
    const expectedVarDice = damageFixed
      ? 0
      : devastatingWounds
        ? mortalWoundAttacks + failedSavesEffective
        : failedSavesEffective;

    if (!damageFixed && expectedVarDice > 0 && damageDice.length !== expectedVarDice) {
      errors.push(`Target ${label}: Damage rolls provided (${damageDice.length}) must equal ${expectedVarDice}.`);
    }

    let normalDamage = 0;
    let mortalDamage = 0;

    if (damageFixed) {
      const D = Number(damageValue) || 0;
      const per = applyDamageMods(D);
      normalDamage = failedSavesEffective * per;
      const perM = applyDamageMods(D);
      mortalDamage = mortalWoundAttacks * perM;
    } else {
      const dmgSpec = parseDiceSpec(damageValue);
      const dmgSides = dmgSpec.hasDie ? dmgSpec.sides : 6;
      let idx = 0;
      if (devastatingWounds && mortalWoundAttacks > 0) {
        for (let i = 0; i < mortalWoundAttacks; i++) {
          const d = damageDice[idx++];
          if (!(d >= 1 && d <= dmgSides)) { errors.push(`Target ${label}: Damage roll #${idx} invalid.`); continue; }
          mortalDamage += applyDamageMods(d + (dmgSpec.mod || 0));
        }
      }
      for (let i = 0; i < failedSavesEffective; i++) {
        const d = damageDice[idx++];
        if (!(d >= 1 && d <= dmgSides)) { errors.push(`Target ${label}: Damage roll #${idx} invalid.`); continue; }
        normalDamage += applyDamageMods(d + (dmgSpec.mod || 0));
      }
    }

    const totalPreFnp = normalDamage + mortalDamage;
    log.push(`[Target ${label}] Damage: normal=${normalDamage}, mortal=${mortalDamage}, total pre-FNP=${totalPreFnp}`);

    // ── FNP ──
    let ignored = 0;
    const fnpRolls = parseDiceList(fnpRollsText);
    const fnpTarget = Number(fnp) || 7;
    const fnpNeeded = fnpEnabled && fnp !== "" ? totalPreFnp : 0;

    if (fnpNeeded > 0) {
      if (fnpRolls.length !== fnpNeeded) {
        errors.push(`Target ${label}: FNP rolls provided (${fnpRolls.length}) must equal ${fnpNeeded}.`);
      }
      for (const r of fnpRolls) {
        if (!(r >= 1 && r <= 6)) { errors.push(`Target ${label}: FNP roll ${r} invalid.`); continue; }
        if (r >= fnpTarget) ignored++;
      }
      log.push(`[Target ${label}] FNP: ${ignored} wounds ignored out of ${fnpNeeded}.`);
    }

    const totalPostFnp = Math.max(0, totalPreFnp - ignored);

    return {
      saveTarget,
      failedSaves,
      failedSavesEffective,
      ignoredByRule,
      normalDamage,
      mortalDamage,
      totalPreFnp,
      ignored,
      totalPostFnp,
      fnpNeeded,
      errors,
      log,
    };
  }, [
    woundsAllocated, mortalWoundsAllocated,
    armorSave, invulnSave, inCover, ignoreAp, saveMod,
    ignoreFirstFailedSave, minusOneDamage, halfDamage,
    fnp, fnpEnabled, ap,
    damageFixed, damageValue, devastatingWounds,
    saveRollsText, damageRolls, fnpRollsText,
    label, enabled,
  ]);
}
