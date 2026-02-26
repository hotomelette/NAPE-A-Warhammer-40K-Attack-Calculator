import React, { useReducer, useState, useEffect, useRef } from "react";
import { useCalculator } from "./useCalculator.js";
import { useCalculatorSplit } from "./useCalculatorSplit.js";
import { parseDiceList, parseDiceSpec, clampModPlusMinusOne, rollDice } from "./calculatorUtils.js";
import { appReducer, initialState } from "./appReducer.js";

const APP_NAME = "NAPE – A Warhammer 40K Attack Calculator";
const APP_VERSION = "5.12";

/* =========================
   Helpers — see calculatorUtils.js
========================= */

function RollAllButton({ onClick, disabled, isRolling, isReady }) {
  const cls = isRolling
    ? "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-extrabold border transition bg-amber-600 border-amber-400 text-gray-950 animate-pulse cursor-wait"
    : isReady
      ? "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-extrabold border transition bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 border-amber-400/40 text-gray-950"
      : "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-extrabold border transition bg-transparent border-gray-500 text-gray-400 cursor-not-allowed opacity-60";
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      title={isReady ? "Roll all dice at once" : "Enter weapon and target stats first"}
      className={cls}>
      {isRolling ? "🎲 Rolling…" : "🎲 Roll all"}
    </button>
  );
}

function Section({ title, theme, children, action }) {
  const panelClass =
    theme === "dark"
      ? "rounded-2xl bg-slate-900 shadow p-4 border border-gray-700 text-gray-100"
      : "rounded-2xl bg-white shadow p-4 border border-gray-200 text-gray-900";
  const titleClass =
    theme === "dark"
      ? "text-xl md:text-2xl font-extrabold tracking-wide border-b border-gray-700 pb-2 mb-3"
      : "text-xl md:text-2xl font-extrabold tracking-wide border-b border-gray-200 pb-2 mb-3";
  return (
    <div className={panelClass}>
      <div className={`flex items-center justify-between gap-2 ${titleClass}`}>
        <span>{title}</span>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, children, theme }) {
  const hintClass =
    theme === "dark" ? "text-xs text-gray-300" : "text-xs text-gray-600";

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold tracking-wide">{label}</div>
        {hint ? (
          <div
            title={hint}
            className={`${hintClass} leading-tight text-right max-w-[70%] truncate whitespace-nowrap`}
          >
            {hint}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}


function CounterLabel({ prefix, need, entered, remaining, theme }) {
  const state = remaining === 0 ? "ok" : remaining > 0 ? "low" : "high";
  const color =
    state === "ok"
      ? theme === "dark"
        ? "text-green-300"
        : "text-green-700"
      : state === "low"
        ? theme === "dark"
          ? "text-amber-300"
          : "text-amber-700"
        : theme === "dark"
          ? "text-red-300"
          : "text-red-700";

  const dot = <span className="opacity-50">•</span>;

  return (
    <span className="inline-flex flex-wrap items-baseline gap-2">
      <span className="font-semibold">{prefix}</span>
      {dot}
      <span className={color}>Need</span> <span className="tabular-nums">{need}</span>
      {dot}
      <span className={color}>Entered</span> <span className="tabular-nums">{entered}</span>
      {dot}
      <span className={color}>Remaining</span>{" "}
      <span className="tabular-nums">{Math.max(0, remaining)}</span>
      {remaining < 0 ? (
        <>
          {dot}
          <span className={color}>Too many</span>{" "}
          <span className="tabular-nums">{Math.abs(remaining)}</span>
        </>
      ) : null}
    </span>
  );
}


function Chip({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-600 px-2 py-0.5 text-xs bg-gray-800 text-gray-100">
      {children}
    </span>
  );
}

function damageViz(total) {
  // Provides both the damage emojis and a cohesive page theme.
  // Tailwind classes are kept literal for JIT safety.
  if (total <= 0) {
    return {
      title: "Harmless",
      emoji: "😐🛡️✨",
      sub: "No damage dealt",

      // Small card styling
      container: "bg-white border-gray-200",

      // Global theme
      pageBg: "bg-gradient-to-b from-slate-950 via-gray-900 to-slate-950",
      headerBg: "bg-gradient-to-r from-slate-900 via-gray-800 to-slate-900",
      accentText: "text-amber-300",

      // Total panel
      totalPanel: "bg-gradient-to-br from-slate-950 via-gray-950 to-slate-900 text-gray-100 border-slate-700",
      totalNumber: "text-white",
      totalLabel: "text-amber-200",
      totalMeta: "text-gray-300",
    };
  }
  if (total <= 3) {
    return {
      title: "Light Damage",
      emoji: "😖🩹💢",
      sub: "Grazed but standing",
      container: "bg-emerald-50 border-emerald-200",
      pageBg: "bg-gradient-to-b from-emerald-950 via-slate-950 to-gray-950",
      headerBg: "bg-gradient-to-r from-emerald-950 via-gray-900 to-slate-950",
      accentText: "text-emerald-300",
      totalPanel: "bg-gradient-to-br from-emerald-950 via-slate-950 to-gray-950 text-gray-100 border-emerald-700",
      totalNumber: "text-white",
      totalLabel: "text-emerald-200",
      totalMeta: "text-gray-300",
    };
  }
  if (total <= 5) {
    return {
      title: "Major Damage",
      emoji: "🤕🦴💥",
      sub: "Chunks missing",
      container: "bg-amber-50 border-amber-200",
      pageBg: "bg-gradient-to-b from-amber-950 via-slate-950 to-gray-950",
      headerBg: "bg-gradient-to-r from-amber-950 via-gray-900 to-slate-950",
      accentText: "text-amber-300",
      totalPanel: "bg-gradient-to-br from-amber-950 via-slate-950 to-gray-950 text-gray-100 border-amber-700",
      totalNumber: "text-white",
      totalLabel: "text-amber-200",
      totalMeta: "text-gray-300",
    };
  }
  if (total <= 9) {
    return {
      title: "Critical Damage",
      emoji: "😵‍💫🩸⚠️",
      sub: "Barely alive",
      container: "bg-red-50 border-red-200",
      pageBg: "bg-gradient-to-b from-red-950 via-slate-950 to-gray-950",
      headerBg: "bg-gradient-to-r from-red-950 via-gray-900 to-slate-950",
      accentText: "text-red-300",
      totalPanel: "bg-gradient-to-br from-red-950 via-slate-950 to-gray-950 text-gray-100 border-red-700",
      totalNumber: "text-white",
      totalLabel: "text-red-200",
      totalMeta: "text-gray-300",
    };
  }
  return {
    title: "Lethal",
    emoji: "☠🕳️🌌️",
    sub: "Erased from reality",
    container: "bg-[#2a0b0f] border-[#5b1520]",
    pageBg: "bg-gradient-to-b from-[#2a0b0f] via-slate-950 to-gray-950",
    headerBg: "bg-gradient-to-r from-[#2a0b0f] via-gray-900 to-slate-950",
    accentText: "text-rose-300",
    totalPanel: "bg-gradient-to-br from-[#2a0b0f] via-slate-950 to-gray-950 text-gray-100 border-[#5b1520]",
    totalNumber: "text-white",
    totalLabel: "text-rose-200",
    totalMeta: "text-gray-300",
  };
}

/* =========================
   App
========================= */

/* =========================
   Roll helpers
========================= */
// rollDice — imported from calculatorUtils.js

/* =========================
   WizardOverlay
========================= */
function WizardOverlay({
  theme, onClose,
  // Weapon state (mandatory)
  attacksFixed, setAttacksFixed, attacksValue, setAttacksValue,
  attacksRolls, setAttacksRolls,
  toHit, setToHit, strength, setStrength, ap, setAp,
  damageFixed, setDamageFixed, damageValue, setDamageValue,
  // Target state (mandatory only)
  toughness, setToughness, armorSave, setArmorSave,
  // Dice
  hitRollsText, setHitRollsText,
  woundRollsText, setWoundRollsText,
  saveRollsText, setSaveRollsText,
  // Computed (for dice counts)
  computed, hitNeeded, woundNeeded, saveNeeded,
  // Needed for torrent display only
  torrent, fnp, fnpEnabled,
}) {
  const dark = theme === "dark";

  const overlay = dark
    ? "bg-gray-950 border-gray-700 text-gray-100"
    : "bg-white border-gray-300 text-gray-900";
  const section = dark ? "border-gray-700" : "border-gray-200";
  const sectionLabel = `text-xs font-bold uppercase tracking-widest mb-3 ${dark ? "text-amber-400" : "text-amber-600"}`;
  const input = dark
    ? "bg-gray-800 border-gray-500 text-white font-bold placeholder:text-gray-500 placeholder:font-normal"
    : "bg-white border-gray-400 text-gray-900 font-bold placeholder:text-gray-400 placeholder:font-normal";
  const btnPrimary = "bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold px-4 py-2 rounded-lg transition";

  const attackSpec = parseDiceSpec(attacksValue);
  const autoRollHits   = () => setHitRollsText(rollDice(hitNeeded, 6));
  const autoRollWounds = () => setWoundRollsText(rollDice(woundNeeded, 6));
  const autoRollSaves  = () => setSaveRollsText(rollDice(saveNeeded, 6));
  const autoRollAttacks = () => {
    if (!attacksFixed && attackSpec.n > 0)
      setAttacksRolls(rollDice(attackSpec.n, attackSpec.sides));
  };

  const fieldLabel = (text) => (
    <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>{text}</div>
  );
  const numField = (label, value, onChange, placeholder, hint) => (
    <div>
      {fieldLabel(label)}
      {hint && <div className={`text-xs mb-1 ${dark ? "text-gray-500" : "text-gray-400"}`}>{hint}</div>}
      <input
        type="text" inputMode="numeric"
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border p-2 text-base font-bold ${input}`}
      />
    </div>
  );
  const diceField = (label, value, onChange, needed, onRoll, info) => (
    <div>
      {fieldLabel(label)}
      {info && <div className={`text-xs mb-1 ${dark ? "text-gray-500" : "text-gray-400"}`}>{info}</div>}
      <div className="flex gap-2">
        <input
          type="text" value={value} onChange={e => onChange(e.target.value)}
          placeholder={needed > 0 ? `Enter ${needed} results…` : "—"}
          className={`flex-1 rounded-lg border p-2 text-base font-bold ${input}`}
        />
        <button onClick={onRoll} disabled={needed === 0}
          className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition"
          title="Roll for me">🎲</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Centered panel */}
      <div
        className={`pointer-events-auto relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${overlay}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between gap-3 px-4 py-3 border-b ${dark ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-gray-50"}`}>
          <div className="flex items-center gap-2">
            <span className="text-xl">🧙</span>
            <div className="font-extrabold text-base">Quick Wizard</div>
          </div>
          <button onClick={onClose}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold border transition ${dark ? "border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-300" : "border-gray-400 bg-gray-100 hover:bg-gray-200 text-gray-800"}`}>
            ✕ Close
          </button>
        </div>

        {/* Live damage banner */}
        {computed.totalPostFnp > 0 && (
          <div className={`mx-4 mt-3 rounded-xl border px-3 py-2 flex items-center justify-between ${dark ? "border-amber-700/40 bg-amber-900/20" : "border-amber-300 bg-amber-50"}`}>
            <span className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-amber-400" : "text-amber-600"}`}>Total damage</span>
            <span className="text-2xl font-black text-amber-400">{computed.totalPostFnp}</span>
          </div>
        )}

        {/* Scrollable body — all fields on one page */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">

          {/* ── WEAPON ── */}
          <div>
            <div className={sectionLabel}>⚔️ Weapon</div>
            <div className="space-y-3">

              {/* Attacks */}
              <div>
                {fieldLabel("Attacks")}
                <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer select-none">
                  <input type="checkbox" checked={attacksFixed} onChange={e => setAttacksFixed(e.target.checked)} className="h-4 w-4 accent-amber-400" />
                  <span>Fixed attacks</span>
                </label>
                {attacksFixed ? (
                  <input type="text" inputMode="numeric" value={attacksValue}
                    onChange={e => setAttacksValue(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="e.g. 6"
                    className={`w-full rounded-lg border p-2 text-base font-bold ${input}`} />
                ) : (
                  <div className="space-y-2">
                    <input value={attacksValue}
                      onChange={e => setAttacksValue(e.target.value.replace(/[^0-9dD+]/g, "").toUpperCase())}
                      placeholder="e.g. D6+1, 2D6, D3"
                      className={`w-full rounded-lg border p-2 text-base font-bold ${input}`} />
                    {attackSpec.n > 0 && (
                      <div className="flex gap-2">
                        <input value={attacksRolls} onChange={e => setAttacksRolls(e.target.value)}
                          placeholder={`Enter ${attackSpec.n} dice results…`}
                          className={`flex-1 rounded-lg border p-2 text-base font-bold ${input}`} />
                        <button onClick={autoRollAttacks} className={btnPrimary}>🎲 Roll</button>
                      </div>
                    )}
                    {attackSpec.mod > 0 && <div className={`text-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>+{attackSpec.mod} modifier added automatically</div>}
                  </div>
                )}
              </div>

              {numField("BS / WS (To Hit)", toHit, setToHit, "e.g. 4", "4 = 4+")}
              {numField("Strength", strength, setStrength, "e.g. 5")}

              {/* AP — always 0 or negative */}
              <div>
                {fieldLabel("AP")}
                <input type="text" inputMode="numeric" value={ap}
                  onChange={e => {
                    const raw = e.target.value;
                    if (raw === "" || raw === "-") { setAp(raw); return; }
                    const n = parseFloat(raw);
                    if (!isNaN(n)) setAp(String(Math.min(0, -Math.abs(n))));
                  }}
                  placeholder="e.g. -1  (always 0 or negative)"
                  className={`w-full rounded-lg border p-2 text-base font-bold ${input}`} />
              </div>

              {/* Damage */}
              <div>
                {fieldLabel("Damage")}
                <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer select-none">
                  <input type="checkbox" checked={damageFixed} onChange={e => setDamageFixed(e.target.checked)} className="h-4 w-4 accent-amber-400" />
                  <span>Fixed damage</span>
                </label>
                {damageFixed ? (
                  <input type="text" inputMode="numeric"
                    value={damageValue} onChange={e => setDamageValue(e.target.value)}
                    placeholder="e.g. 2"
                    className={`w-full rounded-lg border p-2 text-base font-bold ${input}`} />
                ) : (
                  <input
                    value={damageValue}
                    onChange={e => setDamageValue(e.target.value.replace(/[^0-9dD+]/g, "").toUpperCase())}
                    placeholder="e.g. D3, D6, D3+1"
                    className={`w-full rounded-lg border p-2 text-base font-bold ${input}`} />
                )}
              </div>
            </div>
          </div>

          {/* ── TARGET ── */}
          <div className={`border-t pt-5 ${section}`}>
            <div className={sectionLabel}>🛡️ Target</div>
            <div className="space-y-3">
              {numField("Toughness", toughness, setToughness, "e.g. 4")}
              {numField("Armor Save", armorSave, setArmorSave, "e.g. 3", "3 = 3+")}
              <div className={`text-xs ${dark ? "text-gray-600" : "text-gray-400"}`}>Invuln, FNP, cover & modifiers → main form</div>
            </div>
          </div>

          {/* ── DICE ── */}
          <div className={`border-t pt-5 ${section}`}>
            <div className={sectionLabel}>🎲 Dice</div>
            <div className="space-y-4">

              {/* Hit rolls */}
              {torrent ? (
                <div className={`rounded-xl border border-amber-500/40 bg-amber-900/20 p-3 text-sm`}>
                  ⚡ <strong>Torrent</strong> — {computed.A} attacks auto-hit. No hit dice needed.
                </div>
              ) : diceField(
                `Hit rolls (need ${hitNeeded})`,
                hitRollsText, setHitRollsText, hitNeeded, autoRollHits,
                toHit ? `To-hit: ${toHit}+` : null
              )}
              {computed.critHits > 0 && <div className="text-xs text-amber-400 -mt-2">✨ {computed.critHits} crit hit{computed.critHits !== 1 ? "s" : ""}</div>}

              {/* Wound rolls */}
              {diceField(
                `Wound rolls (need ${woundNeeded})`,
                woundRollsText, setWoundRollsText, woundNeeded, autoRollWounds,
                computed.needed ? `Wound target: ${computed.needed}+` : null
              )}
              {computed.critWounds > 0 && <div className="text-xs text-rose-400 -mt-2">💥 {computed.critWounds} crit wound{computed.critWounds !== 1 ? "s" : ""}</div>}
              {computed.mortalWoundAttacks > 0 && <div className="text-xs text-red-400 -mt-2">☠️ {computed.mortalWoundAttacks} mortal wound{computed.mortalWoundAttacks !== 1 ? "s" : ""} (skip saves)</div>}

              {/* Save rolls */}
              {diceField(
                `Save rolls (need ${saveNeeded})`,
                saveRollsText, setSaveRollsText, saveNeeded, autoRollSaves,
                computed.saveTarget ? `Save target: ${computed.saveTarget}+` : null
              )}
              {computed.failedSaves > 0 && <div className="text-xs text-red-400 -mt-2">❌ {computed.failedSaves} failed save{computed.failedSaves !== 1 ? "s" : ""}</div>}

          </div>

        </div>

        {/* Footer */}
        <div className={`px-4 py-3 border-t ${dark ? "border-gray-700" : "border-gray-200"}`}>
          <button onClick={onClose} className={`${btnPrimary} w-full`}>✅ Done</button>
        </div>
      </div>
    </div>
  );
}



export default function AttackCalculator() {

  // Theme (dark default, manual toggle)
  // ─────────────────────────────────────────
  // State — consolidated via useReducer
  // ─────────────────────────────────────────
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { weapon, target, dice, rerolls, ui, easter } = state;

  // ── Destructure slices for direct use ──
  const {
    attacksFixed, attacksValue, attacksRolls,
    toHit, strength, ap,
    damageFixed, damageValue, damageRolls,
    critHitThreshold, critWoundThreshold,
    rapidFire, rapidFireX, halfRange,
    torrent, lethalHits, sustainedHits, sustainedHitsN,
    devastatingWounds, precision,
    hitMod, woundMod,
  } = weapon;

  const {
    toughness, armorSave, invulnSave,
    fnpEnabled, fnp,
    inCover, ignoreAp,
    ignoreFirstFailedSave, minusOneDamage, halfDamage,
    saveMod,
    hasLeaderAttached, allocatePrecisionToLeader,
  } = target;

  const {
    hitRollsText, woundRollsText, saveRollsText, fnpRollsText,
    hitRerollRollsText, woundRerollRollsText,
  } = dice;

  const {
    rerollHitOnes, rerollHitFails,
    rerollWoundOnes, rerollWoundFails,
    twinLinked, showRerolls,
  } = rerolls;

  const {
    theme, showLog, showLimitations, showCheatSheet,
    showDiceRef, showWizard, strictMode, preserveHooks,
  } = ui;

  const {
    secretClicks, emperorToast, clearAllTapCount, lastClearAllTapMs,
  } = easter;

  // ── Split volley state ──
  const { targetB, diceB, split } = state;
  const {
    toughness: toughnessB, armorSave: armorSaveB, invulnSave: invulnSaveB,
    fnpEnabled: fnpEnabledB, fnp: fnpB,
    inCover: inCoverB, ignoreAp: ignoreApB,
    ignoreFirstFailedSave: ignoreFirstFailedSaveB,
    minusOneDamage: minusOneDamageB, halfDamage: halfDamageB,
    saveMod: saveModB,
  } = targetB;

  const {
    saveRollsText: saveRollsTextB,
    damageRolls: damageRollsB,
    fnpRollsText: fnpRollsTextB,
  } = diceB;

  const { enabled: splitEnabled, woundsToA } = split;

  // Target B shims
  const setToughnessB    = v => dispatch({ type: "SET_TARGET_B_FIELD", field: "toughness",    value: v });
  const setArmorSaveB    = v => dispatch({ type: "SET_TARGET_B_FIELD", field: "armorSave",    value: v });
  const setInvulnSaveB   = v => dispatch({ type: "SET_TARGET_B_FIELD", field: "invulnSave",   value: v });
  const setFnpEnabledB   = v => dispatch({ type: "SET_TARGET_B_FIELD", field: "fnpEnabled",   value: v });
  const setFnpB          = v => dispatch({ type: "SET_TARGET_B_FIELD", field: "fnp",          value: v });
  const setInCoverB      = v => dispatch({ type: "SET_TARGET_B_FIELD", field: "inCover",      value: v });
  const setIgnoreApB     = v => dispatch({ type: "SET_TARGET_B_FIELD", field: "ignoreAp",     value: v });
  const setIgnoreFirstFailedSaveB = v => dispatch({ type: "SET_TARGET_B_FIELD", field: "ignoreFirstFailedSave", value: v });
  const setMinusOneDamageB = v => dispatch({ type: "SET_TARGET_B_FIELD", field: "minusOneDamage", value: v });
  const setHalfDamageB   = v => dispatch({ type: "SET_TARGET_B_FIELD", field: "halfDamage",   value: v });
  const setSaveModB      = v => dispatch({ type: "SET_TARGET_B_FIELD", field: "saveMod",      value: v });

  // Dice B shims
  const setSaveRollsTextB = v => dispatch({ type: "SET_DICE_B_FIELD", field: "saveRollsText", value: v });
  const setDamageRollsB   = v => dispatch({ type: "SET_DICE_B_FIELD", field: "damageRolls",   value: v });
  const setFnpRollsTextB  = v => dispatch({ type: "SET_DICE_B_FIELD", field: "fnpRollsText",  value: v });

  // Split shims
  const toggleSplit   = () => dispatch({ type: "TOGGLE_SPLIT" });
  const setWoundsToA  = v => dispatch({ type: "SET_SPLIT_FIELD", field: "woundsToA", value: v });

  // ── Dispatch shims — same API as before, zero JSX changes needed ──
  // Weapon fields
  const setAttacksFixed  = v => dispatch({ type: "SET_WEAPON_FIELD", field: "attacksFixed",  value: v });
  const setAttacksValue  = v => dispatch({ type: "SET_WEAPON_FIELD", field: "attacksValue",  value: v });
  const setAttacksRolls  = v => dispatch({ type: "SET_WEAPON_FIELD", field: "attacksRolls",  value: v });
  const setToHit         = v => dispatch({ type: "SET_WEAPON_FIELD", field: "toHit",         value: v });
  const setStrength      = v => dispatch({ type: "SET_WEAPON_FIELD", field: "strength",      value: v });
  const setAp            = v => dispatch({ type: "SET_WEAPON_FIELD", field: "ap",            value: v });
  const setDamageFixed   = v => dispatch({ type: "SET_WEAPON_FIELD", field: "damageFixed",   value: v });
  const setDamageValue   = v => dispatch({ type: "SET_WEAPON_FIELD", field: "damageValue",   value: v });
  const setDamageRolls   = v => dispatch({ type: "SET_WEAPON_FIELD", field: "damageRolls",   value: v });
  const setCritHitThreshold   = v => dispatch({ type: "SET_WEAPON_FIELD", field: "critHitThreshold",   value: v });
  const setCritWoundThreshold = v => dispatch({ type: "SET_WEAPON_FIELD", field: "critWoundThreshold", value: v });
  const setRapidFire     = v => dispatch({ type: "SET_WEAPON_FIELD", field: "rapidFire",     value: v });
  const setRapidFireX    = v => dispatch({ type: "SET_WEAPON_FIELD", field: "rapidFireX",    value: v });
  const setHalfRange     = v => dispatch({ type: "SET_WEAPON_FIELD", field: "halfRange",     value: v });
  const setTorrent       = v => dispatch({ type: "SET_WEAPON_FIELD", field: "torrent",       value: v });
  const setLethalHits    = v => dispatch({ type: "SET_WEAPON_FIELD", field: "lethalHits",    value: v });
  const setSustainedHits = v => dispatch({ type: "SET_WEAPON_FIELD", field: "sustainedHits", value: v });
  const setSustainedHitsN= v => dispatch({ type: "SET_WEAPON_FIELD", field: "sustainedHitsN",value: v });
  const setDevastatingWounds = v => dispatch({ type: "SET_WEAPON_FIELD", field: "devastatingWounds", value: v });
  const setPrecision     = v => dispatch({ type: "SET_WEAPON_FIELD", field: "precision",     value: v });
  const setHitMod        = v => dispatch({ type: "SET_WEAPON_FIELD", field: "hitMod",        value: v });
  const setWoundMod      = v => dispatch({ type: "SET_WEAPON_FIELD", field: "woundMod",      value: v });

  // Target fields
  const setToughness     = v => dispatch({ type: "SET_TARGET_FIELD", field: "toughness",     value: v });
  const setArmorSave     = v => dispatch({ type: "SET_TARGET_FIELD", field: "armorSave",     value: v });
  const setInvulnSave    = v => dispatch({ type: "SET_TARGET_FIELD", field: "invulnSave",    value: v });
  const setFnpEnabled    = v => dispatch({ type: "SET_TARGET_FIELD", field: "fnpEnabled",    value: v });
  const setFnp           = v => dispatch({ type: "SET_TARGET_FIELD", field: "fnp",           value: v });
  const setInCover       = v => dispatch({ type: "SET_TARGET_FIELD", field: "inCover",       value: v });
  const setIgnoreAp      = v => dispatch({ type: "SET_TARGET_FIELD", field: "ignoreAp",      value: v });
  const setIgnoreFirstFailedSave = v => dispatch({ type: "SET_TARGET_FIELD", field: "ignoreFirstFailedSave", value: v });
  const setMinusOneDamage= v => dispatch({ type: "SET_TARGET_FIELD", field: "minusOneDamage",value: v });
  const setHalfDamage    = v => dispatch({ type: "SET_TARGET_FIELD", field: "halfDamage",    value: v });
  const setSaveMod       = v => dispatch({ type: "SET_TARGET_FIELD", field: "saveMod",       value: v });
  const setHasLeaderAttached         = v => dispatch({ type: "SET_TARGET_FIELD", field: "hasLeaderAttached",         value: v });
  const setAllocatePrecisionToLeader = v => dispatch({ type: "SET_TARGET_FIELD", field: "allocatePrecisionToLeader", value: v });

  // Dice fields
  const setHitRollsText        = v => dispatch({ type: "SET_DICE_FIELD", field: "hitRollsText",        value: v });
  const setWoundRollsText      = v => dispatch({ type: "SET_DICE_FIELD", field: "woundRollsText",      value: v });
  const setSaveRollsText       = v => dispatch({ type: "SET_DICE_FIELD", field: "saveRollsText",       value: v });
  const setFnpRollsText        = v => dispatch({ type: "SET_DICE_FIELD", field: "fnpRollsText",        value: v });
  const setHitRerollRollsText  = v => dispatch({ type: "SET_DICE_FIELD", field: "hitRerollRollsText",  value: v });
  const setWoundRerollRollsText= v => dispatch({ type: "SET_DICE_FIELD", field: "woundRerollRollsText",value: v });

  // Reroll fields
  const setRerollHitOnes   = v => dispatch({ type: "SET_REROLL_FIELD", field: "rerollHitOnes",   value: v });
  const setRerollHitFails  = v => dispatch({ type: "SET_REROLL_FIELD", field: "rerollHitFails",  value: v });
  const setRerollWoundOnes = v => dispatch({ type: "SET_REROLL_FIELD", field: "rerollWoundOnes", value: v });
  const setRerollWoundFails= v => dispatch({ type: "SET_REROLL_FIELD", field: "rerollWoundFails",value: v });
  const setTwinLinked      = v => dispatch({ type: "SET_REROLL_FIELD", field: "twinLinked",      value: v });
  const setShowRerolls     = v => dispatch({ type: "SET_REROLL_FIELD", field: "showRerolls",     value: v });

  // UI fields
  const setShowLog         = v => dispatch({ type: "SET_UI_FIELD", field: "showLog",         value: v });
  const setShowLimitations = v => dispatch({ type: "SET_UI_FIELD", field: "showLimitations", value: v });
  const setShowCheatSheet  = v => dispatch({ type: "SET_UI_FIELD", field: "showCheatSheet",  value: v });
  const setShowDiceRef     = v => dispatch({ type: "SET_UI_FIELD", field: "showDiceRef",     value: v });
  const setShowWizard      = v => dispatch({ type: "SET_UI_FIELD", field: "showWizard",      value: v });
  const setStrictMode      = v => dispatch({ type: "SET_UI_FIELD", field: "strictMode",      value: v });
  const setPreserveHooks   = v => dispatch({ type: "SET_UI_FIELD", field: "preserveHooks",   value: v });
  const toggleTheme        = () => dispatch({ type: "TOGGLE_THEME" });

  // Easter egg fields
  const setSecretClicks     = v => dispatch({ type: "SET_EASTER_FIELD", field: "secretClicks",     value: v });
  const setEmperorToast     = v => dispatch({ type: "SET_EASTER_FIELD", field: "emperorToast",     value: v });
  const setClearAllTapCount = v => dispatch({ type: "SET_EASTER_FIELD", field: "clearAllTapCount", value: v });
  const setLastClearAllTapMs= v => dispatch({ type: "SET_EASTER_FIELD", field: "lastClearAllTapMs",value: v });

  // ── Easter egg helpers ──
  const triggerEmperorToast = () => {
    setEmperorToast(true);
    window.setTimeout(() => setEmperorToast(false), 5000);
  };

  const handleClearAllEaster = () => {
    const now = Date.now();
    const within = now - lastClearAllTapMs <= 1200;
    const next = within ? clearAllTapCount + 1 : 1;
    setLastClearAllTapMs(now);
    setClearAllTapCount(next);
    if (next >= 5) {
      setClearAllTapCount(0);
      setLastClearAllTapMs(0);
      triggerEmperorToast();
    }
  };

  // ── Compound actions ──
  const clearDice   = () => dispatch({ type: "CLEAR_DICE" });
  const clearWeapon = () => dispatch({ type: "CLEAR_WEAPON" });
  const clearTarget = () => dispatch({ type: "CLEAR_TARGET" });
  const clearAll    = () => dispatch({ type: "CLEAR_ALL" });
  const loadExample = () => dispatch({ type: "LOAD_EXAMPLE" });


  // Transient animation state — declared early because displayComputed depends on it
  const [isRollingAll, setIsRollingAll] = useState(false);

  const computed = useCalculator({
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
  });

  // Freeze display during Roll All animation to prevent UI thrash
  const lastStableComputed = useRef(null);
  const displayComputed = isRollingAll
    ? (lastStableComputed.current || computed)
    : (() => { lastStableComputed.current = computed; return computed; })();

  // ── Split volley calculations ──
  // Wound pool from shared phase, allocated to each target
  const totalSavableWounds = displayComputed.savableWounds || 0;
  const totalMortalWounds = displayComputed.mortalWoundAttacks || 0;
  const woundsToANum = Math.min(totalSavableWounds, Math.max(0, parseInt(woundsToA) || 0));
  const woundsToBNum = Math.max(0, totalSavableWounds - woundsToANum);
  // Mortal wounds split proportionally (simplification: all go to A if not split)
  const mortalToA = splitEnabled ? totalMortalWounds : totalMortalWounds;
  const mortalToB = splitEnabled ? 0 : 0;

  const splitA = useCalculatorSplit({
    woundsAllocated: splitEnabled ? woundsToANum : totalSavableWounds,
    mortalWoundsAllocated: splitEnabled ? mortalToA : totalMortalWounds,
    armorSave, invulnSave, inCover, ignoreAp, saveMod,
    ignoreFirstFailedSave, minusOneDamage, halfDamage,
    fnp, fnpEnabled,
    ap, damageFixed, damageValue, devastatingWounds,
    saveRollsText, damageRolls, fnpRollsText,
    label: "A",
    enabled: true,
  });

  const splitB = useCalculatorSplit({
    woundsAllocated: woundsToBNum,
    mortalWoundsAllocated: mortalToB,
    armorSave: armorSaveB, invulnSave: invulnSaveB,
    inCover: inCoverB, ignoreAp: ignoreApB, saveMod: saveModB,
    ignoreFirstFailedSave: ignoreFirstFailedSaveB,
    minusOneDamage: minusOneDamageB, halfDamage: halfDamageB,
    fnp: fnpB, fnpEnabled: fnpEnabledB,
    ap, damageFixed, damageValue, devastatingWounds,
    saveRollsText: saveRollsTextB, damageRolls: damageRollsB, fnpRollsText: fnpRollsTextB,
    label: "B",
    enabled: splitEnabled,
  });

  // In split mode, override the main computed totals with splitA results
  const activeComputed = (splitEnabled && splitA) ? {
    ...displayComputed,
    saveTarget: splitA.saveTarget,
    failedSaves: splitA.failedSaves,
    failedSavesEffective: splitA.failedSavesEffective,
    normalDamage: splitA.normalDamage,
    mortalDamage: splitA.mortalDamage,
    totalPreFnp: splitA.totalPreFnp,
    ignored: splitA.ignored,
    totalPostFnp: splitA.totalPostFnp,
    errors: [...displayComputed.errors.filter(e => !e.includes("Save rolls") && !e.includes("Damage rolls") && !e.includes("FNP")), ...(splitA.errors || []), ...(splitB ? splitB.errors : [])],
    log: [...displayComputed.log, ...(splitA.log || []), ...(splitB ? splitB.log : [])],
  } : displayComputed;

  const easterEgg = (() => {
    const dmg = activeComputed.totalPostFnp;
    const effort = activeComputed.A; // attacks attempted (good proxy for "a lot of effort" in manual mode)

    if (dmg >= 9001) {
      return { title: "IT'S OVER 9000", emoji: "🐉⚡💥", note: null, style: "dbz" };
    }
    if (dmg < 0) {
      return { title: "Target miraculously heals", emoji: "✨💉🧬", note: "Joke: damage cannot heal in 10th edition." };
    }
    if (dmg === 0 && effort >= 10) {
      return { title: "All that… for nothing.", emoji: "🫠🙂", note: null };
    }
    return null;
  })();

  // Dice counters and inline error flags
  const hitEntered = parseDiceList(hitRollsText).length;
  const woundEntered = parseDiceList(woundRollsText).length;
  const saveEntered = parseDiceList(saveRollsText).length;
  const fnpEntered = parseDiceList(fnpRollsText).length;

  const hitNeeded = torrent ? 0 : activeComputed.A;
  const woundNeeded = activeComputed.woundRollPool;
  const saveNeeded = splitEnabled ? woundsToANum : (activeComputed.savableWounds || 0);
  const fnpNeeded = fnpEnabled && fnp !== "" ? activeComputed.totalPreFnp : 0;

  const hitRemaining = Math.max(0, hitNeeded - hitEntered);
  const woundRemaining = Math.max(0, woundNeeded - woundEntered);
  const saveRemaining = Math.max(0, saveNeeded - saveEntered);
  const fnpRemaining = Math.max(0, fnpNeeded - fnpEntered);


  // Reroll dice counters (render-safety; reroll eligibility math not yet wired)
  const hitRerollEntered = parseDiceList(hitRerollRollsText).length;
  const woundRerollEntered = parseDiceList(woundRerollRollsText).length;

  // Reroll eligibility is computed from the initial rolls in the memoized resolver.
  const hitRerollNeeded = activeComputed.hitRerollNeeded || 0;
  const woundRerollNeeded = activeComputed.woundRerollNeeded || 0;
  const hitRerollRemaining = Math.max(0, hitRerollNeeded - hitRerollEntered);
  const woundRerollRemaining = Math.max(0, woundRerollNeeded - woundRerollEntered);

  const hasHitRerollCountError = hitRerollEntered !== hitRerollNeeded;
  const hasWoundRerollCountError = woundRerollEntered !== woundRerollNeeded;

  const hasHitCountError = !torrent && hitEntered !== hitNeeded;
  const hasWoundCountError = woundEntered !== woundNeeded;
  const hasSaveCountError = saveEntered !== saveNeeded;
  const hasFnpCountError = fnpNeeded > 0 && fnpEntered !== fnpNeeded;

  const isNum = (v) => v !== "" && Number.isFinite(Number(v));

  const missingWeapon = [];
  if (attacksFixed) {
    if (!isNum(attacksValue)) missingWeapon.push("Attacks (fixed)");
  } else {
    if (parseDiceList(attacksRolls).length === 0) missingWeapon.push("Attacks rolls");
  }
  if (!isNum(toHit)) missingWeapon.push("To Hit");
  if (!isNum(strength)) missingWeapon.push("Strength");
  if (!isNum(ap)) missingWeapon.push("AP");
  if (damageFixed) {
    if (!isNum(damageValue)) missingWeapon.push("Damage");
  } else {
    if (!parseDiceSpec(damageValue).hasDie && damageValue.trim() === "") missingWeapon.push("Damage expression");
  }

  const missingTarget = [];
  if (!isNum(toughness)) missingTarget.push("Toughness");
  if (!isNum(armorSave)) missingTarget.push("Armor save");

  const statsReady = missingWeapon.length === 0 && missingTarget.length === 0;
  const diceReady =
    statsReady &&
    activeComputed.errors.length === 0 &&
    !hasHitCountError &&
    !hasWoundCountError &&
    !hasSaveCountError &&
    !hasFnpCountError;
  const status = !statsReady ? "Waiting for stats" : diceReady ? "Ready" : "Waiting for dice";

  const statusEmoji = status === "Ready" ? "✅⚔️" : status === "Waiting for dice" ? "⏳🎲" : "⛔🧩";

  const allowDamageTotals = !strictMode || diceReady;

  const shownTotalPostFnp = allowDamageTotals ? (activeComputed.totalPostFnp || 0) : 0;
  const shownTotalPreFnp  = allowDamageTotals ? (activeComputed.totalPreFnp  || 0) : 0;
  const shownNormalDamage = allowDamageTotals ? (activeComputed.normalDamage || 0) : 0;
  const shownMortalDamage = allowDamageTotals ? (activeComputed.mortalDamage || 0) : 0;
  const shownIgnoredTotal =
    allowDamageTotals ? ((activeComputed.ignored || 0) + (activeComputed.ignoredByRule || 0)) : 0;

  const viz = damageViz(shownTotalPostFnp);
  const ignoredTotal = shownIgnoredTotal;

  const dmgTotalNum = Number(shownTotalPostFnp || 0);
  const dmgTierBorder =
    dmgTotalNum >= 15
      ? "border-fuchsia-400/40"
      : dmgTotalNum >= 10
        ? "border-rose-400/40"
        : dmgTotalNum >= 6
          ? "border-amber-400/35"
          : dmgTotalNum >= 3
            ? "border-sky-400/35"
            : "border-emerald-400/35";
  const dmgSubWrapClass =
    theme === "dark"
      ? `bg-slate-950/40 border ${dmgTierBorder} text-gray-100`
      : `${viz.container}`;
  const dmgSubTileClass =
    theme === "dark" ? "bg-white/5 border-white/10" : "bg-white/70 border-gray-200";
  const dmgSubLabelClass = theme === "dark" ? "text-gray-300" : "text-gray-600";

  const rawDmgStr = String(activeComputed.totalPostFnp ?? "");
  const expandScientific = (s) => {
    // Expands simple positive scientific notation like "1.23e+6" into "1230000"
    // Intended for comedic large-number display. Does not change math.
    const m = /^([0-9]+)(?:\.([0-9]+))?e\+([0-9]+)$/i.exec(s.trim());
    if (!m) return s;
    const intPart = m[1];
    const fracPart = m[2] || "";
    const exp = parseInt(m[3], 10);
    const digits = intPart + fracPart;
    const fracLen = fracPart.length;
    const zeros = exp - fracLen;
    if (zeros >= 0) return digits + "0".repeat(Math.min(zeros, 5000));
    const cut = digits.length + zeros;
    if (cut <= 0) return "0." + "0".repeat(Math.abs(cut)) + digits;
    return digits.slice(0, cut) + "." + digits.slice(cut);
  };

  const dmgStr = expandScientific(rawDmgStr);
  const dmgLen = dmgStr.length;
  const dmgSizeClass =
    dmgLen > 80
      ? "text-xl md:text-2xl"
      : dmgLen > 40
      ? "text-2xl md:text-3xl"
      : dmgLen > 24
      ? "text-4xl md:text-5xl"
      : "text-7xl md:text-8xl";

  const isSoftTotal = !diceReady && !strictMode;
  const isStrictLocked = strictMode && !diceReady;
  const totalLabelText = isStrictLocked ? "Total Damage (LOCKED)" : isSoftTotal ? "Potential Damage (SOFT TOTAL)" : "Total Damage";
  const softNote = isStrictLocked ? "STRICT MODE: totals locked until Ready" : isSoftTotal ? (!statsReady ? "SOFT TOTAL: missing stats" : "SOFT TOTAL: missing dice") : null;

  const cheatSheet = [
    {
      name: "Rapid Fire X",
      what: "At half range, the weapon makes additional attacks (X).",
      how: "When Rapid Fire is enabled, and the target is within half range, +X attacks are added to A before hit dice are entered.",
      notes: "This is a direct implementation of Rapid Fire increasing the weapon’s Attacks characteristic at half range.",
    },
    {
      name: "Heavy",
      what: "If the unit Remained Stationary, the weapon gets +1 to Hit.",
      how: "Not implemented in this build unless you have a separate toggle. This entry is informational only.",
    },
    {
      name: "Indirect Fire",
      what: "Attacks can target units not visible, usually with penalties and granting Cover.",
      how: "Not implemented in this build unless you have a separate toggle. This entry is informational only.",
    },
    {
      name: "Twin-linked",
      what: "Reroll failed wound rolls for this weapon.",
      how: "When enabled, the tool locks 'Reroll failed wounds' ON in the Rerolls panel.",
    },
    {
      name: "Lethal Hits",
      what: "Critical hits automatically wound.",
      how: "Each critical hit adds 1 auto-wound and reduces the wound-roll pool by 1.",
    },
    {
      name: "Sustained Hits X",
      what: "Critical hits score X additional hits.",
      how: "Each critical hit adds X extra hits into the wound-roll pool. Extra hits are not critical hits.",
    },
    {
      name: "Devastating Wounds",
      what: "Critical wounds become mortal wounds that skip saves.",
      how: "Critical wounds (from wound rolls) convert into mortal-wound attacks. The remaining wounds are saved normally.",
    },
    {
      name: "Cover",
      what: "Improves the target's armor save.",
      how: "Treated as +1 to the armor save (i.e., armor save improves by 1).",
      notes: "This is a simplified toggle and does not model terrain conditions.",
    },
    {
      name: "Ignore AP",
      what: "Treats AP as 0 for the save calculation.",
      how: "When enabled, AP is ignored when computing the save target.",
    },
    {
      name: "Rerolls (Hit/Wound)",
      what: "Allows rerolling certain hit or wound dice.",
      how: "Enable in the Rerolls panel: reroll 1s or reroll all fails for hits and wounds. Twin-linked locks reroll failed wounds ON. The tool determines eligible dice from initial rolls and prompts for the exact reroll count.",
      notes: "Reroll dice are entered separately in Manual dice entry after the initial rolls.",
    },
    {
      name: "Precision",
      what: "Allows attacks to be allocated to a Leader when attached to a unit.",
      how: "This tool provides an advisory hook only. It does not fully allocate damage to models.",
    },
    {
      name: "Ignore first failed save",
      what: "Negates one failed save.",
      how: "After rolling saves, one failed save is removed before damage is applied.",
    },
    {
      name: "-1 Damage / Half Damage",
      what: "Reduces damage from each failed save instance.",
      how: "Ordering used: half (round up), then -1 (min 1).",
      notes: "Some datasheets specify different ordering; treat as a limitation if so.",
    },
  ];




  const statusClass =
    status === "Ready"
      ? (theme === "dark"
          ? "border-green-600 bg-green-900/30 text-green-200"
          : "border-green-300 bg-green-50 text-green-900")
      : status === "Waiting for dice"
        ? (theme === "dark"
            ? "border-amber-600 bg-amber-900/30 text-amber-200"
            : "border-amber-300 bg-amber-50 text-amber-900")
        : (theme === "dark"
            ? "border-red-600 bg-red-900/30 text-red-200"
            : "border-red-300 bg-red-50 text-red-900");

  const mainToggleBtnClass = theme === "dark"
  ? "px-3 py-2 rounded-lg border border-gray-700 bg-gray-900/40 text-sm font-semibold text-gray-100 hover:bg-gray-900/60 hover:border-gray-500 transition"
  : "px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-900 hover:bg-gray-50 hover:border-gray-400 transition";
const ctlBtnClass = "rounded-lg bg-gray-900 text-gray-100 px-3 py-2 text-sm font-semibold border border-gray-700 hover:bg-gray-800";

  // ── Roll All ──
  const rollAll = async () => {
    if (isRollingAll || !statsReady) return;
    setIsRollingAll(true);

    const attackSpecNow = parseDiceSpec(attacksValue);
    const toHitNum = Number(toHit);
    const strengthNum = Number(strength);
    const toughnessNum = Number(toughness);
    const armorSaveNum = Number(armorSave);
    const apNum = Number(ap) || 0;
    const critHitT = Number(critHitThreshold) || 6;
    const critWoundT = Number(critWoundThreshold) || 6;
    const woundTarget = strengthNum >= toughnessNum * 2 ? 2 : strengthNum > toughnessNum ? 3 : strengthNum === toughnessNum ? 4 : strengthNum * 2 <= toughnessNum ? 6 : 5;
    const rawSave = armorSaveNum - apNum - (inCover ? 1 : 0);
    const saveTarget = Math.min(7, Math.max(2, ignoreAp ? armorSaveNum : rawSave));

    // Use flushSync to force React to render each animation tick synchronously.
    // Without this, React 18 batches all dispatch calls in async functions and
    // only renders the final value — killing the slot-machine animation.
    const { flushSync } = await import("react-dom");

    const animateField = (setter, finalRolls, sides) => new Promise(resolve => {
      if (finalRolls.length === 0) { resolve(); return; }
      let step = 0;
      const ticker = setInterval(() => {
        flushSync(() => {
          setter(Array.from({ length: finalRolls.length }, () => Math.ceil(Math.random() * sides)).join(" "));
        });
        if (++step >= 10) { clearInterval(ticker); flushSync(() => setter(finalRolls.join(" "))); resolve(); }
      }, 60);
    });
    const pause = (ms) => new Promise(r => setTimeout(r, ms));

    // Phase 1: Attacks
    let attacksTotal = attacksFixed ? (Number(attacksValue) || 0) : 0;
    if (!attacksFixed && attackSpecNow.n > 0) {
      const rolls = Array.from({ length: attackSpecNow.n }, () => Math.ceil(Math.random() * attackSpecNow.sides));
      await animateField(setAttacksRolls, rolls, attackSpecNow.sides);
      attacksTotal = rolls.reduce((s, d) => s + d, 0) + attackSpecNow.mod;
      await pause(120);
    }
    if (attacksTotal <= 0) { setIsRollingAll(false); return; }

    // Phase 2: Hits
    let hitRollsFinal = [];
    let normalHits = 0, lethalAutoWounds = 0, sustainedExtra = 0;
    if (!torrent) {
      hitRollsFinal = Array.from({ length: attacksTotal }, () => Math.ceil(Math.random() * 6));
      await animateField(setHitRollsText, hitRollsFinal, 6);
      if (rerollHitOnes || rerollHitFails) {
        const eligible = hitRollsFinal.filter(d => rerollHitOnes ? d === 1 : d < toHitNum);
        if (eligible.length > 0) {
          const rr = Array.from({ length: eligible.length }, () => Math.ceil(Math.random() * 6));
          await pause(80); await animateField(setHitRerollRollsText, rr, 6);
          let ri = 0;
          hitRollsFinal = hitRollsFinal.map(d => ((rerollHitOnes && d === 1) || (rerollHitFails && d < toHitNum)) ? (rr[ri++] ?? d) : d);
        }
      }
      for (const d of hitRollsFinal) {
        if (d >= critHitT) {
          if (sustainedHits) sustainedExtra += Number(sustainedHitsN) || 1;
          if (lethalHits) lethalAutoWounds++; else normalHits++;
        } else if (d >= toHitNum) normalHits++;
      }
      normalHits += sustainedExtra;
    } else {
      normalHits = attacksTotal;
    }
    await pause(120);

    // Phase 3: Wounds
    let woundRollsFinal = [];
    let totalWounds = lethalAutoWounds, mortalWoundAttacks = 0;
    if (normalHits > 0) {
      woundRollsFinal = Array.from({ length: normalHits }, () => Math.ceil(Math.random() * 6));
      await animateField(setWoundRollsText, woundRollsFinal, 6);
      if (twinLinked || rerollWoundOnes || rerollWoundFails) {
        const eligible = woundRollsFinal.filter(d => (twinLinked || rerollWoundOnes) ? d === 1 : d < woundTarget);
        if (eligible.length > 0) {
          const rr = Array.from({ length: eligible.length }, () => Math.ceil(Math.random() * 6));
          await pause(80); await animateField(setWoundRerollRollsText, rr, 6);
          let ri = 0;
          woundRollsFinal = woundRollsFinal.map(d => ((twinLinked || rerollWoundOnes) && d === 1) || (rerollWoundFails && d < woundTarget) ? (rr[ri++] ?? d) : d);
        }
      }
      for (const d of woundRollsFinal) {
        if (d >= critWoundT) { if (devastatingWounds) mortalWoundAttacks++; else totalWounds++; }
        else if (d >= woundTarget) totalWounds++;
      }
    }
    await pause(120);

    // Phase 4: Saves
    let saveRollsFinal = [];
    let failedSaves = 0;
    if (totalWounds > 0) {
      saveRollsFinal = Array.from({ length: totalWounds }, () => Math.ceil(Math.random() * 6));
      await animateField(setSaveRollsText, saveRollsFinal, 6);
      failedSaves = saveRollsFinal.filter(d => d < saveTarget).length;
    }
    await pause(120);

    const failedEffective = Math.max(0, failedSaves - (ignoreFirstFailedSave ? 1 : 0));

    // Phase 5: Variable damage
    const dmgSpec = parseDiceSpec(damageValue);
    let totalDmg = 0;
    if (!damageFixed && dmgSpec.hasDie) {
      const totalDmgDice = failedEffective + mortalWoundAttacks;
      if (totalDmgDice > 0) {
        const rolls = Array.from({ length: totalDmgDice }, () => Math.ceil(Math.random() * dmgSpec.sides));
        await animateField(setDamageRolls, rolls, dmgSpec.sides);
        totalDmg = rolls.reduce((s, d) => s + d + dmgSpec.mod, 0);
        await pause(120);
      }
    } else if (damageFixed) {
      const d = Number(damageValue) || 0;
      totalDmg = (failedEffective + mortalWoundAttacks) * d;
    }

    // Phase 6: FNP
    if (fnpEnabled && fnp !== "" && totalDmg > 0) {
      const fnpRolls = Array.from({ length: totalDmg }, () => Math.ceil(Math.random() * 6));
      await animateField(setFnpRollsText, fnpRolls, 6);
    }

    setIsRollingAll(false);
  };

  return (
    <div className={`min-h-screen ${viz.pageBg || "bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950"} p-4 relative overflow-hidden`}>
      {/* Animated page-wide emoji backdrop synced to total damage tier */}
      <div className="pointer-events-none absolute inset-0 opacity-20 mix-blend-screen">
        {diceReady ? (
          <div className="absolute inset-0">
            <div className="nape-marquee">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={i % 2 ? "nape-marquee-row nape-marquee-reverse" : "nape-marquee-row"}
                >
                  {Array.from({ length: 24 }).map((__, j) => (
                    <span key={j} className="mr-3">{viz.emoji}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="relative z-10">

      {emperorToast ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-6 pointer-events-none">
          <div className="pointer-events-none mt-6 max-w-2xl w-full rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 shadow-2xl p-6 text-center">
            <div className="text-3xl md:text-5xl font-black text-gray-900">THE EMPEROR PROTECTS</div>
            <div className="mt-2 text-4xl md:text-6xl">👑⚔️✨</div>
          </div>
        </div>
      ) : null}



              <div className="max-w-screen-2xl mx-auto space-y-4 px-2 overflow-visible">
          <div className={`rounded-2xl ${viz.headerBg} shadow p-4 border border-gray-700 text-gray-100`}>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-stretch">
              <div className="min-w-0">
                <div className="flex items-center gap-3 min-w-0 self-start">
  <img
    src="/favicon-256.png"
    alt="NAPE"
    className="h-16 w-16 md:h-20 md:w-20 rounded-xl border border-gray-700 bg-gray-900/40 p-1 shrink-0"
  />
  <div className="text-3xl md:text-4xl font-extrabold tracking-wide leading-tight">
    {APP_NAME}
  </div>
</div>
                <div className="text-2xl md:text-3xl font-extrabold tracking-wide leading-tight mt-0.5">
                  10th Edition
                </div>
              <div className={`text-sm uppercase tracking-widest ${viz.accentText} mt-1`}>Manual dice, rules-accurate sequencing</div>
                            <div className="mt-2">
                <div className="text-sm text-gray-200 font-semibold">Table use</div>
                <ul className="mt-1 text-xs text-gray-200 list-disc pl-5 space-y-1">
                  <li>Enter Weapon stats → Target stats → then dice (dice entry is last).</li>
                  <li>If Attacks is random (e.g. D6, 2D6, D6+1), enter the expression in the Attacks field. Roll your attack dice and enter the rolled values in “Attack rolls” — any +N modifier is added automatically.</li>
                  <li>Then roll Hit dice, then Wound dice, then Save dice, then FNP dice (if applicable).</li>
                  <li>Wound-roll pool auto-adjusts for Lethal Hits and Sustained Hits.</li>
                </ul>
              </div>
            </div>

              {/* Status (centered between title and controls) */}
              <div className="flex flex-col justify-center">
                <div className={`w-full inline-flex items-center justify-center gap-3 rounded-2xl border px-6 py-4 text-xl ${statusClass}`}>
                <span className="text-3xl leading-none">{statusEmoji}</span>
                <span className="font-extrabold tracking-wide">{status}</span>
              </div>
              {!statsReady ? (
                <div className="mt-2 text-sm text-gray-200">
                  <span className="opacity-90">Missing:</span> {[...missingWeapon, ...missingTarget].join(", ")}
                </div>
              ) : status === "Waiting for dice" ? (
                <div className="mt-2 text-sm text-gray-200">
                  <span className="opacity-90">Finish dice:</span> Hit {hitRemaining}, Wound {woundRemaining}, Save {saveRemaining}
                  {fnpNeeded > 0 ? `, FNP ${fnpRemaining}` : ""}
                </div>
              ) : null}
            </div>

            </div>

            {/* Header action buttons */}
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-gray-950 px-4 py-2 text-sm font-extrabold border border-amber-400/40 transition flex items-center gap-2"
                onClick={() => setShowWizard(true)}
              >
                🧙 Quick Wizard
              </button>
              <button
                type="button"
                className="rounded-lg bg-gray-900 text-gray-100 px-4 py-2 text-sm font-semibold border border-gray-700 hover:bg-gray-800 transition"
                onClick={() => setShowDiceRef(true)}
                title="Opens the dice sequencing reference."
              >
                🎲 Dice reference
              </button>
            </div>

        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-visible">
          {/* LEFT: Inputs */}
          <div className="lg:col-span-6 space-y-4">
            <Section theme={theme} title="Weapon">
              <Field
                label="Attacks"
                hint="Fixed: enter A. Random: uncheck Fixed, enter a dice expression (e.g. D6+1, 2D6, D3+2), then enter the rolled dice in Manual dice entry → Attack rolls. The +N modifier is added automatically."
              >
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-200 md:min-w-[160px]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-amber-400"
                      checked={attacksFixed}
                      onChange={(e) => setAttacksFixed(e.target.checked)}
                    />
                    <span className="font-semibold">Fixed attacks</span>
                  </label>

                  <input
                    value={attacksValue}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (attacksFixed) {
                        // Fixed: integers only
                        setAttacksValue(raw.replace(/[^0-9]/g, ""));
                      } else {
                        // Random: allow dice expressions like D6+1, 2D6, 2D3+2
                        setAttacksValue(raw.replace(/[^0-9dD+]/g, "").toUpperCase());
                      }
                    }}
                    inputMode="text"
                    placeholder={attacksFixed ? "e.g. 6" : "e.g. D6+1, 2D6, D3+2"}
                    className={`flex-1 rounded border p-2 text-lg font-semibold ${!isNum(attacksValue) ? "border-red-500 ring-2 ring-red-200" : ""}`}
                  />
                </div>

                <div className="mt-1 text-xs text-gray-300">
                  Computed attacks this volley: <span className="font-semibold">{activeComputed.A}</span>
                  {!attacksFixed && parseDiceSpec(attacksValue).mod > 0 ? (
                    <span className="ml-2 text-gray-400">(dice sum + {parseDiceSpec(attacksValue).mod} modifier)</span>
                  ) : null}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="BS/WS" hint="Target number needed to hit. 4 means 4+.">
                  <input className={`w-full rounded border p-2 text-lg font-semibold ${!isNum(toHit) ? "border-red-500 ring-2 ring-red-200" : ""}`} type="number" value={toHit} onChange={(e) => setToHit(e.target.value)} placeholder="required" />
                </Field>
                <Field label="Strength" hint="Weapon Strength characteristic.">
                  <input className={`w-full rounded border p-2 text-lg font-semibold ${!isNum(strength) ? "border-red-500 ring-2 ring-red-200" : ""}`} type="number" value={strength} onChange={(e) => setStrength(e.target.value)} placeholder="required" />
                </Field>
                <Field label="AP" hint="Always 0 or negative (e.g. -1, -2). Enter the number and it will auto-negate.">
                  <input
                    className={`w-full rounded border p-2 text-lg font-semibold ${!isNum(ap) ? "border-red-500 ring-2 ring-red-200" : ""}`}
                    type="number"
                    value={ap}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "" || raw === "-") { setAp(raw); return; }
                      const n = parseFloat(raw);
                      if (!isNaN(n)) setAp(String(Math.min(0, -Math.abs(n))));
                    }}
                    placeholder="e.g. -1"
                  />
                </Field>

                <Field label="Damage" hint="Fixed: enter a number. Variable: enter a dice expression (e.g. D3, D6, D3+1), then roll one die per failed save and enter results.">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={damageFixed} onChange={(e) => setDamageFixed(e.target.checked)} />
                        Fixed
                      </label>
                      {damageFixed ? (
                        <input className={`flex-1 rounded border p-2 text-lg font-semibold ${damageFixed && !isNum(damageValue) ? "border-red-500 ring-2 ring-red-200" : ""}`} type="number" value={damageValue} onChange={(e) => setDamageValue(e.target.value)} placeholder="required" />
                      ) : (
                        <input
                          className={`flex-1 rounded border p-2 text-lg font-semibold`}
                          placeholder="e.g. D3, D6, D3+1"
                          value={damageValue}
                          onChange={(e) => setDamageValue(e.target.value.replace(/[^0-9dD+]/g, "").toUpperCase())}
                        />
                      )}
                    </div>
                    {!damageFixed && (
                      <div className="flex gap-2">
                        <input
                          className={`flex-1 rounded border p-2 text-lg font-semibold ${!damageFixed && damageRolls.trim() === "" ? "border-red-500 ring-2 ring-red-200" : ""}`}
                          placeholder={`Roll 1 die per failed save${parseDiceSpec(damageValue).hasDie ? ` (${damageValue})` : ""}`}
                          value={damageRolls}
                          onChange={(e) => setDamageRolls(e.target.value)}
                        />
                        <button
                          type="button"
                          title="Roll damage dice"
                          disabled={!parseDiceSpec(damageValue).hasDie || saveNeeded === 0}
                          onClick={() => {
                            const sp = parseDiceSpec(damageValue);
                            if (sp.hasDie) setDamageRolls(rollDice(saveNeeded, sp.sides));
                          }}
                          className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition"
                        >🎲</button>
                      </div>
                    )}
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <Field label="Critical Hit threshold" hint="Default 6. If crit hits 5+, set 5.">
                  <input className="w-full rounded border p-2 text-lg font-semibold" type="number" value={critHitThreshold} onChange={(e) => setCritHitThreshold(e.target.value)} />
                </Field>
                <Field label="Critical Wound threshold" hint="Default 6. Anti-X may make 5+ or 4+.">
                  <input className="w-full rounded border p-2 text-lg font-semibold" type="number" value={critWoundThreshold} onChange={(e) => setCritWoundThreshold(e.target.value)} />
                </Field>
              </div>

              <Field label="Keywords / Effects" hint="Enable only what is active for the current weapon/turn.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-2 gap-y-2 text-sm items-start">

                  <div className="flex flex-wrap items-center gap-2 self-start min-h-[40px]">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={rapidFire}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setRapidFire(on);
                          if (!on) setHalfRange(false);
                        }}
                      />
                      <span className="font-semibold">Rapid Fire</span>
                    </label>
                    <span className="text-xs text-gray-300">X:</span>
                    <input
                      className="w-16 rounded border p-2 text-sm"
                      type="number"
                      min={0}
                      value={rapidFireX}
                      onChange={(e) => setRapidFireX(e.target.value)}
                      disabled={!rapidFire}
                      title="Rapid Fire X: if the target is within half range, add X attacks to A before rolling hits."
                    />
                    <label className={`flex items-center gap-2 ${!rapidFire || Number(rapidFireX || 0) <= 0 ? "opacity-50" : ""}`}>
                      <input
                        type="checkbox"
                        checked={halfRange}
                        disabled={!rapidFire || Number(rapidFireX || 0) <= 0}
                        onChange={(e) => setHalfRange(e.target.checked)}
                      />
                      <span className="font-semibold">Half range</span>
                    </label>
                  </div>


                  <label className="flex items-center gap-2 min-h-[40px]">
                    <input type="checkbox" checked={torrent} onChange={(e) => setTorrent(e.target.checked)} />
                    <span className="font-semibold">TORRENT</span>
                    <span className="text-xs text-gray-300">(auto-hit)</span>
                  </label>

                  <label className="flex items-center gap-2 min-h-[40px]">
                    <input type="checkbox" checked={lethalHits} onChange={(e) => setLethalHits(e.target.checked)} />
                    <span className="font-semibold">Lethal Hits</span>
                    <span className="text-xs text-gray-300">(crit hit auto-wounds)</span>
                  </label>

                  <div className="flex items-center gap-2 self-start min-h-[40px]">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={sustainedHits} onChange={(e) => setSustainedHits(e.target.checked)} />
                      <span className="font-semibold">Sustained Hits</span>
                    </label>
                    <span className="text-xs text-gray-300">X:</span>
                    <input
                      className="w-16 rounded border p-2 text-sm"
                      type="number"
                      min={1}
                      value={sustainedHitsN}
                      onChange={(e) => setSustainedHitsN(e.target.value)}
                      disabled={!sustainedHits}
                      title="Sustained Hits X: each critical hit adds X extra hits. Extra hits are not critical hits."
                    />
                  </div>

                  <label className="flex items-center gap-2 min-h-[40px]">
                    <input type="checkbox" checked={devastatingWounds} onChange={(e) => setDevastatingWounds(e.target.checked)} />
                    <span className="font-semibold">Devastating Wounds</span>
                    <span className="text-xs text-gray-300">(crit wound becomes mortals)</span>
                  </label>

                  <label className="flex items-center gap-2 min-h-[40px]">
                    <input
                      type="checkbox"
                      checked={twinLinked}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setTwinLinked(next);
                        if (next) setRerollWoundFails(true);
                      }}
                      title="Twin-linked: reroll failed wound rolls for this weapon."
                    />
                    <span className="font-semibold">Twin-linked</span>
                    <span className="text-xs text-gray-300">(reroll failed wounds)</span>
                  </label>

                  <label className="flex items-center gap-2 min-h-[40px]">
                    <input type="checkbox" checked={precision} onChange={(e) => setPrecision(e.target.checked)} />
                    <span className="font-semibold">Precision</span>
                    <span className="text-xs text-gray-300">(leader allocation hook)</span>
                  </label>
                </div>
              </Field>
              <div className="mt-3 rounded-xl border border-gray-700/60 bg-slate-950/20 p-3">
                <div className="flex items-center justify-between gap-3 self-start">
                  <div className="flex items-center gap-2 min-w-0 self-start">
                    <div className="text-base font-extrabold">Rerolls</div>
                    <div className="inline-flex items-center text-xs font-semibold text-amber-200 bg-amber-900/40 border border-amber-700/50 rounded-full px-2 py-0.5">EXPERIMENTAL</div>
                  </div>
                  <button
                    type="button"
                    className={mainToggleBtnClass}
                    onClick={() => setShowRerolls(!showRerolls)}
                  >
                    {showRerolls ? "Hide" : "Show"}
                  </button>
                </div>
{showRerolls ? (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={rerollHitOnes} onChange={(e) => setRerollHitOnes(e.target.checked)} />
                      Reroll hit rolls of 1
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={rerollHitFails} onChange={(e) => setRerollHitFails(e.target.checked)} />
                      Reroll failed hits
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={rerollWoundOnes}
                        onChange={(e) => setRerollWoundOnes(e.target.checked)}
                      />
                      Reroll wound rolls of 1
                    </label>

                    <label className={`flex items-center gap-2 ${twinLinked ? "opacity-75" : ""}`}>
                      <input
                        type="checkbox"
                        checked={rerollWoundFails || twinLinked}
                        disabled={twinLinked}
                        onChange={(e) => setRerollWoundFails(e.target.checked)}
                      />
                      Reroll failed wounds {twinLinked ? <span className="text-xs text-gray-600">(enabled by Twin-linked)</span> : null}
                    </label>
                  </div>
                ) : null}
              </div>

            </Section>

            <Section theme={theme} title="Target">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className={`text-xs font-semibold mb-1 ${!isNum(toughness) ? "text-red-400" : ""}`}>Toughness *</div>
                  <input type="text" inputMode="numeric" value={toughness} onChange={e => setToughness(e.target.value)}
                    placeholder="required"
                    className={`w-full rounded border p-2 font-bold text-lg ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"} ${!isNum(toughness) ? "border-red-500 ring-2 ring-red-200" : ""}`} />
                </div>
                <div>
                  <div className={`text-xs font-semibold mb-1 ${!isNum(armorSave) ? "text-red-400" : ""}`}>Armour Save *</div>
                  <input type="text" inputMode="numeric" value={armorSave} onChange={e => setArmorSave(e.target.value)}
                    placeholder="required"
                    className={`w-full rounded border p-2 font-bold text-lg ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"} ${!isNum(armorSave) ? "border-red-500 ring-2 ring-red-200" : ""}`} />
                </div>
                <div>
                  <div className="text-xs font-semibold mb-1">Invuln Save</div>
                  <input type="text" inputMode="numeric" value={invulnSave} onChange={e => setInvulnSave(e.target.value)}
                    placeholder="e.g. 4"
                    className={`w-full rounded border p-2 font-bold text-lg ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"}`} />
                </div>
                <div>
                  <div className="text-xs font-semibold mb-1">FNP</div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={fnpEnabled} className="h-4 w-4 accent-amber-400"
                      onChange={e => { const on = e.target.checked; setFnpEnabled(on); if (!on) { setFnp(""); setFnpRollsText(""); } }} />
                    <input type="text" inputMode="numeric" value={fnp} onChange={e => setFnp(e.target.value)}
                      disabled={!fnpEnabled} placeholder="e.g. 5"
                      className={`flex-1 rounded border p-2 font-bold text-lg disabled:opacity-40 ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"}`} />
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={inCover} onChange={e => setInCover(e.target.checked)} className="accent-amber-400" /> Cover (+1 sv)</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={ignoreAp} onChange={e => setIgnoreAp(e.target.checked)} className="accent-amber-400" /> Ignore AP</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={ignoreFirstFailedSave} onChange={e => setIgnoreFirstFailedSave(e.target.checked)} className="accent-amber-400" /> Ignore 1st failed save</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={minusOneDamage} onChange={e => setMinusOneDamage(e.target.checked)} className="accent-amber-400" /> -1 Damage</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={halfDamage} onChange={e => setHalfDamage(e.target.checked)} className="accent-amber-400" /> Half Damage</label>
              </div>
            </Section>

            {/* ── Split Volley Toggle ── */}
            <div className={`rounded-2xl p-4 border ${theme === "dark" ? "bg-slate-900 border-gray-700" : "bg-white border-gray-200"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-extrabold text-lg">Split Volley</div>
                  <div className={`text-xs mt-0.5 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                    Split wounds across two targets after the wound phase. Rules-accurate: one weapon, two targets.
                  </div>
                </div>
                <button type="button" onClick={toggleSplit}
                  className={`rounded-lg px-4 py-2 text-sm font-extrabold border transition ${splitEnabled ? "bg-gradient-to-r from-amber-500 to-orange-500 border-amber-400/40 text-gray-950" : theme === "dark" ? "bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700" : "bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200"}`}>
                  {splitEnabled ? "⚔️ Split ON" : "Split OFF"}
                </button>
              </div>

              {splitEnabled && (
                <div className="mt-4 space-y-4">
                  {/* Wound allocation */}
                  <div className={`rounded-xl p-3 border ${theme === "dark" ? "bg-gray-900/60 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                    <div className="text-sm font-semibold mb-2">Wound allocation</div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🎯 Target A:</span>
                        <input type="text" inputMode="numeric"
                          value={woundsToA}
                          onChange={e => setWoundsToA(e.target.value.replace(/[^0-9]/g, ""))}
                          className={`w-16 rounded border p-1.5 text-center font-bold text-lg ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"}`}
                          placeholder="0"
                        />
                        <span className="text-xs text-gray-400">wounds</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🎯 Target B:</span>
                        <span className={`w-16 rounded border p-1.5 text-center font-bold text-lg ${theme === "dark" ? "bg-gray-900/20 border-gray-700 text-amber-400" : "bg-gray-50 border-gray-200 text-amber-600"}`}>
                          {woundsToBNum}
                        </span>
                        <span className="text-xs text-gray-400">wounds</span>
                      </div>
                      <div className={`text-xs ${woundsToANum + woundsToBNum === totalSavableWounds ? "text-green-400" : "text-red-400"}`}>
                        {woundsToANum + woundsToBNum}/{totalSavableWounds} allocated
                      </div>
                    </div>
                  </div>

                  {/* Target B stats */}
                  <div>
                    <div className="text-sm font-extrabold mb-3 text-amber-400">🎯 Target B — Stats</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-semibold mb-1">Toughness</div>
                        <input type="text" inputMode="numeric" value={toughnessB} onChange={e => setToughnessB(e.target.value)}
                          placeholder="T" className={`w-full rounded border p-2 font-bold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300"}`} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-1">Armour Save</div>
                        <input type="text" inputMode="numeric" value={armorSaveB} onChange={e => setArmorSaveB(e.target.value)}
                          placeholder="Sv+" className={`w-full rounded border p-2 font-bold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300"}`} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-1">Invuln Save</div>
                        <input type="text" inputMode="numeric" value={invulnSaveB} onChange={e => setInvulnSaveB(e.target.value)}
                          placeholder="Inv+" className={`w-full rounded border p-2 font-bold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300"}`} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-1">FNP</div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={fnpEnabledB} onChange={e => setFnpEnabledB(e.target.checked)} className="h-4 w-4 accent-amber-400" />
                          <input type="text" inputMode="numeric" value={fnpB} onChange={e => setFnpB(e.target.value)}
                            disabled={!fnpEnabledB} placeholder="e.g. 5"
                            className={`flex-1 rounded border p-2 font-bold disabled:opacity-40 ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300"}`} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={inCoverB} onChange={e => setInCoverB(e.target.checked)} className="accent-amber-400" /> Cover</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={ignoreApB} onChange={e => setIgnoreApB(e.target.checked)} className="accent-amber-400" /> Ignore AP</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={ignoreFirstFailedSaveB} onChange={e => setIgnoreFirstFailedSaveB(e.target.checked)} className="accent-amber-400" /> Ignore 1st failed save</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={minusOneDamageB} onChange={e => setMinusOneDamageB(e.target.checked)} className="accent-amber-400" /> -1 Damage</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={halfDamageB} onChange={e => setHalfDamageB(e.target.checked)} className="accent-amber-400" /> Half Damage</label>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT: Results */}
          <div className="lg:col-span-6 space-y-4">
                            <Section theme={theme} title={
                              <span className="flex items-center gap-2">
                                Dice entry
                                <span className="group relative cursor-help">
                                  <span className={`text-xs font-normal px-1.5 py-0.5 rounded border ${theme === "dark" ? "border-gray-600 text-gray-400" : "border-gray-300 text-gray-500"}`}>?</span>
                                  <span className={`pointer-events-none absolute left-0 top-6 z-50 w-64 rounded-lg border p-2 text-xs font-normal opacity-0 group-hover:opacity-100 transition-opacity ${theme === "dark" ? "bg-gray-900 border-gray-700 text-gray-200" : "bg-white border-gray-200 text-gray-700"} shadow-xl`}>
                                    Manually enter dice results below. Use the 🎲 buttons on the right to auto-roll each step.
                                  </span>
                                </span>
                              </span>
                            } action={
                              <RollAllButton
                                onClick={rollAll}
                                disabled={!statsReady || isRollingAll}
                                isRolling={isRollingAll}
                                isReady={statsReady}
                              />
                            }>
              {!attacksFixed ? (
                              <Field
                                label={
                                  <CounterLabel
                                    prefix={`Attack rolls${parseDiceSpec(attacksValue).mod > 0 ? ` (+${parseDiceSpec(attacksValue).mod} added after)` : ""}`}
                                    need={parseDiceSpec(attacksValue).n}
                                    entered={parseDiceList(attacksRolls).length}
                                    remaining={Math.max(0, parseDiceSpec(attacksValue).n - parseDiceList(attacksRolls).length)}
                                    theme={theme}
                                  />
                                }
                                hint='Enter exactly N dice results (the roll count). Any +N modifier in the expression is added to the total automatically.'
                                theme={theme}
                              >
                                <div className="flex gap-2">
                                  <input
                                    className={`flex-1 rounded border p-2 text-lg font-semibold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100 placeholder:text-gray-500" : "bg-white border-gray-300 text-gray-900"} ${
                                      parseDiceList(attacksRolls).length !== parseDiceSpec(attacksValue).n
                                        ? "border-red-500 ring-2 ring-red-200"
                                        : ""
                                    }`}
                                    value={attacksRolls}
                                    onChange={(e) => setAttacksRolls(e.target.value)}
                                    placeholder='e.g. 3 5 (rolls only — +N modifier is auto-added)'
                                  />
                                  <button type="button" title="Roll for me"
                                    disabled={parseDiceSpec(attacksValue).n === 0}
                                    onClick={() => { const sp = parseDiceSpec(attacksValue); setAttacksRolls(rollDice(sp.n, sp.sides)); }}
                                    className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                                </div>
                              </Field>
                            ) : null}

              <Field
                              label={<CounterLabel prefix="Hit rolls" need={hitNeeded} entered={hitEntered} remaining={hitNeeded - hitEntered} />}
                              hint="Enter exactly A hit dice unless TORRENT."
                            >
                              <div className="flex gap-2">
                                <input
                                  className={`flex-1 rounded border p-2 text-lg font-semibold ${hasHitCountError ? "border-red-500 ring-2 ring-red-200" : ""}`}
                                  value={hitRollsText}
                                  onChange={(e) => setHitRollsText(e.target.value)}
                                  placeholder="e.g. 6 5 2 1 4 ..."
                                />
                                <button type="button" title="Roll for me" disabled={hitNeeded === 0}
                                  onClick={() => setHitRollsText(rollDice(hitNeeded, 6))}
                                  className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                              </div>
                            </Field>

                            {(rerollHitOnes || rerollHitFails) ? (
                              <Field
                                label={<CounterLabel prefix="Hit reroll dice" need={hitRerollNeeded} entered={hitRerollEntered} remaining={hitRerollNeeded - hitRerollEntered} />}
                                hint="Enter rerolled hit dice in order for each eligible reroll. Eligibility is determined from the initial hit rolls."
                              >
                                <input
                                  className={`w-full rounded border p-2 text-lg font-semibold ${hasHitRerollCountError ? "border-red-500 ring-2 ring-red-200" : ""}`}
                                  value={hitRerollRollsText}
                                  onChange={(e) => setHitRerollRollsText(e.target.value)}
                                  placeholder="e.g. 6 3 ..."
                                />
                              </Field>
                            ) : null}

                            <Field
                              label={<CounterLabel prefix="Wound rolls" need={woundNeeded} entered={woundEntered} remaining={woundNeeded - woundEntered} />}
                              hint={`Pool already accounts for Lethal and Sustained. Lethal auto-wounds this volley: ${activeComputed.autoWoundsFromLethal}.`}
                            >
                              <div className="flex gap-2">
                                <input
                                  className={`flex-1 rounded border p-2 text-lg font-semibold ${hasWoundCountError ? "border-red-500 ring-2 ring-red-200" : ""}`}
                                  value={woundRollsText}
                                  onChange={(e) => setWoundRollsText(e.target.value)}
                                  placeholder="e.g. 6 4 3 1 ..."
                                />
                                <button type="button" title="Roll for me" disabled={woundNeeded === 0}
                                  onClick={() => setWoundRollsText(rollDice(woundNeeded, 6))}
                                  className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                              </div>
                            </Field>

                            {(rerollWoundOnes || rerollWoundFails || twinLinked) ? (
                              <Field
                                label={<CounterLabel prefix="Wound reroll dice" need={woundRerollNeeded} entered={woundRerollEntered} remaining={woundRerollNeeded - woundRerollEntered} />}
                                hint="Enter rerolled wound dice in order for each eligible reroll. Eligibility is determined from the initial wound rolls."
                              >
                                <input
                                  className={`w-full rounded border p-2 text-lg font-semibold ${hasWoundRerollCountError ? "border-red-500 ring-2 ring-red-200" : ""}`}
                                  value={woundRerollRollsText}
                                  onChange={(e) => setWoundRerollRollsText(e.target.value)}
                                  placeholder="e.g. 5 4 ..."
                                />
                              </Field>
                            ) : null}

                            <Field
                              label={<CounterLabel prefix={splitEnabled ? "Save rolls (A)" : "Save rolls"} need={saveNeeded} entered={saveEntered} remaining={saveNeeded - saveEntered} />}
                              hint="Roll saves only for savable wounds. Mortal wounds skip saves."
                            >
                              <div className="flex gap-2">
                                <input
                                  className={`flex-1 rounded border p-2 text-lg font-semibold ${hasSaveCountError ? "border-red-500 ring-2 ring-red-200" : ""}`}
                                  value={saveRollsText}
                                  onChange={(e) => setSaveRollsText(e.target.value)}
                                  placeholder="e.g. 5 2 6 ..."
                                />
                                <button type="button" title="Roll for me" disabled={saveNeeded === 0}
                                  onClick={() => setSaveRollsText(rollDice(saveNeeded, 6))}
                                  className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                              </div>
                            </Field>

                            {(fnpEnabled && fnp !== "") ? (
                            <Field
                                            label={<CounterLabel prefix="FNP rolls" need={fnpNeeded} entered={fnpEntered} remaining={fnpNeeded - fnpEntered} />}
                                            hint="Only if FNP is enabled. One die per point of damage."
                                          >
                                            <div className="flex gap-2">
                                              <input
                                                className={`flex-1 rounded border p-2 text-lg font-semibold ${hasFnpCountError ? "border-red-500 ring-2 ring-red-200" : ""}`}
                                                value={fnpRollsText}
                                                onChange={(e) => setFnpRollsText(e.target.value)}
                                                placeholder="e.g. 1 5 6 2 ..."
                                              />
                                              <button type="button" title="Roll for me" disabled={fnpNeeded === 0}
                                                onClick={() => setFnpRollsText(rollDice(fnpNeeded, 6))}
                                                className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                                            </div>
                                          </Field>
                            ) : null}

                          </Section>

                          {splitEnabled && (
                            <Section theme={theme} title="🎯 Target B — Dice">
                              <div className={`text-xs mb-2 ${theme === "dark" ? "text-amber-400" : "text-amber-600"}`}>
                                {woundsToBNum} wounds allocated → Target B saves
                              </div>

                              <Field
                                label={<CounterLabel prefix="Save rolls (B)" need={woundsToBNum} entered={parseDiceList(saveRollsTextB).length} remaining={woundsToBNum - parseDiceList(saveRollsTextB).length} theme={theme} />}
                                hint={splitB ? `Save target: ${splitB.saveTarget}+` : "Enter Target B stats first."}
                                theme={theme}
                              >
                                <div className="flex gap-2">
                                  <input
                                    className={`flex-1 rounded border p-2 text-lg font-semibold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100 placeholder:text-gray-500" : "bg-white border-gray-300 text-gray-900"} ${parseDiceList(saveRollsTextB).length !== woundsToBNum && woundsToBNum > 0 ? "border-red-500 ring-2 ring-red-200" : ""}`}
                                    value={saveRollsTextB}
                                    onChange={e => setSaveRollsTextB(e.target.value)}
                                    placeholder="e.g. 5 2 6 ..."
                                  />
                                  <button type="button" title="Roll for me" disabled={woundsToBNum === 0}
                                    onClick={() => setSaveRollsTextB(rollDice(woundsToBNum, 6))}
                                    className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                                </div>
                              </Field>

                              {!damageFixed && (
                                <Field
                                  label={<CounterLabel prefix="Damage rolls (B)" need={splitB ? splitB.failedSavesEffective : 0} entered={parseDiceList(damageRollsB).length} remaining={(splitB ? splitB.failedSavesEffective : 0) - parseDiceList(damageRollsB).length} theme={theme} />}
                                  hint="One die per failed save. Modifier auto-added."
                                  theme={theme}
                                >
                                  <div className="flex gap-2">
                                    <input
                                      className={`flex-1 rounded border p-2 text-lg font-semibold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100 placeholder:text-gray-500" : "bg-white border-gray-300 text-gray-900"}`}
                                      value={damageRollsB}
                                      onChange={e => setDamageRollsB(e.target.value)}
                                      placeholder="e.g. 3 5 2 ..."
                                    />
                                    <button type="button" title="Roll for me"
                                      disabled={!splitB || splitB.failedSavesEffective === 0}
                                      onClick={() => { const sp = parseDiceSpec(damageValue); setDamageRollsB(rollDice(splitB.failedSavesEffective, sp.sides)); }}
                                      className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                                  </div>
                                </Field>
                              )}

                              {(fnpEnabledB && fnpB !== "") && (
                                <Field
                                  label={<CounterLabel prefix="FNP rolls (B)" need={splitB ? splitB.fnpNeeded : 0} entered={parseDiceList(fnpRollsTextB).length} remaining={(splitB ? splitB.fnpNeeded : 0) - parseDiceList(fnpRollsTextB).length} theme={theme} />}
                                  hint="One die per point of damage on Target B."
                                  theme={theme}
                                >
                                  <div className="flex gap-2">
                                    <input
                                      className={`flex-1 rounded border p-2 text-lg font-semibold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100 placeholder:text-gray-500" : "bg-white border-gray-300 text-gray-900"}`}
                                      value={fnpRollsTextB}
                                      onChange={e => setFnpRollsTextB(e.target.value)}
                                      placeholder="e.g. 1 5 6 ..."
                                    />
                                    <button type="button" title="Roll for me"
                                      disabled={!splitB || splitB.fnpNeeded === 0}
                                      onClick={() => setFnpRollsTextB(rollDice(splitB.fnpNeeded, 6))}
                                      className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                                  </div>
                                </Field>
                              )}
                            </Section>
                          )}

<Section theme={theme} title="Results">

                {!statsReady ? (
                  <div className={`mt-3 rounded-xl border p-4 text-base ${theme === "dark" ? "border-red-600 bg-red-900/30 text-red-200" : "border-red-300 bg-red-50 text-red-800"}`}>
                    <div className="font-semibold mb-1">Missing required stats</div>
                    <div className="text-xs">Fill the highlighted fields in Weapon and Target to get a valid preview.</div>
                    <div className="mt-2 text-xs">Missing: {[...missingWeapon, ...missingTarget].join(', ')}</div>
                  </div>
                ) : activeComputed.errors.length > 0 ? (
                  <div className={`mt-3 rounded-xl border p-4 text-base ${theme === "dark" ? "border-red-600 bg-red-900/30 text-red-200" : "border-red-300 bg-red-50 text-red-800"}`}>
                    <div className="font-semibold mb-1">Input issues</div>
                    <ul className="list-disc pl-5 space-y-1">
                      {activeComputed.errors.map((e, idx) => (
                        <li key={idx}>{e}</li>
                      ))}
                    </ul>
                  </div>
                ) : status === "Waiting for dice" ? (
                  <div className={`mt-3 rounded-xl border p-4 text-base ${theme === "dark" ? "border-amber-600 bg-amber-900/30 text-amber-200" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
                    <div className="font-semibold">Waiting for dice</div>
                    <div className="text-xs">Enter the remaining dice to finalize a hard result.</div>
                  </div>
                ) : (
                  <div className={`mt-3 rounded-xl border p-4 text-base ${theme === "dark" ? "border-green-600 bg-green-900/30 text-green-200" : "border-green-300 bg-green-50 text-green-900"}`}>
                    <div className="font-semibold">Ready</div>
                    <div className="text-xs">Results are now fully determined by your entered dice.</div>
                  </div>
                )}

                
                {/* Prominent total damage panel (full width) */}
                  <div className={`mt-4 rounded-2xl border p-4 ${viz.totalPanel} relative overflow-visible inline-block w-max min-w-full`}>
                    {/* Backdrop state cue: soft = static tile, final = animated marquee */}
                    {statsReady ? (
                      diceReady ? (
                        <div className="absolute inset-0 pointer-events-none opacity-15 overflow-hidden rounded-2xl">
                          <div className="nape-marquee-row" style={{ animationDuration: "24s" }}>
                            {Array.from({ length: 28 }).map((_, i) => (
                              <span key={`m-${i}`}>{viz.emoji}</span>
                            ))}
                            {Array.from({ length: 28 }).map((_, i) => (
                              <span key={`m-dup-${i}`}>{viz.emoji}</span>
                            ))}
                          </div>
                          <div className="nape-marquee-row nape-marquee-reverse" style={{ animationDuration: "26s" }}>
                            {Array.from({ length: 28 }).map((_, i) => (
                              <span key={`mr-${i}`}>{viz.emoji}</span>
                            ))}
                            {Array.from({ length: 28 }).map((_, i) => (
                              <span key={`mr-dup-${i}`}>{viz.emoji}</span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 pointer-events-none opacity-10 overflow-hidden rounded-2xl">
                          <div className="w-full h-full flex flex-wrap items-start content-start gap-6 text-5xl md:text-6xl leading-none select-none py-6">
                            {Array.from({ length: 40 }).map((_, i) => (
                              <span key={i}>{viz.emoji}</span>
                            ))}
                          </div>
                        </div>
                      )
                    ) : null}

                  <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={`text-sm uppercase tracking-widest ${viz.totalLabel}`}>{totalLabelText}</div>
                      <div className={`text-sm ${viz.totalMeta}`}>{viz.title} · {viz.sub}</div>
                      {softNote ? <div className={`text-xs ${viz.totalMeta} mt-1`}>{softNote}</div> : null}
                    </div>
                    <div className={`text-sm ${viz.totalMeta}`}>{diceReady ? 'final · post-mitigation' : 'preview'}</div>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-4 overflow-visible">
                    <div className="text-6xl md:text-7xl leading-none">{viz.emoji}</div>
                    <div
                      className={`${dmgSizeClass} font-extrabold ${viz.totalNumber} tabular-nums whitespace-nowrap text-left overflow-visible cursor-pointer`}
                      title="Konami-style easter egg, (secret) click 5x"
                      onClick={() => setSecretClicks((c) => c + 1)}
                    >
                      {dmgStr}
                    </div>
                  {easterEgg ? (
                    <div className={`mt-3 rounded-xl border p-3 text-center ${easterEgg?.style === "dbz" ? "border-yellow-300 bg-gradient-to-r from-purple-700 via-indigo-600 to-yellow-500 text-white" : "border-amber-300 bg-amber-50 text-gray-900"}`}>
                      <div className={`text-lg font-extrabold ${easterEgg?.style === "dbz" ? "drop-shadow" : ""}`}>{easterEgg.title}</div>
                      <div className="text-2xl">{easterEgg.emoji}</div>
                      {easterEgg.note ? (
                        <div className={`mt-1 text-xs ${easterEgg?.style === "dbz" ? "text-white/90 drop-shadow" : "text-gray-700"}`}>{easterEgg.note}</div>
                      ) : null}
                    </div>
                  ) : null}
                  </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className={`rounded-lg border p-2 ${theme === "dark" ? "bg-gray-900 border-gray-700 text-gray-100" : "bg-white border-gray-200 text-gray-900"}`}>
                    <div className="text-base font-extrabold">Attack math</div>
                    <div className="mt-1">{activeComputed.A} attacks</div>
                    <div>Wound-roll pool: {activeComputed.woundRollPool}</div>
                    <div>Wound target: {activeComputed.needed}+</div>
                    <div>Save target: {activeComputed.saveTarget}+ </div>
                  </div>

                  <div className={`rounded-lg border p-2 ${theme === "dark" ? "bg-gray-900 border-gray-700 text-gray-100" : "bg-white border-gray-200 text-gray-900"}`}>
                    <div className="text-base font-extrabold">Crit branches</div>
                    <div className="mt-1">Crit hits: {activeComputed.critHits}</div>
                    <div>Sustained extra hits: {activeComputed.sustainedExtraHits}</div>
                    <div>Lethal auto-wounds: {activeComputed.autoWoundsFromLethal}</div>
                    <div>Crit wounds: {activeComputed.critWounds}</div>
                  </div>

                  <div className={`rounded-lg border p-2 ${theme === "dark" ? "bg-gray-900 border-gray-700 text-gray-100" : "bg-white border-gray-200 text-gray-900"}`}>
                    <div className="text-base font-extrabold">Wounds and saves</div>
                    <div className="mt-1">Total wounds: {activeComputed.totalWounds}</div>
                    <div>Dev Wounds conversions: {activeComputed.mortalWoundAttacks}</div>
                    <div>Savable wounds: {activeComputed.savableWounds}</div>
                    <div>Failed saves: {activeComputed.failedSaves}</div>
                  </div>

                    <div className={`rounded-xl border p-3 ${dmgSubWrapClass}`}>
                      <div className="text-base font-extrabold flex items-center justify-between">
                        <span>Damage subtotals</span>
                      <span className="text-3xl leading-none">{viz.emoji}</span>
                    </div>

                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <div className={`rounded-lg border p-2 ${dmgSubTileClass}`}>
                              <div className={`text-xs uppercase tracking-widest ${dmgSubLabelClass}`}>Normal</div>
                              <div className={`text-3xl font-extrabold ${theme === "dark" ? "text-white" : Number(shownNormalDamage || 0) >= 10 ? "text-gray-900" : "text-gray-900"}`}>{shownNormalDamage}</div>
                            </div>
                            <div className={`rounded-lg border p-2 ${dmgSubTileClass}`}>
                              <div className={`text-xs uppercase tracking-widest ${dmgSubLabelClass}`}>Mortal</div>
                              <div className={`text-3xl font-extrabold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>{shownMortalDamage}</div>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <div className={`rounded-lg border p-2 ${dmgSubTileClass}`}>
                              <div className={`text-xs uppercase tracking-widest ${dmgSubLabelClass}`}>Pre-FNP</div>
                              <div className={`text-3xl font-extrabold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>{shownTotalPreFnp}</div>
                            </div>
                            <div className={`rounded-lg border p-2 ${dmgSubTileClass}`}>
                              <div className={`text-xs uppercase tracking-widest ${dmgSubLabelClass}`}>Ignored</div>
                              <div className={`text-3xl font-extrabold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>{ignoredTotal}</div>
                            {activeComputed.ignoredByRule ? (
                                <div className={`text-xs mt-0.5 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>incl. ignore-first-failed-save</div>
                            ) : null}
                          </div>
                        </div>

                </div>

                {/* ── Split Volley Results ── */}
                {splitEnabled && splitB && (
                  <div className={`mt-4 rounded-xl border p-3 ${theme === "dark" ? "border-amber-700/50 bg-amber-900/20" : "border-amber-300 bg-amber-50"}`}>
                    <div className={`text-xs font-extrabold uppercase tracking-widest mb-3 ${theme === "dark" ? "text-amber-400" : "text-amber-700"}`}>
                      ⚔️ Split Volley Summary
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className={`rounded-lg p-2 border ${theme === "dark" ? "bg-slate-900 border-gray-700" : "bg-white border-gray-200"}`}>
                        <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">🎯 Target A</div>
                        <div className="text-2xl font-black text-amber-400">{allowDamageTotals ? (splitA ? splitA.totalPostFnp : 0) : "–"}</div>
                        <div className="text-xs text-gray-400">dmg</div>
                      </div>
                      <div className={`rounded-lg p-2 border ${theme === "dark" ? "bg-slate-900 border-gray-700" : "bg-white border-gray-200"}`}>
                        <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">🎯 Target B</div>
                        <div className="text-2xl font-black text-orange-400">{allowDamageTotals ? splitB.totalPostFnp : "–"}</div>
                        <div className="text-xs text-gray-400">dmg</div>
                      </div>
                      <div className={`rounded-lg p-2 border ${theme === "dark" ? "bg-amber-900/40 border-amber-700/50" : "bg-amber-100 border-amber-300"}`}>
                        <div className="text-xs uppercase tracking-widest text-amber-400 mb-1">Total</div>
                        <div className="text-2xl font-black text-amber-300">{allowDamageTotals ? (splitA ? splitA.totalPostFnp : 0) + splitB.totalPostFnp : "–"}</div>
                        <div className="text-xs text-gray-400">dmg</div>
                      </div>
                    </div>
                    {splitB.errors.length > 0 && (
                      <div className="mt-2 text-xs text-red-400 space-y-0.5">
                        {splitB.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-3">
                  <div className="space-y-2">
                    {/* Row 1: Load example + Clear all */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-gradient-to-r from-yellow-400/80 to-amber-400/80 text-gray-950 px-3 py-2 text-sm font-extrabold border border-yellow-200/40 hover:from-yellow-300/90 hover:to-amber-300/90 w-full"
                        onClick={loadExample}
                        title="Fill all fields with a known working example"
                      >
                        Load example
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-gray-900 text-gray-100 px-3 py-2 text-sm font-semibold border border-gray-700 hover:bg-gray-800 w-full"
                        onClick={() => { handleClearAllEaster(); clearAll(); }}
                      >
                        Clear all
                      </button>
                    </div>

                    {/* Row 2: Clear weapon/target/dice */}
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-gray-900 text-gray-100 px-3 py-2 text-sm font-semibold border border-gray-700 hover:bg-gray-800 w-full"
                        onClick={clearWeapon}
                      >
                        Clear weapon
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-gray-900 text-gray-100 px-3 py-2 text-sm font-semibold border border-gray-700 hover:bg-gray-800 w-full"
                        onClick={clearTarget}
                      >
                        Clear target
                      </button>
                      <button type="button" className="rounded-lg bg-gray-900 text-gray-100 px-3 py-2 text-sm font-semibold border border-gray-700 hover:bg-gray-800 w-full" onClick={() => clearDice()}>
                        Clear dice
                      </button>
                    </div>



                  </div>
                </div>

                </div>
              </Section>

              <Section theme={theme} title="Step-by-step log">
                <div className="flex items-center justify-between mb-2">
                  <div className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>Detailed resolution trace for this volley.</div>
                  <button
                    type="button"
                    className={mainToggleBtnClass}
                    onClick={() => setShowLog(!showLog)}
                  >
                    {showLog ? "Hide log" : "Show log"}
                  </button>
                </div>
                {showLog && (
                  <ol className={`text-sm leading-relaxed list-decimal pl-5 space-y-1 ${theme === "dark" ? "text-gray-100" : "text-gray-800"}`}>
                    {activeComputed.log.map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ol>
                )}
              </Section>
          </div>

        </div>

          <div className="rounded-2xl bg-gray-900/40 border border-gray-700 text-gray-100 p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-center md:text-left">
                <div className="text-sm font-semibold">Reference and accuracy</div>
                <div className="text-xs text-gray-300">
                  Deterministic Combat Patrol-first rules interpretation. Rough accuracy: ~96–98% Combat Patrol, ~85–95% full 40k (varies by edge cases).
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <button
                type="button"
                  className="rounded-lg bg-gray-900 text-gray-100 px-3 py-2 text-sm font-semibold border border-gray-700 hover:bg-gray-800 w-full md:w-auto"
                onClick={toggleTheme}
                title="Toggle light/dark theme"
              >
                Theme: {theme === "dark" ? "Dark" : "Light"}
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-sm font-extrabold border w-full md:w-auto ${
                  preserveHooks
                    ? "bg-gradient-to-r from-sky-500/80 to-indigo-500/80 text-white border-sky-200/30 hover:from-sky-400/90 hover:to-indigo-400/90"
                    : "bg-gray-900 text-gray-100 border-gray-700 hover:bg-gray-800"
                }`}
                onClick={() => setPreserveHooks(!preserveHooks)}
                title="When enabled, Clear actions keep persistent toggle/option hooks."
              >
                Preserve hooks: {preserveHooks ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-sm font-extrabold border w-full md:w-auto ${
                  strictMode
                    ? "bg-gradient-to-r from-red-500/80 to-rose-500/80 text-white border-red-200/30 hover:from-red-400/90 hover:to-rose-400/90"
                    : "bg-gray-900 text-gray-100 border-gray-700 hover:bg-gray-800"
                }`}
                onClick={() => setStrictMode(!strictMode)}
                title="When enabled, totals are locked until stats + dice are complete (no soft totals)."
              >
                Strict mode: {strictMode ? "ON" : "OFF"}
              </button>

              <button
                type="button"
                  className="rounded-lg bg-gray-900 text-gray-100 px-3 py-2 text-sm font-semibold border border-gray-700 hover:bg-gray-800 w-full md:w-auto"
                onClick={() => setShowLimitations(!showLimitations)}
              >
                {showLimitations ? "Hide limitations" : "Show limitations"}
              </button>

              <button
                type="button"
                  className="rounded-lg bg-gray-900 text-gray-100 px-3 py-2 text-sm font-semibold border border-gray-700 hover:bg-gray-800 w-full md:w-auto"
                onClick={() => setShowCheatSheet(!showCheatSheet)}
              >
                {showCheatSheet ? "Hide cheat sheet" : "Show cheat sheet"}
              </button>
            </div>
          </div>

            <div className="mt-3 flex flex-wrap items-center justify-center md:justify-start gap-2">
              <Chip>~96–98% Combat Patrol</Chip>
              <Chip>~85–95% full 40k</Chip>
            <Chip>Manual rolls</Chip>
            <Chip>Crit thresholds</Chip>
            <Chip>Lethal Hits</Chip>
            <Chip>Sustained Hits</Chip>
            <Chip>Devastating Wounds</Chip>
            <Chip>Precision</Chip>
            <Chip>Cover</Chip>
            <Chip>Ignore AP</Chip>
            <Chip>Ignore first failed save</Chip>
            <Chip>-1 Damage</Chip>
            <Chip>Half Damage</Chip>
          </div>



          {showLimitations && (
            <div className="mt-4 rounded-xl border border-gray-700 bg-gray-950/30 p-3">
              <div className="text-sm font-semibold">Accuracy and limitations (Combat Patrol focus)</div>
              <div className="text-xs text-gray-300 mt-1">
                Goal: accurate, table-friendly attack resolution. This tool is not a full game tracker.
              </div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-gray-700 bg-gray-900/30 p-2">
                  <div className="text-xs uppercase tracking-widest text-gray-300">Implemented</div>
                  <ul className="mt-2 list-disc pl-5 text-gray-200 space-y-1">
                    <li>Manual dice entry with step-by-step log</li>
                    <li>Hit, wound, save, FNP sequencing</li>
                    <li>Crit thresholds, Sustained Hits, Lethal Hits, Devastating Wounds, Precision hook</li>
                    <li>Rerolls: reroll 1s and reroll fails for both hit and wound rolls; Twin-linked</li>
                    <li>Rapid Fire X (half-range bonus attacks)</li>
                    <li>Variable attacks: fixed integer or dice expression (e.g. D6+1, 2D6, D3+2)</li>
                    <li>Cover (+1 save), Ignore AP</li>
                    <li>Ignore first failed save, Half damage (round up), -1 Damage (min 1)</li>
                    <li>Step-by-step Wizard with auto-roll for quick table use</li>
                  </ul>
                </div>
                <div className="rounded-lg border border-gray-700 bg-gray-900/30 p-2">
                  <div className="text-xs uppercase tracking-widest text-gray-300">Not implemented</div>
                  <ul className="mt-2 list-disc pl-5 text-gray-200 space-y-1">
                    <li>Multi-target allocation</li>
                    <li>Model-level damage caps and unit wound tracking</li>
                    <li>All full-40k edge-case keyword interactions</li>
                  </ul>
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-300">
                Notes: Cover is a simple +1 save toggle (not range/terrain conditional). AP is enforced as 0 or negative. Damage-mod ordering: half (round up) then -1 (min 1).
              </div>
            </div>
          )}

          {showCheatSheet && (
            <div className="mt-4 rounded-xl border border-gray-700 bg-gray-950/30 p-3">
              <div className="text-sm font-semibold">Keyword cheat sheet</div>
              <div className="mt-1 text-xs text-gray-300">
                Quick definitions plus what this tool actually applies. Keep this aligned with your toggles.
              </div>

              <div className="mt-3 space-y-2">
                {cheatSheet.map((item) => (
                  <div key={item.name} className="rounded-xl border border-gray-700 bg-gray-900/30 p-3">
                    <div className="text-sm font-semibold text-gray-100">{item.name}</div>
                    <div className="mt-2 text-sm leading-relaxed text-gray-200 space-y-2">
                      <div><span className="font-semibold text-gray-100">Definition:</span> {item.what}</div>
                      <div><span className="font-semibold text-gray-100">In this app:</span> {item.how}</div>
                      {item.notes ? <div><span className="font-semibold text-gray-100">Notes:</span> {item.notes}</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}



            <div className="mt-6 text-center text-xs text-gray-400 space-y-1">
              <div className="flex items-center justify-center gap-3">
  <img src="/favicon-256.png" alt="NAPE" className="h-9 w-9 rounded-lg border border-gray-600 bg-gray-950/30 p-1" />
  <div className="font-semibold text-gray-300">{APP_NAME} · v{APP_VERSION}</div>
</div>
              <div>Deterministic Combat Patrol-first rules interpretation. Manual dice entry. Not official rules.</div>
              <div>© {new Date().getFullYear()} Kyle. Warhammer 40,000 is a trademark of Games Workshop. Unofficial fan-made tool.</div>
            </div>

            {/* Wizard overlay */}
            {showWizard && (
              <WizardOverlay
                theme={theme}
                onClose={() => setShowWizard(false)}
                attacksFixed={attacksFixed} setAttacksFixed={setAttacksFixed}
                attacksValue={attacksValue} setAttacksValue={setAttacksValue}
                attacksRolls={attacksRolls} setAttacksRolls={setAttacksRolls}
                toHit={toHit} setToHit={setToHit}
                strength={strength} setStrength={setStrength}
                ap={ap} setAp={setAp}
                damageFixed={damageFixed} setDamageFixed={setDamageFixed}
                damageValue={damageValue} setDamageValue={setDamageValue}
                toughness={toughness} setToughness={setToughness}
                armorSave={armorSave} setArmorSave={setArmorSave}
                hitRollsText={hitRollsText} setHitRollsText={setHitRollsText}
                woundRollsText={woundRollsText} setWoundRollsText={setWoundRollsText}
                saveRollsText={saveRollsText} setSaveRollsText={setSaveRollsText}
                computed={computed}
                hitNeeded={hitNeeded}
                woundNeeded={woundNeeded}
                saveNeeded={saveNeeded}
                torrent={torrent}
                fnp={fnp}
                fnpEnabled={fnpEnabled}
              />
            )}

            {/* Dice sequencing reference modal */}
            {showDiceRef && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 md:p-4"
                role="dialog"
                aria-modal="true"
                aria-label="Dice sequencing reference"
                onMouseDown={(e) => {
                  // click outside closes
                  if (e.target === e.currentTarget) setShowDiceRef(false);
                }}
              >
                <div className="w-[98vw] max-w-none h-[94vh] flex flex-col min-h-0 overflow-hidden rounded-2xl border border-gray-700 bg-gray-950 shadow-2xl">
                  <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-4 py-3">
                    <div className="text-sm font-extrabold text-gray-100">Dice sequencing reference</div>
                    <button
                      type="button"
                      className="rounded-lg bg-gray-900 text-gray-100 px-3 py-1.5 text-sm font-semibold border border-gray-700 hover:bg-gray-800"
                      onClick={() => setShowDiceRef(false)}
                      title="Close (Esc)"
                    >
                      Close
                    </button>
                  </div>
                  <div className="px-4 py-3 flex-1 min-h-0 flex flex-col">
                    <div className="text-xs text-gray-400 mb-2">
                      Tip: press <span className="font-semibold text-gray-200">Esc</span> to close.
                    </div>
                    <iframe
                      title="40k dice sequencing reference"
                      src="/40k_decoded_dice_sequence_v7_vertical_stack.html"
                      className="w-full h-full flex-1 min-h-0 rounded-xl border border-gray-800 bg-black"
                    />
                  </div>
                </div>
              </div>
            )}

            <style>{`
              @keyframes napeMarquee {
                0% { transform: translateX(0); }
                100% { transform: translateX(-50%); }
              }
              .nape-marquee-row {
                display: flex;
                gap: 1.5rem;
                white-space: nowrap;
                font-size: 3.25rem;
                line-height: 1;
                padding: 1.25rem 1.25rem 0 1.25rem;
                animation: napeMarquee linear infinite;
                will-change: transform;
              }
              .nape-emoji-tile {display:flex; align-items:center; justify-content:center;}
            .nape-emoji-tile-inner {font-size: 3.25rem; line-height:1.05; white-space: pre-wrap;}
            
            .nape-marquee-reverse {
                animation-direction: reverse;
                padding-top: 0.25rem;
              }
            `}</style>
        </div>
      </div>
      </div>
    </div>
  );
}