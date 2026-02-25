import { useMemo } from "react";
import { parseDiceList, parseDiceSpec, clampModPlusMinusOne, woundTargetNumber, chooseSaveTarget, clampMin2Plus, meets } from "./calculatorUtils.js";

/**
 * useCalculator
 * Pure calculation hook — no UI concerns.
 * Takes all weapon/target/dice state as a single params object.
 * Returns a stable memoized computed object.
 */
export function useCalculator({
  // Weapon
  attacksFixed, attacksValue, attacksRolls,
  rapidFire, rapidFireX, halfRange,
  toHit, hitMod,
  strength, ap,
  damageFixed, damageValue, damageRolls,
  critHitThreshold, critWoundThreshold,
  // Keywords
  torrent, lethalHits, sustainedHits, sustainedHitsN,
  devastatingWounds, precision,
  // Rerolls
  rerollHitOnes, rerollHitFails,
  rerollWoundOnes, rerollWoundFails,
  twinLinked,
  hitRerollRollsText, woundRerollRollsText,
  // Target
  toughness, armorSave, invulnSave,
  inCover, ignoreAp,
  woundMod, saveMod,
  // Damage mods
  ignoreFirstFailedSave, minusOneDamage, halfDamage,
  // FNP
  fnp, fnpEnabled, fnpRollsText,
  // Dice rolls
  hitRollsText, woundRollsText, saveRollsText,
  // Precision / Leader
  hasLeaderAttached, allocatePrecisionToLeader,
}) {
  return useMemo(() => {
    const log = [];
    const errors = [];

    const hitModCapped = clampModPlusMinusOne(Number(hitMod) || 0);
    const saveModCapped = clampModPlusMinusOne(Number(saveMod) || 0);
    const woundModNum = Number(woundMod) || 0;

    // Step 1: Attacks
    let A = 0;
    if (attacksFixed) {
      A = Math.max(0, parseInt(String(attacksValue || "0"), 10) || 0);
      log.push(`Attacks fixed: A = ${A}`);
    } else {
      // Supports expressions like "2", "2D6", "D6+1", "2D6+2", "D3+3"
      const spec = parseDiceSpec(attacksValue);
      const diceCount = spec.n;
      const attackMod = spec.mod || 0;

      if (!spec.ok) {
        errors.push('Random attacks: enter a dice expression like "2D6", "D6+1", or "2" (for 2D6).');
      }

      const rolls = parseDiceList(attacksRolls);

      if (diceCount <= 0) {
        errors.push('Attacks are random: enter a dice expression (e.g. "D6+1", "2D6", "2").');
      } else if (rolls.length !== diceCount) {
        errors.push(`Attack rolls provided (${rolls.length}) must equal dice count (${diceCount}).`);
      }

      if (rolls.length === 0) {
        errors.push("Attacks are random but no attack-roll dice were provided.");
      }

      const diceSum = rolls.reduce((sum, r) => sum + r, 0);
      A = diceSum + attackMod;
      const modStr = attackMod > 0 ? ` + ${attackMod} (modifier)` : "";
      log.push(`Attacks random: spec = ${attacksValue || "?"}, dice = ${diceCount}D${spec.sides}, rolls = [${rolls.join(", ")}]${modStr}, A = ${A}`);
    }

    // Rapid Fire: at half range, add X attacks to the weapon's Attacks characteristic.
    // This adjusts A *before* hit dice are validated/entered.
    const rfX = Math.max(0, Number(rapidFireX) || 0);
    if (rapidFire && halfRange && rfX > 0) {
      A += rfX;
      log.push(`Rapid Fire: half range enabled. +${rfX} attacks. A => ${A}`);
    }

    // Step 2: Hits
    const hitRolls = parseDiceList(hitRollsText);
    if (!torrent && hitRolls.length !== A) {
      errors.push(`Hit rolls provided (${hitRolls.length}) must equal A (${A}) unless TORRENT/auto-hit is enabled.`);
    }

    const hits = [];
    let critHits = 0;
    let sustainedExtraHits = 0;
    let autoWoundsFromLethal = 0;
    let precisionEligible = 0;

    if (torrent) {
      for (let i = 0; i < A; i++) hits.push({ unmod: null, success: true, crit: false });
      log.push(`Hit phase: TORRENT/auto-hit enabled. Hits = ${A}. No crit hits possible.`);
    } else {
      for (let i = 0; i < A; i++) {
        const unmod = hitRolls[i];
        if (!(unmod >= 1 && unmod <= 6)) {
          errors.push(`Hit roll #${i + 1} is not a valid D6 result (1-6).`);
          continue;
        }
        const success = meets(Number(toHit) || 7, unmod, hitModCapped);
        const crit = unmod >= (Number(critHitThreshold) || 6);
        hits.push({ unmod, success, crit });

        if (success && crit) {
          critHits++;
          if (sustainedHits) sustainedExtraHits += Math.max(0, Number(sustainedHitsN) || 0);
          if (precision) precisionEligible++;
          if (lethalHits) autoWoundsFromLethal++;
        }
      }
      const hitCount = hits.filter((h) => h.success).length;
      log.push(
        `Hit phase: hits = ${hitCount}, crit hits = ${critHits}, sustained extra hits = ${sustainedExtraHits}, lethal auto-wounds = ${autoWoundsFromLethal}, precision-eligible hits = ${precisionEligible}`
      );
    }


    // Step 2b: Hit rerolls (manual)
    // Determine eligible dice from the *initial* hit rolls, then consume reroll dice in order.
    let hitRerollNeeded = 0;
    if (!torrent && (rerollHitOnes || rerollHitFails)) {
      const eligible = [];
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        if (!h || h.unmod == null) continue;
        const isOne = h.unmod === 1;
        const isFail = !h.success;
        const ok = rerollHitFails ? isFail : rerollHitOnes ? isOne : false;
        if (ok) eligible.push(i);
      }
      hitRerollNeeded = eligible.length;

      if (hitRerollNeeded > 0) {
        const rr = parseDiceList(hitRerollRollsText);
        if (rr.length !== hitRerollNeeded) {
          errors.push(`Hit reroll dice provided (${rr.length}) must equal eligible hit rerolls (${hitRerollNeeded}).`);
        }

        // Apply rerolls using the provided order.
        let newCritHits = 0;
        let newSustainedExtraHits = 0;
        let newAutoWoundsFromLethal = 0;
        let newPrecisionEligible = 0;

        for (let i = 0; i < hits.length; i++) {
          const h = hits[i];
          if (!h || h.unmod == null) continue;

          let unmod = h.unmod;
          const eligPos = eligible.indexOf(i);
          if (eligPos !== -1 && rr[eligPos] != null) {
            unmod = rr[eligPos];
            if (!(unmod >= 1 && unmod <= 6)) {
              errors.push(`Hit reroll #${eligPos + 1} is not a valid D6 result (1-6).`);
            }
          }

          const success = meets(Number(toHit) || 7, unmod, hitModCapped);
          const crit = unmod >= (Number(critHitThreshold) || 6);
          hits[i] = { unmod, success, crit };

          if (success && crit) {
            newCritHits++;
            if (sustainedHits) newSustainedExtraHits += Math.max(0, Number(sustainedHitsN) || 0);
            if (precision) newPrecisionEligible++;
            if (lethalHits) newAutoWoundsFromLethal++;
          }
        }

        critHits = newCritHits;
        sustainedExtraHits = newSustainedExtraHits;
        autoWoundsFromLethal = newAutoWoundsFromLethal;
        precisionEligible = newPrecisionEligible;

        const hitCountAfter = hits.filter((h) => h.success).length;
        log.push(
          `Hit rerolls: eligible=${hitRerollNeeded}. After rerolls: hits=${hitCountAfter}, crit hits=${critHits}, sustained extra hits=${sustainedExtraHits}, lethal auto-wounds=${autoWoundsFromLethal}`
        );
      }
    }

    const baseSuccessfulHits = hits.filter((h) => h.success).length;
    const totalHitsAfterSustained = baseSuccessfulHits + sustainedExtraHits;

    // Lethal: crit hits become auto-wounds, reducing wound dice count.
    const woundRollPool = Math.max(0, totalHitsAfterSustained - autoWoundsFromLethal);

    // Step 3: Wounds
    const woundRolls = parseDiceList(woundRollsText);
    if (woundRolls.length !== woundRollPool) {
      errors.push(`Wound rolls provided (${woundRolls.length}) must equal wound-roll pool (${woundRollPool}).`);
    }

    const needed = woundTargetNumber(Number(strength) || 0, Number(toughness) || 0);
    let woundSuccesses = 0;
    let critWounds = 0;

    for (let i = 0; i < woundRollPool; i++) {
      const unmod = woundRolls[i];
      if (!(unmod >= 1 && unmod <= 6)) {
        errors.push(`Wound roll #${i + 1} is not a valid D6 result (1-6).`);
        continue;
      }
      const success = meets(needed, unmod, woundModNum);
      if (success) {
        woundSuccesses++;
        if (unmod >= (Number(critWoundThreshold) || 6)) critWounds++;
      }
    }


    // Step 3b: Wound rerolls (manual)
    let woundRerollNeeded = 0;
    const woundRerollActive = rerollWoundOnes || rerollWoundFails || twinLinked;
    if (woundRerollActive && woundRollPool > 0) {
      const eligible = [];
      for (let i = 0; i < woundRollPool; i++) {
        const unmod0 = woundRolls[i];
        if (!(unmod0 >= 1 && unmod0 <= 6)) continue; // already errored above
        const success0 = meets(needed, unmod0, woundModNum);
        const isOne = unmod0 === 1;
        const isFail = !success0;
        const ok = (rerollWoundFails || twinLinked) ? isFail : rerollWoundOnes ? isOne : false;
        if (ok) eligible.push(i);
      }

      woundRerollNeeded = eligible.length;

      if (woundRerollNeeded > 0) {
        const rr = parseDiceList(woundRerollRollsText);
        if (rr.length !== woundRerollNeeded) {
          errors.push(`Wound reroll dice provided (${rr.length}) must equal eligible wound rerolls (${woundRerollNeeded}).`);
        }

        // Recompute wound successes / crit wounds applying rerolls in order.
        let newWoundSuccesses = 0;
        let newCritWounds = 0;

        for (let i = 0; i < woundRollPool; i++) {
          let unmod = woundRolls[i];
          const eligPos = eligible.indexOf(i);
          if (eligPos !== -1 && rr[eligPos] != null) {
            unmod = rr[eligPos];
            if (!(unmod >= 1 && unmod <= 6)) {
              errors.push(`Wound reroll #${eligPos + 1} is not a valid D6 result (1-6).`);
            }
          }

          if (!(unmod >= 1 && unmod <= 6)) continue;
          const success = meets(needed, unmod, woundModNum);
          if (success) {
            newWoundSuccesses++;
            if (unmod >= (Number(critWoundThreshold) || 6)) newCritWounds++;
          }
        }

        woundSuccesses = newWoundSuccesses;
        critWounds = newCritWounds;
        log.push(`Wound rerolls: eligible=${woundRerollNeeded}. After rerolls: wounds from rolls=${woundSuccesses}, crit wounds=${critWounds}`);
      }
    }

    const totalWounds = woundSuccesses + autoWoundsFromLethal;
    log.push(
      `Wound phase: needed ${needed}+ (S=${strength} vs T=${toughness}). Wounds from rolls = ${woundSuccesses}, crit wounds = ${critWounds}, total wounds incl lethal = ${totalWounds}`
    );

    // Step 4: Devastating Wounds conversion
    let mortalWoundAttacks = 0;
    let savableWounds = totalWounds;

    if (devastatingWounds) {
      mortalWoundAttacks = Math.min(critWounds, totalWounds);
      savableWounds = totalWounds - mortalWoundAttacks;
      log.push(`Devastating Wounds: converting ${mortalWoundAttacks} crit wounds to mortal wounds (no saves).`);
    }

    // Step 5: Saves
    const inv = invulnSave === "" ? null : Number(invulnSave);
    const armorBase = Number(armorSave) || 7;
    const armorWithCover = inCover ? clampMin2Plus(armorBase - 1) : armorBase;
    const apForCalc = ignoreAp ? 0 : Number(ap) || 0;
    const saveTarget = clampMin2Plus(chooseSaveTarget(armorWithCover, inv, apForCalc));

    const saveRolls = parseDiceList(saveRollsText);
    if (saveRolls.length !== savableWounds) {
      errors.push(`Save rolls provided (${saveRolls.length}) must equal savable wounds (${savableWounds}).`);
    }

    let failedSaves = 0;
    for (let i = 0; i < savableWounds; i++) {
      const unmod = saveRolls[i];
      if (!(unmod >= 1 && unmod <= 6)) {
        errors.push(`Save roll #${i + 1} is not a valid D6 result (1-6).`);
        continue;
      }
      const success = unmod !== 1 && meets(saveTarget, unmod, saveModCapped);
      if (!success) failedSaves++;
    }

    log.push(
      `Save phase: save target ${saveTarget}+${inCover ? " (Cover)" : ""}${ignoreAp ? " (Ignore AP)" : ""}. Failed saves = ${failedSaves}`
    );

    // Step 5b: Common defensive rules
    const ignoredByRule = ignoreFirstFailedSave && failedSaves > 0 ? 1 : 0;
    const failedSavesEffective = Math.max(0, failedSaves - ignoredByRule);
    if (ignoredByRule) log.push("Mitigation: ignored first failed save (1)");

    // Step 6: Damage
    const damageDice = parseDiceList(damageRolls);

    // Damage-mod ordering used here: halve (round up), then -1 (min 1).
    // Many rules are explicit about order. If a specific datasheet differs, treat this as a limitation.
    const applyDamageMods = (d) => {
      let out = d;
      if (halfDamage) out = Math.ceil(out / 2);
      if (minusOneDamage) out = Math.max(1, out - 1);
      return out;
    };

    let normalDamage = 0;
    let mortalDamage = 0;

    // If variable damage and Dev Wounds is enabled, we interpret dice as:
    //   first N = Dev Wounds conversions, then next M = normal failed saves (after ignore-first-failed-save).
    const expectedVarDice = damageFixed
      ? 0
      : devastatingWounds
        ? mortalWoundAttacks + failedSavesEffective
        : failedSavesEffective;

    if (!damageFixed && expectedVarDice > 0 && damageDice.length !== expectedVarDice) {
      errors.push(
        `Damage rolls provided (${damageDice.length}) must equal ${expectedVarDice} (${devastatingWounds ? "Dev Wounds dice + failed saves" : "failed saves"}).`
      );
    }

    if (damageFixed) {
      const D = Number(damageValue) || 0;
      const per = applyDamageMods(D);
      if (failedSavesEffective > 0) {
        normalDamage = failedSavesEffective * per;
        log.push(
          `Damage: fixed D=${D}. After mods per instance=${per}. Normal damage = ${failedSavesEffective} × ${per} = ${normalDamage}`
        );
      }
      if (mortalWoundAttacks > 0) {
        const perM = applyDamageMods(D);
        mortalDamage = mortalWoundAttacks * perM;
        log.push(`Dev Wounds damage: fixed. ${mortalWoundAttacks} × ${perM} = ${mortalDamage}`);
      }
    } else {
      // Variable damage dice
      let idx = 0;
      if (devastatingWounds && mortalWoundAttacks > 0) {
        for (let i = 0; i < mortalWoundAttacks; i++) {
          const d = damageDice[idx++];
          const dmgSpec = parseDiceSpec(damageValue);
          const dmgSides = dmgSpec.hasDie ? dmgSpec.sides : 6;
          if (!(d >= 1 && d <= dmgSides)) {
            errors.push(`Damage roll #${idx} is not a valid D${dmgSides} result (1-${dmgSides}).`);
            continue;
          }
          mortalDamage += applyDamageMods(d + (dmgSpec.mod || 0));
        }
        log.push(`Dev Wounds damage: variable. Sum after mods = ${mortalDamage}`);
      }

      for (let i = 0; i < failedSavesEffective; i++) {
        const d = damageDice[idx++];
        const dmgSpec2 = parseDiceSpec(damageValue);
        const dmgSides2 = dmgSpec2.hasDie ? dmgSpec2.sides : 6;
        if (!(d >= 1 && d <= dmgSides2)) {
          errors.push(`Damage roll #${idx} is not a valid D${dmgSides2} result (1-${dmgSides2}).`);
          continue;
        }
        normalDamage += applyDamageMods(d + (dmgSpec2.mod || 0));
      }
      if (failedSavesEffective > 0) log.push(`Damage: variable. Normal damage sum after mods = ${normalDamage}`);
    }

    const totalPreFnp = normalDamage + mortalDamage;

    // Step 7: FNP
    const fnpTarget = fnpEnabled && fnp !== "" ? Number(fnp) : null;
    let ignored = 0;
    let totalPostFnp = totalPreFnp;

    if (fnpTarget != null && totalPreFnp > 0) {
      const fnpRolls = parseDiceList(fnpRollsText);
      if (fnpRolls.length !== totalPreFnp) {
        errors.push(`FNP rolls provided (${fnpRolls.length}) must equal total damage (${totalPreFnp}) when FNP is enabled.`);
      }
      for (let i = 0; i < totalPreFnp; i++) {
        const r = fnpRolls[i];
        if (!(r >= 1 && r <= 6)) {
          errors.push(`FNP roll #${i + 1} is not a valid D6 result (1-6).`);
          continue;
        }
        if (r >= fnpTarget) ignored++;
      }
      totalPostFnp = Math.max(0, totalPreFnp - ignored);
      log.push(`Mitigation: FNP ${fnpTarget}+. Ignored = ${ignored}. Post-FNP damage = ${totalPostFnp}`);
    }

    // Precision advisory
    let precisionNote = "";
    if (hasLeaderAttached) {
      if (precision && precisionEligible > 0) {
        precisionNote = allocatePrecisionToLeader
          ? `Precision: ${precisionEligible} eligible crit-hits. You chose to allocate eligible attacks to the leader.`
          : `Precision: ${precisionEligible} eligible crit-hits. You chose NOT to allocate to the leader.`;
      } else {
        precisionNote = "Leader attached: cannot allocate attacks to leader unless Precision triggers.";
      }
    }

    return {
      A,
      hitRerollNeeded,
      woundRollPool,
      woundRerollNeeded,
      needed,
      saveTarget,
      critHits,
      sustainedExtraHits,
      autoWoundsFromLethal,
      totalWounds,
      critWounds,
      mortalWoundAttacks,
      savableWounds,
      failedSaves,
      failedSavesEffective,
      ignoredByRule,
      normalDamage,
      mortalDamage,
      totalPreFnp,
      ignored,
      totalPostFnp,
      precisionEligible,
      precisionNote,
      errors,
      log,
    };

  }, [
    attacksFixed, attacksValue, attacksRolls,
    rapidFire, rapidFireX, halfRange,
    toHit, hitMod, strength, ap,
    damageFixed, damageValue, damageRolls,
    critHitThreshold, critWoundThreshold,
    torrent, lethalHits, sustainedHits, sustainedHitsN,
    devastatingWounds, precision,
    rerollHitOnes, rerollHitFails,
    rerollWoundOnes, rerollWoundFails, twinLinked,
    hitRerollRollsText, woundRerollRollsText,
    toughness, armorSave, invulnSave,
    inCover, ignoreAp, woundMod, saveMod,
    ignoreFirstFailedSave, minusOneDamage, halfDamage,
    fnp, fnpEnabled, fnpRollsText,
    hitRollsText, woundRollsText, saveRollsText,
    hasLeaderAttached, allocatePrecisionToLeader,
  ]);
}
