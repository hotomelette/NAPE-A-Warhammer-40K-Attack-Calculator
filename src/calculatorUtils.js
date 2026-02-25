/**
 * calculatorUtils.js
 * Pure helper functions shared between useCalculator and rollAll logic.
 * No React imports — these are plain JS.
 */

export function parseDiceList(text) {
  if (!text) return [];
  const cleaned = text
    .replace(/\[/g, " ")
    .replace(/\]/g, " ")
    .replace(/,/g, " ")
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(/\s+/)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

export function parseDiceSpec(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: false, n: 0, sides: 6, mod: 0, hasDie: false };
  const m = s.match(/^(\d+)?(?:\s*[dD](\d+))?(?:\s*\+\s*(\d+))?$/);
  if (!m || (!m[1] && !m[2])) return { ok: false, n: 0, sides: 6, mod: 0, hasDie: false };
  const hasDie = !!m[2];
  const n = hasDie
    ? Math.max(1, parseInt(m[1] || "1", 10) || 1)
    : Math.max(0, parseInt(m[1], 10) || 0);
  const sides = Math.max(2, parseInt(m[2] || "6", 10) || 6);
  const mod = Math.max(0, parseInt(m[3] || "0", 10) || 0);
  return { ok: n > 0, n, sides, mod, hasDie };
}

export function clampModPlusMinusOne(mod) {
  if (mod > 1) return 1;
  if (mod < -1) return -1;
  return mod;
}

export function woundTargetNumber(S, T) {
  if (S >= 2 * T) return 2;
  if (S > T) return 3;
  if (S === T) return 4;
  if (S < T && S > T / 2) return 5;
  return 6;
}

export function chooseSaveTarget(armorSave, invulnSave, ap) {
  const armorAfterAp = armorSave - ap;
  if (!invulnSave) return armorAfterAp;
  return Math.min(armorAfterAp, invulnSave);
}

export function clampMin2Plus(target) {
  return Math.max(2, target);
}

export function meets(targetNumber, unmodifiedRoll, mod) {
  return unmodifiedRoll + mod >= targetNumber;
}

export function rollDice(n, sides = 6) {
  return Array.from({ length: n }, () => Math.ceil(Math.random() * sides)).join(" ");
}
