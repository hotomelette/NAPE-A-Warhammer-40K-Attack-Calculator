import React, { useReducer, useState, useEffect, useRef } from "react";
import { useCalculator } from "./useCalculator.js";
import { useCalculatorSplit } from "./useCalculatorSplit.js";
import { parseDiceList, parseDiceSpec, clampModPlusMinusOne, rollDice, chooseSaveTarget, clampMin2Plus, woundTargetNumber } from "./calculatorUtils.js";
import { appReducer, initialState, PRESETS } from "./appReducer.js";
import { SettingsPanel, getApiKey } from "./SettingsPanel.jsx";
import { useUnitLookup } from "./useUnitLookup.js";
import { useUnitHistory } from "./useUnitHistory.js";

const APP_NAME = "NAPE – A Warhammer 40K Attack Calculator";
const APP_VERSION = "5.19";

/* =========================
   Helpers — see calculatorUtils.js
========================= */

function DiceEntryTooltipContent({ theme }) {
  const dark = theme === "dark";
  return (
    <div className={`text-xs space-y-1 ${dark ? "text-gray-200" : "text-gray-700"}`}>
      <div className="font-bold mb-1">Dice entry sequence:</div>
      <div>1. <strong>Attacks</strong> (if random) — enter expression, roll, enter results</div>
      <div>2. <strong>Hit rolls</strong> — one die per attack (skip if Torrent)</div>
      <div>3. <strong>Wound rolls</strong> — one die per hit</div>
      <div>4. <strong>Save rolls</strong> — one die per savable wound</div>
      <div>5. <strong>FNP rolls</strong> — one die per damage point (if FNP enabled)</div>
      <div>6. <strong>Damage rolls</strong> — one die per failed save (if D is variable)</div>
    </div>
  );
}

function DiceEntryTooltip({ theme }) {
  const [show, setShow] = React.useState(false);
  return (
    <span className="relative" style={{ overflow: "visible" }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className={`cursor-help text-xs font-normal px-1.5 py-0.5 rounded border select-none ${theme === "dark" ? "border-gray-600 text-gray-400 hover:text-gray-200" : "border-gray-300 text-gray-500 hover:text-gray-700"}`}
      >?</span>
      {show && (
        <span
          className={`absolute left-0 top-7 z-[9999] w-64 rounded-lg border p-2.5 text-xs font-normal shadow-2xl ${theme === "dark" ? "bg-gray-900 border-gray-600 text-gray-200" : "bg-white border-gray-300 text-gray-700"}`}
          style={{ position: "absolute", pointerEvents: "none" }}
        >
          Manually enter dice results below. Use the 🎲 buttons to auto-roll each step.
        </span>
      )}
    </span>
  );
}

function StatLabel({ label, full, example, required, theme }) {
  const [show, setShow] = React.useState(false);
  return (
    <div className={`text-xs font-semibold mb-1 flex items-center gap-1.5 ${required ? "text-red-400" : ""}`}>
      <span>{label}</span>
      <span className="relative" style={{ overflow: "visible" }}>
        <span
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
          className={`cursor-help px-1 py-0.5 rounded border select-none ${theme === "dark" ? "border-gray-600 text-gray-400 hover:text-gray-200" : "border-gray-300 text-gray-500 hover:text-gray-700"}`}
          style={{ fontSize: "10px" }}
        >?</span>
        {show && (
          <span
            className={`absolute left-0 top-6 z-[9999] w-52 rounded-lg border p-2 text-xs font-normal shadow-2xl ${theme === "dark" ? "bg-gray-900 border-gray-600 text-gray-200" : "bg-white border-gray-300 text-gray-700"}`}
            style={{ position: "absolute", pointerEvents: "none", whiteSpace: "normal" }}
          >
            <span className="font-bold">{full}</span>{example ? ` — ${example}` : ""}
          </span>
        )}
      </span>
    </div>
  );
}

function InlineStatField({ label, children }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 shrink-0 text-base font-extrabold">{label}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function RollButton({ onClick, disabled, isRolling, isReady, emoji, label, readyClass, rollingClass }) {
  const cls = isRolling
    ? `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-extrabold border transition ${rollingClass} animate-pulse cursor-wait`
    : isReady
      ? `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-extrabold border transition ${readyClass}`
      : "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-extrabold border transition bg-transparent border-gray-500 text-gray-400 cursor-not-allowed opacity-60";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {isRolling ? `${emoji} Rolling…` : `${emoji} ${label}`}
    </button>
  );
}

function Section({ title, theme, children, action }) {
  const panelClass =
    theme === "dark"
      ? "rounded-2xl bg-slate-900 shadow p-3 sm:p-4 border border-gray-700 text-gray-100 overflow-x-hidden overflow-y-visible"
      : "rounded-2xl bg-white shadow p-3 sm:p-4 border border-gray-200 text-gray-900 overflow-x-hidden overflow-y-visible";
  const titleClass =
    theme === "dark"
      ? "text-xl md:text-2xl font-extrabold tracking-wide border-b border-gray-700 pb-2 mb-3"
      : "text-xl md:text-2xl font-extrabold tracking-wide border-b border-gray-200 pb-2 mb-3";
  return (
    <div className={panelClass}>
      <div className={`flex flex-wrap items-center justify-between gap-2 ${titleClass}`}>
        <span className="shrink-0">{title}</span>
        {action && <div className="flex flex-wrap gap-1.5">{action}</div>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function FieldHint({ hint, theme }) {
  const [show, setShow] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });
  const btnRef = React.useRef(null);
  if (!hint) return null;

  const computePos = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const W = 224;
    let left = rect.right - W;
    left = Math.max(8, Math.min(left, window.innerWidth - W - 8));
    setPos({ top: rect.bottom + 6, left });
  };

  return (
    <span className="relative inline-flex">
      <span
        ref={btnRef}
        onMouseEnter={() => { computePos(); setShow(true); }}
        onMouseLeave={() => setShow(false)}
        onClick={(e) => { e.stopPropagation(); computePos(); setShow(s => !s); }}
        className={`cursor-help rounded border px-1 py-0.5 select-none ${theme === "dark" ? "border-gray-600 text-gray-400 hover:text-gray-200" : "border-gray-300 text-gray-500 hover:text-gray-700"}`}
        style={{ fontSize: "10px", lineHeight: 1 }}
      >?</span>
      {show && (
        <span
          className={`fixed z-[9999] rounded-lg border p-2 text-xs font-normal shadow-2xl ${theme === "dark" ? "bg-gray-900 border-gray-600 text-gray-200" : "bg-white border-gray-300 text-gray-700"}`}
          style={{ top: pos.top, left: pos.left, width: "14rem", maxWidth: "calc(100vw - 1rem)", pointerEvents: "none", whiteSpace: "normal" }}
        >{hint}</span>
      )}
    </span>
  );
}

function Field({ label, hint, children, theme }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold tracking-wide">{label}</div>
        <FieldHint hint={hint} theme={theme} />
      </div>
      {children}
    </div>
  );
}

function FillButton({ label, loading, disabled, hasKey, onClick, theme }) {
  const dark = theme === "dark";
  const noKey = !hasKey;
  const title = noKey ? "Add your Claude API key in ⚙ settings" : disabled ? "Type a unit name above first" : label;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled || noKey}
      title={title}
      className={`rounded px-2 py-0.5 text-xs font-bold border transition shrink-0 ${
        loading
          ? "opacity-50 cursor-wait border-blue-500/40 text-blue-300 bg-blue-900/30"
          : noKey || disabled
          ? "opacity-40 cursor-not-allowed border-gray-600 text-gray-500 bg-transparent"
          : dark
          ? "border-blue-500/60 text-blue-300 bg-blue-900/40 hover:bg-blue-800/60"
          : "border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100"
      }`}
    >
      {loading ? "…" : label}
    </button>
  );
}

function LookupSourceBadge({ meta, theme }) {
  if (!meta) return null;
  const dark = theme === "dark";
  const linkClass = `underline ${dark ? "hover:text-gray-200" : "hover:text-gray-700"}`;

  if (meta.source === "live") {
    const ts = meta.fetchedAt ? new Date(meta.fetchedAt) : null;
    const time = ts && !isNaN(ts) ? ts.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }) : "";
    return (
      <p className={`text-xs ${dark ? "text-green-400" : "text-green-600"}`}>
        {meta.resolvedName ? (
          <>
            ✓ {meta.resolvedName} ·{" "}
            <a href={meta.wahapediaUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Wahapedia
            </a>
            {time && <>{" "}· {time}</>}
          </>
        ) : (
          <>
            ✓ Pulled from{" "}
            <a href={meta.wahapediaUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Wahapedia
            </a>
            {time && <>{" "}· {time}</>}
          </>
        )}
      </p>
    );
  }

  return (
    <p className={`text-xs ${dark ? "text-yellow-400" : "text-yellow-600"}`}>
      {meta.resolvedName ? (
        <>
          ⚠ {meta.resolvedName} · training data — verify on{" "}
          <a href={meta.wahapediaUrl || "https://wahapedia.ru"} target="_blank" rel="noopener noreferrer" className={linkClass}>
            Wahapedia
          </a>
        </>
      ) : (
        <>
          ⚠ Training data — verify on{" "}
          <a href={meta.wahapediaUrl || "https://wahapedia.ru"} target="_blank" rel="noopener noreferrer" className={linkClass}>
            Wahapedia
          </a>
        </>
      )}
    </p>
  );
}

function DisambiguationChips({ options, loading, onChoose, theme, label }) {
  if (!options || options.length === 0) return null;
  const dark = theme === "dark";
  const displayLabel = label || "Multiple weapons found — pick one:";
  return (
    <div className="space-y-1">
      <p className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>
        {displayLabel}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={loading}
            onClick={() => onChoose(opt)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition
              ${loading ? "opacity-50 cursor-wait" : "cursor-pointer"}
              ${dark
                ? "border-blue-500 text-blue-300 hover:bg-blue-900/40"
                : "border-blue-400 text-blue-700 hover:bg-blue-50"}`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function HistoryDropdown({ history, onFillWeapon, onFillTarget, theme, mode }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const isDark = theme === "dark";
  const visibleEntries = mode === "defender"
    ? history.history.filter(e => e.targetFields)
    : history.history.filter(e => e.weapons.length > 0);

  if (visibleEntries.length === 0) return null;

  const panelCls = `absolute z-50 mt-1 w-72 max-w-[calc(100vw-1rem)] right-0 rounded-lg border shadow-lg p-2 flex flex-col gap-1 max-h-60 overflow-y-auto
    ${isDark ? "bg-gray-900 border-gray-700 text-gray-100" : "bg-white border-gray-200 text-gray-900"}`;
  const rowCls = `flex items-center rounded px-2 py-1 ${isDark ? "hover:bg-gray-800" : "hover:bg-gray-100"}`;
  const chipCls = `rounded px-2 py-0.5 text-xs font-medium cursor-pointer
    ${isDark ? "bg-gray-700 hover:bg-amber-600 text-gray-200" : "bg-gray-100 hover:bg-amber-200 text-gray-800"}`;
  const removeBtnCls = `ml-2 flex-shrink-0 text-xs px-1 rounded ${isDark ? "hover:bg-red-900 text-gray-400 hover:text-red-300" : "hover:bg-red-100 text-gray-400 hover:text-red-600"}`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`rounded border px-2 py-1 text-xs font-semibold transition
          ${isDark ? "border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-300" : "border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-600"}`}
      >
        Recent {open ? "▴" : "▾"}
      </button>

      {open && (
        <div className={panelCls}>
          {mode === "defender" ? (
            // Defender: flat list — clicking unit name fills target immediately
            visibleEntries.map(entry => (
              <div key={entry.id} className={rowCls}>
                <button
                  type="button"
                  className="flex-1 text-left text-sm font-medium truncate"
                  onClick={() => { onFillTarget(entry.targetFields, entry.unitName, entry.wahapediaUrl, entry.source); setOpen(false); }}
                >
                  {entry.unitName}
                </button>
                <button type="button" className={removeBtnCls} onClick={() => history.removeEntry(entry.id)} title="Remove">✕</button>
              </div>
            ))
          ) : (
            // Attacker: expand unit to see weapon chips
            visibleEntries.map(entry => (
              <div key={entry.id}>
                <div className={rowCls}>
                  <button
                    type="button"
                    className="flex-1 text-left text-sm font-medium truncate"
                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                  >
                    {entry.unitName}
                  </button>
                  <button type="button" className={removeBtnCls} onClick={() => history.removeEntry(entry.id)} title="Remove">✕</button>
                </div>
                {expanded === entry.id && (
                  <div className="flex flex-wrap gap-1 px-2 pb-1">
                    {entry.weapons.map(w => (
                      <button
                        key={w.label}
                        type="button"
                        className={chipCls}
                        onClick={() => { onFillWeapon(w.fields, entry.unitName, w.label, entry.wahapediaUrl, entry.source); setOpen(false); }}
                        title={`Fill weapon fields: ${w.label}`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}

          <button
            type="button"
            className={`mt-1 text-xs text-center py-1 rounded ${isDark ? "text-gray-500 hover:text-red-400 hover:bg-gray-800" : "text-gray-400 hover:text-red-500 hover:bg-gray-50"}`}
            onClick={() => { history.clearAll(); setOpen(false); }}
          >
            Clear all history
          </button>
        </div>
      )}
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


function DiceColorBar({ rollsText, target, mod = 0, theme }) {
  if (!target || target <= 0) return null;
  const rolls = parseDiceList(rollsText);
  if (rolls.length === 0) return null;
  const dark = theme === "dark";
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {rolls.map((d, i) => {
        const success = d !== 1 && (d + mod) >= target;
        return (
          <span key={i} className={`inline-flex items-center justify-center min-w-[1.4rem] h-5 px-0.5 rounded text-xs font-bold leading-none ${
            success
              ? (dark ? "bg-green-700/70 text-green-100" : "bg-green-600/80 text-white")
              : (dark ? "bg-orange-700/70 text-orange-100" : "bg-orange-500/80 text-white")
          }`}>{d}</span>
        );
      })}
    </div>
  );
}

function WeaponStatTable({
  attacksFixed, setAttacksFixed, attacksValue, setAttacksValue,
  modelQty, setModelQty,
  toHit, setToHit,
  strength, setStrength,
  ap, setAp,
  damageFixed, setDamageFixed, damageValue, setDamageValue,
  torrent, overwatch,
  isNum, theme
}) {
  const dark = theme === "dark";
  const border = dark ? "border-gray-600" : "border-gray-300";
  const divider = dark ? "border-gray-700" : "border-gray-200";
  const hdrBg = dark ? "bg-gray-800/80 text-gray-400" : "bg-gray-100 text-gray-600";
  const inputCls = `w-full text-center font-bold p-1.5 bg-transparent focus:outline-none text-xl`;
  const attacksErr = attacksFixed ? !isNum(attacksValue) : !parseDiceSpec(attacksValue).ok;
  const damageErr = damageFixed ? !isNum(damageValue) : (damageValue.trim() !== "" && !parseDiceSpec(damageValue).ok);
  return (
    <div className={`rounded-lg border overflow-hidden ${border}`}>
      <div className={`grid grid-cols-6 text-center text-xs font-bold uppercase tracking-wide border-b ${hdrBg} ${dark ? "border-gray-600" : "border-gray-300"}`}>
        <div className={`py-1.5 px-0.5 border-r ${divider} flex items-center justify-center`} title="Models attacking">Qty</div>
        <div className={`py-1 px-0.5 border-r ${divider} flex flex-col items-center gap-0.5`}>
          <span>A</span>
          <button type="button"
            onClick={() => setAttacksFixed(!attacksFixed)}
            title={attacksFixed ? "Fixed — click for random" : "Random — click for fixed"}
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold leading-none transition-colors ${
              attacksFixed
                ? (dark ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-gray-200 text-gray-600 hover:bg-gray-300")
                : "bg-amber-500 text-gray-950 hover:bg-amber-400"
            }`}>
            {attacksFixed ? "Fixed" : "Rng 🎲"}
          </button>
        </div>
        <div className={`py-1.5 px-0.5 border-r ${divider} flex items-center justify-center`} title="Ballistic/Weapon Skill (e.g. 4 = roll 4+)">BS</div>
        <div className={`py-1.5 px-0.5 border-r ${divider} flex items-center justify-center`} title="Strength">S</div>
        <div className={`py-1.5 px-0.5 border-r ${divider} flex items-center justify-center`} title="Armour Penetration">AP</div>
        <div className={`py-1 px-0.5 flex flex-col items-center gap-0.5`}>
          <span>D</span>
          <button type="button"
            onClick={() => setDamageFixed(!damageFixed)}
            title={damageFixed ? "Fixed — click for random" : "Random — click for fixed"}
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold leading-none transition-colors ${
              damageFixed
                ? (dark ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-gray-200 text-gray-600 hover:bg-gray-300")
                : "bg-amber-500 text-gray-950 hover:bg-amber-400"
            }`}>
            {damageFixed ? "Fixed" : "Rng 🎲"}
          </button>
        </div>
      </div>
      <div className={`grid grid-cols-6 divide-x ${dark ? "divide-gray-700 bg-gray-900/10" : "divide-gray-200 bg-white"}`}>
        <input type="number" min="1" max="20" inputMode="numeric" value={modelQty ?? 1}
          onChange={e => setModelQty(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
          className={`${inputCls} ${dark ? "text-gray-100" : "text-gray-900"}`}
          title="Number of models attacking (max 20)" />
        <input value={attacksValue}
          onChange={e => {
            if (attacksFixed) {
              const digits = e.target.value.replace(/[^0-9]/g, "");
              const n = parseInt(digits, 10);
              setAttacksValue(digits === "" ? "" : String(Math.min(20, isNaN(n) ? 0 : n)));
            } else {
              setAttacksValue(e.target.value.replace(/[^0-9dD+]/g, "").toUpperCase());
            }
          }}
          inputMode={attacksFixed ? "numeric" : "text"}
          placeholder={attacksFixed ? "#" : "D6"}
          title={attacksFixed ? "Fixed attacks per model (max 20)" : "Dice expression e.g. D6, 2D3+1"}
          className={`${inputCls} ${attacksErr ? "text-red-400" : dark ? "text-gray-100" : "text-gray-900"}`} />
        {(torrent || overwatch) ? (
          <div className={`${inputCls} flex items-center justify-center text-sm font-bold opacity-40 ${dark ? "text-gray-400" : "text-gray-500"}`}>
            {overwatch ? "6+" : "N/A"}
          </div>
        ) : (
          <input type="number" value={toHit} onChange={e => setToHit(e.target.value)} placeholder="4"
            className={`${inputCls} ${!isNum(toHit) ? "text-red-400" : dark ? "text-gray-100" : "text-gray-900"}`} />
        )}
        <input type="number" value={strength} onChange={e => setStrength(e.target.value)} placeholder="4"
          className={`${inputCls} ${!isNum(strength) ? "text-red-400" : dark ? "text-gray-100" : "text-gray-900"}`} />
        <input type="number" value={ap}
          onChange={e => { const raw = e.target.value; if (raw === "" || raw === "-") { setAp(raw); return; } const n = parseFloat(raw); if (!isNaN(n)) setAp(String(Math.min(0, -Math.abs(n)))); }}
          placeholder="0"
          className={`${inputCls} ${!isNum(ap) ? "text-red-400" : dark ? "text-gray-100" : "text-gray-900"}`} />
        <input value={damageValue}
          onChange={e => { if (damageFixed) { const raw = e.target.value; if (raw === "") { setDamageValue(""); return; } const n = parseInt(raw, 10); if (!isNaN(n)) setDamageValue(String(Math.max(1, n))); } else { setDamageValue(e.target.value.replace(/[^0-9dD+]/g, "").toUpperCase()); } }}
          inputMode={damageFixed ? "numeric" : "text"}
          type={damageFixed ? "number" : "text"}
          placeholder={damageFixed ? "#" : "D6"}
          className={`${inputCls} ${damageErr ? "text-red-400" : dark ? "text-gray-100" : "text-gray-900"}`} />
      </div>
    </div>
  );
}

function TargetStatTable({
  toughness, setToughness,
  armorSave, setArmorSave,
  invulnSave, setInvulnSave,
  fnpEnabled, setFnpEnabled,
  fnp, setFnp,
  setFnpRollsText,
  isNum, theme
}) {
  const dark = theme === "dark";
  const border = dark ? "border-gray-600" : "border-gray-300";
  const divider = dark ? "border-gray-700" : "border-gray-200";
  const hdrBg = dark ? "bg-gray-800/80 text-gray-400" : "bg-gray-100 text-gray-600";
  const inputCls = `w-full text-center font-bold p-1.5 bg-transparent focus:outline-none text-xl`;
  return (
    <div className={`rounded-lg border overflow-hidden ${border}`}>
      <div className={`grid grid-cols-4 text-center text-xs font-bold uppercase tracking-wide border-b ${hdrBg} ${dark ? "border-gray-600" : "border-gray-300"}`}>
        <div className={`py-1 border-r ${divider}`} title="Toughness">T</div>
        <div className={`py-1 border-r ${divider}`} title="Armour Save (e.g. 3 means 3+)">Sv+</div>
        <div className={`py-1 border-r ${divider}`} title="Invulnerable Save (optional)">Inv+</div>
        <div className={`py-1 flex items-center justify-center gap-1`} title="Feel No Pain">
          FNP+
          <input type="checkbox" checked={fnpEnabled} className="h-3 w-3 accent-amber-400"
            onChange={e => { const on = e.target.checked; setFnpEnabled(on); if (!on) { setFnp(""); setFnpRollsText(""); } }} />
        </div>
      </div>
      <div className={`grid grid-cols-4 divide-x ${dark ? "divide-gray-700 bg-gray-900/10" : "divide-gray-200 bg-white"}`}>
        <input type="text" inputMode="numeric" value={toughness} onChange={e => setToughness(e.target.value)} placeholder="4"
          className={`${inputCls} ${!isNum(toughness) ? "text-red-400" : dark ? "text-gray-100" : "text-gray-900"}`} />
        <input type="text" inputMode="numeric" value={armorSave} onChange={e => setArmorSave(e.target.value)} placeholder="3"
          className={`${inputCls} ${!isNum(armorSave) ? "text-red-400" : dark ? "text-gray-100" : "text-gray-900"}`} />
        <input type="text" inputMode="numeric" value={invulnSave} onChange={e => setInvulnSave(e.target.value)} placeholder="—"
          className={`${inputCls} ${dark ? "text-gray-100" : "text-gray-900"}`} />
        <input type="text" inputMode="numeric" value={fnp} onChange={e => setFnp(e.target.value)}
          disabled={!fnpEnabled} placeholder={fnpEnabled ? "5" : "—"}
          className={`${inputCls} disabled:opacity-30 ${dark ? "text-gray-100" : "text-gray-900"}`} />
      </div>
    </div>
  );
}

function getCursorOffset(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return 0;
  const pre = sel.getRangeAt(0).cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
  return pre.toString().length;
}

function setCursorOffset(el, offset) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let rem = offset;
  let placed = false;
  const walk = (node) => {
    if (placed) return;
    if (node.nodeType === 3) {
      if (rem <= node.nodeValue.length) { range.setStart(node, rem); range.collapse(true); placed = true; }
      else rem -= node.nodeValue.length;
    } else for (const c of node.childNodes) walk(c);
  };
  walk(el);
  if (!placed) { range.selectNodeContents(el); range.collapse(false); }
  sel.removeAllRanges();
  sel.addRange(range);
}

function ColoredDiceInput({ value, onChange, className, target, mod = 0, theme, placeholder, disabled }) {
  const divRef = React.useRef(null);
  const focused = React.useRef(false);
  const dark = theme === "dark";

  const buildHtml = React.useCallback((val) => {
    const rolls = parseDiceList(val);
    if (!rolls.length || !target) return val || "";
    return rolls.map(d => {
      const success = d !== 1 && (d + mod) >= target;
      const color = success
        ? (dark ? "#4ade80" : "#16a34a")
        : (dark ? "#fb923c" : "#f97316");
      return `<span style="color:${color};font-weight:700">${d}</span>`;
    }).join(" ");
  }, [target, mod, dark]);

  // Sync innerHTML for external changes (rolling, loading) — only when not focused
  React.useEffect(() => {
    if (focused.current || !divRef.current) return;
    const html = buildHtml(value);
    if (divRef.current.innerHTML !== html) divRef.current.innerHTML = html;
  });

  const extractValue = (trim = true) => {
    const raw = (divRef.current?.innerText || "").replace(/[^0-9]/g, " ").replace(/\s+/g, " ");
    return trim ? raw.trim() : raw.trimStart();
  };

  const handleInput = () => {
    if (!divRef.current) return;
    const offset = getCursorOffset(divRef.current);
    const text = extractValue(false); // preserve trailing space while typing
    const trimmed = text.trimEnd();
    // preserve trailing space in HTML so cursor stays past the last die
    const html = buildHtml(trimmed) + (text.endsWith(" ") ? " " : "");
    divRef.current.innerHTML = html;
    setCursorOffset(divRef.current, offset);
    onChange({ target: { value: trimmed } });
  };

  const handleFocus = () => { focused.current = true; };

  const handleBlur = () => {
    focused.current = false;
    onChange({ target: { value: extractValue(true) } });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); return; }
    const pass = /^[0-9 ]$/.test(e.key) ||
      ["Backspace","Delete","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","Tab"].includes(e.key) ||
      e.ctrlKey || e.metaKey;
    if (!pass) e.preventDefault();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData.getData("text") || "").replace(/[^0-9]/g, " ").replace(/\s+/g, " ").trim();
    document.execCommand("insertText", false, text);
  };

  return (
    <div
      ref={divRef}
      contentEditable={!disabled}
      suppressContentEditableWarning
      onInput={handleInput}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      data-placeholder={placeholder}
      className={`${className} outline-none cursor-text nape-dice-input`}
      style={{ minHeight: "2.5rem", alignContent: "center", whiteSpace: "pre-wrap" }}
    />
  );
}

function Chip({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-600 px-2 py-0.5 text-xs bg-gray-800 text-gray-100">
      {children}
    </span>
  );
}

// KeywordGroup: selected keywords are pinned/always-visible; unselected ones collapse behind a toggle.
// When `label` is provided the toggle button sits inline with the label row (never shifts layout).
// When no `label`, the toggle sits at the top of the list.
function KeywordGroup({ items, theme, label, hint }) {
  const [expanded, setExpanded] = React.useState(false);
  const dark = theme === "dark";
  const active = items.filter(i => i.checked);
  const inactive = items.filter(i => !i.checked);
  const toggleBtn = inactive.length > 0 ? (
    <button
      type="button"
      onClick={() => setExpanded(e => !e)}
      className={`text-xs px-2 py-0.5 rounded border transition ${dark ? "border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500" : "border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400"}`}
    >
      {expanded ? "▾ fewer keywords" : `▸ ${inactive.length} more keyword${inactive.length !== 1 ? "s" : ""}`}
    </button>
  ) : null;
  return (
    <div className="flex flex-col gap-1 text-sm">
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-wide">{label}</span>
            {toggleBtn}
          </div>
          <FieldHint hint={hint} theme={theme} />
        </div>
      ) : toggleBtn ? (
        <div>{toggleBtn}</div>
      ) : null}
      {active.map(i => <div key={i.key}>{i.node}</div>)}
      {expanded && (
        <div onChange={() => setExpanded(false)}>
          {inactive.map(i => <div key={i.key}>{i.node}</div>)}
        </div>
      )}
    </div>
  );
}

// ─── Monte Carlo probability engine ─────────────────────────────────────────

function rollD(sides) { return Math.ceil(Math.random() * sides); }

function simulateOnce({
  attacksFixed, attacksValue, attacksRolls, modelQty,
  rapidFire, rapidFireX, halfRange,
  blastEnabled, blastUnitSize,
  toHit, hitMod, overwatch,
  strength, ap, lance,
  damageFixed, damageValue,
  critHitThreshold, critWoundThreshold,
  antiXEnabled, antiXThreshold,
  torrent, lethalHits, sustainedHits, sustainedHitsN,
  devastatingWounds,
  rerollHitOnes, rerollHitFails,
  rerollWoundOnes, rerollWoundFails, twinLinked,
  toughness, armorSave, invulnSave,
  inCover, ignoreAp, saveMod,
  ignoreFirstFailedSave, minusOneDamage, halfDamage,
  fnpEnabled, fnp,
  meltaEnabled, meltaX,
  woundMod,
}) {
  const modelQtyNum = Math.max(1, parseInt(String(modelQty || "1"), 10) || 1);

  // Attacks
  let A = 0;
  if (attacksFixed) {
    A = Math.max(0, parseInt(String(attacksValue || "0"), 10) || 0) * modelQtyNum;
  } else {
    const spec = parseDiceSpec(attacksRolls);
    if (spec.ok) A = (Array.from({ length: spec.n * modelQtyNum }, () => rollD(spec.sides)).reduce((s, d) => s + d, 0) + spec.mod * modelQtyNum);
  }
  if (rapidFire && halfRange) A += Math.max(0, parseInt(String(rapidFireX || "0"), 10) || 0) * modelQtyNum;
  if (blastEnabled) A += Math.floor((parseInt(String(blastUnitSize || "0"), 10) || 0) / 5);

  // Hit phase
  const effectiveToHit = overwatch ? 6 : (Number(toHit) || 7);
  const hitModCapped = overwatch ? 0 : clampModPlusMinusOne(Number(hitMod) || 0);
  const critHitThr = Number(critHitThreshold) || 6;
  const effectiveCritWoundThr = antiXEnabled ? Math.max(2, Math.min(6, Number(antiXThreshold) || 6)) : (Number(critWoundThreshold) || 6);
  const woundModNum = Number(woundMod) || 0;

  let autoWoundsFromLethal = 0;
  let sustainedExtra = 0;
  const hitRolls = [];

  if (torrent) {
    for (let i = 0; i < A; i++) hitRolls.push({ success: true, crit: false });
  } else {
    for (let i = 0; i < A; i++) {
      let d = rollD(6);
      const success = d !== 1 && (d + hitModCapped) >= effectiveToHit;
      const crit = d >= critHitThr;
      if (!success && (rerollHitOnes && d === 1) || (rerollHitFails && !success)) d = rollD(6);
      const success2 = d !== 1 && (d + hitModCapped) >= effectiveToHit;
      const crit2 = d >= critHitThr;
      const finalSuccess = success || success2;
      const finalCrit = (success && crit) || (!success && success2 && crit2);
      hitRolls.push({ success: finalSuccess, crit: finalCrit });
    }
    for (const h of hitRolls) {
      if (h.success && h.crit) {
        if (sustainedHits) sustainedExtra += Math.max(0, Number(sustainedHitsN) || 0);
        if (lethalHits) autoWoundsFromLethal++;
      }
    }
  }

  const baseHits = hitRolls.filter(h => h.success).length;
  const woundRollPool = Math.max(0, baseHits + sustainedExtra - autoWoundsFromLethal);

  // Wound phase
  const needed = woundTargetNumber(Number(strength) || 0, Number(toughness) || 0);
  const effectiveAp = lance ? Math.max(-6, (Number(ap) || 0) - 1) : (Number(ap) || 0);
  let woundSuccesses = 0;
  let critWounds = 0;

  for (let i = 0; i < woundRollPool; i++) {
    let d = rollD(6);
    const autoWound = antiXEnabled && d !== 1 && d >= effectiveCritWoundThr;
    let success = autoWound || (d !== 1 && (d + woundModNum) >= needed);
    if (!success && (rerollWoundOnes && d === 1) || ((rerollWoundFails || twinLinked) && !success)) {
      d = rollD(6);
      const autoWound2 = antiXEnabled && d !== 1 && d >= effectiveCritWoundThr;
      success = autoWound2 || (d !== 1 && (d + woundModNum) >= needed);
    }
    if (success) { woundSuccesses++; if (d >= effectiveCritWoundThr) critWounds++; }
  }

  const totalWounds = woundSuccesses + autoWoundsFromLethal;
  let savableWounds = totalWounds;
  let mortalWounds = 0;
  if (devastatingWounds) { mortalWounds = Math.min(critWounds, totalWounds); savableWounds = totalWounds - mortalWounds; }

  // Save phase
  const armorWithCover = inCover ? Math.max(1, (Number(armorSave) || 7) - 1) : (Number(armorSave) || 7);
  const apForSave = ignoreAp ? 0 : effectiveAp;
  const saveModCapped = clampModPlusMinusOne(Number(saveMod) || 0);
  const saveTarget = clampMin2Plus(chooseSaveTarget(armorWithCover, Number(invulnSave) || 0, apForSave));
  let failedSaves = 0;
  for (let i = 0; i < savableWounds; i++) {
    const d = rollD(6);
    if (d === 1 || (d + saveModCapped) < saveTarget) failedSaves++;
  }
  if (ignoreFirstFailedSave) failedSaves = Math.max(0, failedSaves - 1);

  // Damage phase
  const dmgSpec = parseDiceSpec(String(damageValue || "1"));
  let totalDmg = mortalWounds;
  for (let i = 0; i < failedSaves; i++) {
    let dmg = damageFixed ? (parseInt(String(damageValue || "1"), 10) || 1) : (dmgSpec.ok ? rollD(dmgSpec.sides) + dmgSpec.mod : 1);
    if (meltaEnabled) dmg += Math.max(0, Number(meltaX) || 0);
    if (minusOneDamage) dmg = Math.max(1, dmg - 1);
    if (halfDamage) dmg = Math.max(1, Math.ceil(dmg / 2));
    // FNP
    if (fnpEnabled && Number(fnp) >= 2) {
      let saved = 0;
      for (let j = 0; j < dmg; j++) { if (rollD(6) >= Number(fnp)) saved++; }
      dmg = Math.max(0, dmg - saved);
    }
    totalDmg += dmg;
  }
  return totalDmg;
}

function computeTheoreticalMax({
  attacksFixed, attacksValue, attacksRolls, modelQty,
  rapidFire, rapidFireX,
  blastEnabled, blastUnitSize,
  sustainedHits, sustainedHitsN,
  damageFixed, damageValue,
  meltaEnabled, meltaX,
}) {
  const qty = Math.max(1, parseInt(String(modelQty || "1"), 10) || 1);

  // Max attacks
  let maxA;
  if (attacksFixed) {
    maxA = (parseInt(String(attacksValue || "0"), 10) || 0) * qty;
  } else {
    const spec = parseDiceSpec(attacksRolls);
    maxA = spec.ok ? (spec.sides * spec.n + spec.mod) * qty : 0;
  }
  if (rapidFire) maxA += (parseInt(String(rapidFireX || "0"), 10) || 0) * qty;
  if (blastEnabled) maxA += Math.floor((parseInt(String(blastUnitSize || "0"), 10) || 0) / 5);

  // Sustained hits: in the max case every attack is a crit → each generates N extra hits
  if (sustainedHits) maxA += maxA * (Number(sustainedHitsN) || 1);

  // Max damage per wound (all save, all hit, all wound assumed)
  let maxDmgPerWound;
  if (damageFixed) {
    maxDmgPerWound = parseInt(String(damageValue || "1"), 10) || 1;
  } else {
    const spec = parseDiceSpec(String(damageValue || "1"));
    maxDmgPerWound = spec.ok ? spec.sides * spec.n + spec.mod : 1;
  }
  if (meltaEnabled) maxDmgPerWound += Math.max(0, Number(meltaX) || 0);

  return Math.max(0, maxA * maxDmgPerWound);
}

function runMonteCarlo(params, iterations = 50000) {
  const counts = {};
  for (let i = 0; i < iterations; i++) {
    const dmg = simulateOnce(params);
    counts[dmg] = (counts[dmg] || 0) + 1;
  }
  const maxDmg = Math.max(...Object.keys(counts).map(Number));
  const dist = [];
  for (let d = 0; d <= maxDmg; d++) {
    dist.push({ damage: d, prob: (counts[d] || 0) / iterations });
  }
  const expected = dist.reduce((s, { damage, prob }) => s + damage * prob, 0);
  // cumulative P(≥x) for each damage value
  let cumulative = 1;
  const withCumulative = dist.map(row => {
    const result = { ...row, atLeast: cumulative };
    cumulative -= row.prob;
    return result;
  });
  return { dist: withCumulative, expected, maxDmg };
}

function ProbabilityPanel({ params, theme, statsReady }) {
  const dark = theme === "dark";
  const [tableOpen, setTableOpen] = React.useState(false);
  const result = React.useMemo(() => {
    if (!statsReady) return null;
    return runMonteCarlo(params);
  }, [statsReady, JSON.stringify(params)]);  // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/use-memo

  if (!statsReady) {
    return (
      <div className={`text-sm text-center py-4 ${dark ? "text-gray-500" : "text-gray-400"}`}>
        Fill in weapon and target stats to see probability distribution.
      </div>
    );
  }
  if (!result) return null;

  const { dist, expected } = result;
  const maxProb = Math.max(...dist.map(r => r.prob));
  const median = dist.find(r => r.atLeast <= 0.5)?.damage ?? 0;
  const mode = dist.reduce((best, r) => r.prob > best.prob ? r : best, dist[0]).damage;
  const TAIL_THRESHOLD = 0.001; // 0.1%
  const visibleDist = dist.filter(r => r.prob >= TAIL_THRESHOLD);
  const tailDist    = dist.filter(r => r.prob > 0 && r.prob < TAIL_THRESHOLD);

  // SVG chart dimensions — extra bottom margin for legend + x labels
  const W = 560, H = 250;
  const ML = 44, MR = 48, MT = 20, MB = 52;
  const cW = W - ML - MR;
  const cH = H - MT - MB;
  const n = visibleDist.length;
  const slotW = n > 1 ? cW / n : cW;
  const barW = Math.max(4, slotW * 0.55);

  const xOf = i => ML + slotW * i + slotW / 2;
  // Left axis: actual probability scale, rounded up to a nice ceiling
  const rawMaxPct = maxProb * 100;
  const yMaxPct = rawMaxPct <= 15 ? Math.ceil(rawMaxPct / 5) * 5
                : rawMaxPct <= 35 ? Math.ceil(rawMaxPct / 10) * 10
                : rawMaxPct <= 60 ? Math.ceil(rawMaxPct / 20) * 20
                : Math.ceil(rawMaxPct / 25) * 25;
  const yLine = atLeast => MT + cH * (1 - atLeast);

  const barCol   = dark ? "#f59e0b" : "#d97706";
  const lineCol  = dark ? "#60a5fa" : "#2563eb";
  const gridCol  = dark ? "#374151" : "#e5e7eb";
  const labelCol = dark ? "#9ca3af" : "#6b7280";
  const axisCol  = dark ? "#4b5563" : "#d1d5db";
  const modeCol  = dark ? "#f59e0b" : "#d97706";
  const medCol   = dark ? "#818cf8" : "#6366f1";
  const expCol   = dark ? "#6ee7b7" : "#059669";

  // Left Y-axis grid steps (actual probability %)
  const leftSteps = Array.from({ length: 5 }, (_, i) => Math.round(yMaxPct * i / 4));
  // Right Y-axis grid steps (cumulative %)
  const rightSteps = [0, 25, 50, 75, 100];

  // P(≥x) polyline
  const linePoints = visibleDist.map((r, i) => `${xOf(i)},${yLine(r.atLeast)}`).join(" ");

  // Expected value X position (interpolated between slots)
  const expX = (() => {
    if (n < 2) return null;
    const first = visibleDist[0].damage;
    const last  = visibleDist[n - 1].damage;
    const span  = last - first || 1;
    return ML + ((expected - first) / span) * (cW - slotW) + slotW / 2;
  })();

  // Legend row height (bottom of chart area + x labels + gap)
  const legendY = MT + cH + 38;

  return (
    <div className="space-y-3">
      {/* Chart */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 280 }}>

        {/* Left axis label — rotated "Probability %" */}
        <text transform={`rotate(-90)`} x={-(MT + cH / 2)} y={12} textAnchor="middle" fontSize="9" fill={labelCol}>Probability %</text>

        {/* Right axis label — rotated "P(≥x)" */}
        <text transform={`rotate(90)`} x={MT + cH / 2} y={-(W - 11)} textAnchor="middle" fontSize="9" fill={lineCol} fillOpacity="0.8">P(≥x)</text>

        {/* Grid lines — left scale (prob) */}
        {leftSteps.map(pct => {
          const y = MT + cH * (1 - pct / yMaxPct);
          return (
            <g key={`l${pct}`}>
              <line x1={ML} x2={ML + cW} y1={y} y2={y} stroke={gridCol} strokeWidth="0.5" strokeDasharray="3,3" />
              <text x={ML - 5} y={y + 3.5} textAnchor="end" fontSize="9" fill={labelCol}>{pct}%</text>
            </g>
          );
        })}

        {/* Right axis tick labels (cumulative %) */}
        {rightSteps.map(pct => {
          const y = MT + cH * (1 - pct / 100);
          return (
            <text key={`r${pct}`} x={ML + cW + 5} y={y + 3.5} textAnchor="start" fontSize="9" fill={lineCol} fillOpacity="0.8">{pct}%</text>
          );
        })}

        {/* Axis lines */}
        <line x1={ML} x2={ML} y1={MT} y2={MT + cH} stroke={axisCol} strokeWidth="1" />
        <line x1={ML + cW} x2={ML + cW} y1={MT} y2={MT + cH} stroke={lineCol} strokeWidth="0.5" opacity="0.4" />
        <line x1={ML} x2={ML + cW} y1={MT + cH} y2={MT + cH} stroke={axisCol} strokeWidth="1" />

        {/* Expected value line */}
        {expX && <line x1={expX} x2={expX} y1={MT} y2={MT + cH} stroke={expCol} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.85" />}
        {expX && <text x={expX} y={MT - 4} textAnchor="middle" fontSize="8" fill={expCol} fontWeight="bold">E={expected.toFixed(1)}</text>}

        {/* Median indicator line */}
        {(() => {
          const mi = visibleDist.findIndex(r => r.damage === median);
          if (mi < 0) return null;
          const mx = xOf(mi);
          return <line x1={mx} x2={mx} y1={MT} y2={MT + cH} stroke={medCol} strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />;
        })()}

        {/* Bars */}
        {visibleDist.map((r, i) => {
          const x   = xOf(i) - barW / 2;
          const barH = Math.max(0, cH * (r.prob * 100) / yMaxPct);
          const y   = MT + cH - barH;
          const isMode = r.damage === mode;
          const isMed  = r.damage === median;
          return (
            <g key={r.damage}>
              <rect x={x} y={y} width={barW} height={barH}
                fill={isMode ? modeCol : isMed ? medCol : barCol}
                fillOpacity={isMode ? 1 : isMed ? 0.85 : 0.6}
                rx="2" />
              {/* Mode crown */}
              {isMode && <text x={xOf(i)} y={y - 3} textAnchor="middle" fontSize="9" fill={modeCol} fontWeight="bold">▲</text>}
              {/* Median dot */}
              {isMed && !isMode && <text x={xOf(i)} y={y - 3} textAnchor="middle" fontSize="9" fill={medCol}>◆</text>}
              {/* Damage label */}
              <text x={xOf(i)} y={MT + cH + 13} textAnchor="middle" fontSize="9" fill={labelCol}>{r.damage}</text>
              {/* Prob label — inside bar if wide+tall enough, above bar if tall but narrow */}
              {barH > 16 && barW >= 28 && (
                <text x={xOf(i)} y={y + 10} textAnchor="middle" fontSize="8" fill={dark ? "#1f2937" : "#fff"} fontWeight="bold">
                  {(r.prob * 100).toFixed(1)}%
                </text>
              )}
              {barH > 16 && barW < 28 && (
                <>
                  <rect x={xOf(i) - 13} y={y - (isMode || isMed ? 26 : 14)} width="26" height="11" rx="2"
                    fill={dark ? "#111827" : "#f9fafb"} fillOpacity="0.85" />
                  <text x={xOf(i)} y={y - (isMode || isMed ? 17 : 5)} textAnchor="middle" fontSize="8" fill={dark ? "#d1d5db" : "#374151"} fontWeight="bold">
                    {(r.prob * 100).toFixed(1)}%
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* P(≥x) line */}
        <polyline points={linePoints} fill="none" stroke={lineCol} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {visibleDist.map((r, i) => (
          <circle key={r.damage} cx={xOf(i)} cy={yLine(r.atLeast)} r="2.5" fill={lineCol} />
        ))}

        {/* X axis label */}
        <text x={ML + cW / 2} y={MT + cH + 26} textAnchor="middle" fontSize="9" fill={labelCol}>Damage</text>

        {/* Legend row */}
        <rect x={ML} y={legendY} width="8" height="8" fill={barCol} fillOpacity="0.65" rx="1" />
        <text x={ML + 11} y={legendY + 7} fontSize="8" fill={labelCol}>Prob %</text>

        <line x1={ML + 52} x2={ML + 62} y1={legendY + 4} y2={legendY + 4} stroke={lineCol} strokeWidth="2" />
        <circle cx={ML + 57} cy={legendY + 4} r="2.5" fill={lineCol} />
        <text x={ML + 65} y={legendY + 7} fontSize="8" fill={labelCol}>P(≥x)</text>

        <line x1={ML + 102} x2={ML + 112} y1={legendY + 4} y2={legendY + 4} stroke={expCol} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.85" />
        <text x={ML + 115} y={legendY + 7} fontSize="8" fill={labelCol}>E[dmg]</text>

        <text x={ML + 152} y={legendY + 7} fontSize="9" fill={modeCol} fontWeight="bold">▲</text>
        <text x={ML + 162} y={legendY + 7} fontSize="8" fill={labelCol}>Mode</text>

        <text x={ML + 200} y={legendY + 7} fontSize="9" fill={medCol}>◆</text>
        <text x={ML + 210} y={legendY + 7} fontSize="8" fill={labelCol}>Median</text>
      </svg>

      {/* Compact data table — collapsible */}
      {/* Compact data table — collapsible */}
      <div>
        <button type="button" onClick={() => setTableOpen(o => !o)}
          className={`text-xs flex items-center gap-1 ${dark ? "text-gray-500 hover:text-gray-300" : "text-gray-400 hover:text-gray-600"} transition`}>
          {tableOpen ? "▾" : "▸"} {tableOpen ? "Hide" : "Show"} data table
        </button>
        {tableOpen && (
          <div className={`font-mono text-xs space-y-0.5 mt-1`}>
            <div className={`grid gap-x-2 mb-1 font-bold uppercase tracking-wide ${dark ? "text-gray-500" : "text-gray-400"}`}
              style={{ gridTemplateColumns: "3ch 6ch 6ch" }}>
              <span>Dmg</span><span className="text-right">Prob</span><span className="text-right">P(≥x)</span>
            </div>
            {visibleDist.map(({ damage, prob, atLeast }) => {
              const isMode = damage === mode;
              const isMed = damage === median;
              return (
                <div key={damage}
                  className={`grid gap-x-2 rounded px-1 ${isMode ? (dark ? "bg-amber-900/30" : "bg-amber-50") : isMed ? (dark ? "bg-indigo-900/30" : "bg-indigo-50") : ""}`}
                  style={{ gridTemplateColumns: "3ch 6ch 6ch" }}>
                  <span className={`tabular-nums ${dark ? "text-gray-300" : "text-gray-700"}`}>
                    {damage}{isMode ? " ◀" : isMed && !isMode ? " ·" : ""}
                  </span>
                  <span className={`tabular-nums text-right ${dark ? "text-gray-300" : "text-gray-700"}`}>{(prob * 100).toFixed(1)}%</span>
                  <span className={`tabular-nums text-right ${dark ? "text-blue-400" : "text-blue-600"}`}>{(atLeast * 100).toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div className={`pt-2 border-t text-xs flex gap-4 flex-wrap ${dark ? "border-gray-700 text-gray-400" : "border-gray-200 text-gray-500"}`}>
        <span>E[dmg] = <span className={`font-bold ${dark ? "text-emerald-400" : "text-emerald-700"}`}>{expected.toFixed(2)}</span></span>
        <span>Median = <span className={`font-bold ${dark ? "text-white" : "text-gray-900"}`}>{median}</span></span>
        <span>Mode = <span className={`font-bold ${dark ? "text-amber-400" : "text-amber-600"}`}>{mode}</span></span>
        <span>P(≥{Math.round(expected)}) = <span className={`font-bold ${dark ? "text-white" : "text-gray-900"}`}>{((dist.find(r => r.damage === Math.round(expected))?.atLeast || 0) * 100).toFixed(0)}%</span></span>
        <span className={`ml-auto ${dark ? "text-gray-600" : "text-gray-300"}`}>50k runs</span>
      </div>

      {/* Tail note */}
      {(() => {
        const theoreticalMax = computeTheoreticalMax(params);
        const simTailMin = tailDist.length > 0 ? tailDist[0].damage : null;
        const simTailMax = tailDist.length > 0 ? tailDist[tailDist.length - 1].damage : null;
        const chartMax = visibleDist.length > 0 ? visibleDist[visibleDist.length - 1].damage : null;
        const rangeStart = simTailMin ?? (chartMax != null ? chartMax + 1 : null);
        const rangeEnd = theoreticalMax > (simTailMax ?? 0) ? theoreticalMax : simTailMax;
        if (rangeStart == null || rangeEnd == null || rangeEnd <= (chartMax ?? 0)) return null;
        return (
          <div className={`text-xs mt-1 ${dark ? "text-gray-600" : "text-gray-400"}`}>
            Tail (&lt;0.1%): {rangeStart}–{rangeEnd} dmg
            {theoreticalMax > (simTailMax ?? 0) && (
              <span className={dark ? "text-gray-700" : "text-gray-300"}> · theoretical max: {theoreticalMax}</span>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function damageViz(total) {
  // Provides both the damage emojis and a cohesive page theme.
  // Tailwind classes are kept literal for JIT safety.
  if (total <= 0) {
    return {
      title: "Harmless",
      emoji: "🦾🛡️✨",
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
      emoji: "🤕👊💫",
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
      emoji: "💀💥💢",
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
      emoji: "☠️🩸🔥",
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
    emoji: "🩻☢️🕳️",
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
  torrent,
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
                    value={damageValue} onChange={e => { const raw = e.target.value; if (raw === "") { setDamageValue(""); return; } const n = parseInt(raw, 10); if (!isNaN(n)) setDamageValue(String(Math.max(1, n))); }}
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
    </div>
  );
}



function AttackCalculator() {

  // Theme (dark default, manual toggle)
  // ─────────────────────────────────────────
  // State — consolidated via useReducer
  // ─────────────────────────────────────────
  const [state, dispatch] = useReducer(appReducer, initialState);
  const unitHistory = useUnitHistory();
  const unitLookup = useUnitLookup(getApiKey, unitHistory);
  const [hasApiKey, setHasApiKey] = useState(() => !!getApiKey());
  useEffect(() => {
    const sync = () => setHasApiKey(!!getApiKey());
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("nape-api-key-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("nape-api-key-changed", sync);
    };
  }, []);
  const { weapon, target, dice, rerolls, ui, easter } = state;

  // ── Destructure slices for direct use ──
  const {
    attacksFixed, attacksValue, attacksRolls,
    toHit, strength, ap,
    damageFixed, damageValue, damageRolls,
    critHitThreshold, critWoundThreshold,
    rapidFire, rapidFireX, halfRange,
    torrent, overwatch, lethalHits, sustainedHits, sustainedHitsN,
    devastatingWounds, precision,
    blastEnabled, blastUnitSize,
    antiXEnabled, antiXThreshold,
    lance,
    meltaEnabled, meltaX,
    plusOneToHit, indirectFire,
    modelQty,
  } = weapon;

  const {
    toughness, armorSave, invulnSave,
    fnpEnabled, fnp,
    inCover, ignoreAp,
    ignoreFirstFailedSave, minusOneDamage, halfDamage,
    saveMod,
    hasLeaderAttached, allocatePrecisionToLeader,
    stealthSmoke, minusOneToWound,
  } = target;

  // Effective hit modifier: sum all sources, cap at ±1 per 10th ed stacking rule
  const effectiveHitMod = clampModPlusMinusOne(
    (plusOneToHit ? 1 : 0) - (indirectFire ? 1 : 0) - (stealthSmoke ? 1 : 0)
  );
  const effectiveWoundMod = clampModPlusMinusOne(
    -(minusOneToWound ? 1 : 0)
  );

  const {
    hitRollsText, woundRollsText, saveRollsText, fnpRollsText,
    hitRerollRollsText, woundRerollRollsText,
  } = dice;

  const {
    rerollHitOnes, rerollHitFails,
    rerollWoundOnes, rerollWoundFails,
    twinLinked,
  } = rerolls;

  const {
    theme, showLog, showCheatSheet,
    showDiceRef, showTableUse, showWizard, strictMode, preserveHooks,
    showExperimental, showProbability,
  } = ui;

  const {
    emperorToast, clearAllTapCount, lastClearAllTapMs,
  } = easter;

  // ── Split volley state ──
  const { split } = state;
  const { enabled: splitEnabled, extraTargets = [] } = split;

  // Split dispatch helpers
  const toggleSplit = () => {
    dispatch({ type: "TOGGLE_SPLIT" });
    if (!splitEnabled) dispatch({ type: "ADD_SPLIT_TARGET", totalWounds: totalSavableWounds });
  };
  const removeSplitTarget   = (i) => dispatch({ type: "REMOVE_SPLIT_TARGET", index: i });
  const setSplitTargetField = (i, field, value) => dispatch({ type: "SET_SPLIT_TARGET_FIELD", index: i, field, value });

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
  const setOverwatch     = v => dispatch({ type: "SET_WEAPON_FIELD", field: "overwatch",     value: v });
  const setLethalHits    = v => dispatch({ type: "SET_WEAPON_FIELD", field: "lethalHits",    value: v });
  const setSustainedHits = v => dispatch({ type: "SET_WEAPON_FIELD", field: "sustainedHits", value: v });
  const setSustainedHitsN= v => dispatch({ type: "SET_WEAPON_FIELD", field: "sustainedHitsN",value: v });
  const setDevastatingWounds = v => dispatch({ type: "SET_WEAPON_FIELD", field: "devastatingWounds", value: v });
  const setPlusOneToHit   = v => dispatch({ type: "SET_WEAPON_FIELD", field: "plusOneToHit",   value: v });
  const setIndirectFire   = v => dispatch({ type: "SET_WEAPON_FIELD", field: "indirectFire",   value: v });
  const setLance          = v => dispatch({ type: "SET_WEAPON_FIELD", field: "lance",           value: v });
  const setBlastEnabled   = v => dispatch({ type: "SET_WEAPON_FIELD", field: "blastEnabled",   value: v });
  const setBlastUnitSize  = v => dispatch({ type: "SET_WEAPON_FIELD", field: "blastUnitSize",  value: v });
  const setMeltaEnabled   = v => dispatch({ type: "SET_WEAPON_FIELD", field: "meltaEnabled",   value: v });
  const setMeltaX         = v => dispatch({ type: "SET_WEAPON_FIELD", field: "meltaX",         value: v });
  const setAntiXEnabled   = v => dispatch({ type: "SET_WEAPON_FIELD", field: "antiXEnabled",   value: v });
  const setModelQty       = v => dispatch({ type: "SET_WEAPON_FIELD", field: "modelQty",       value: v });
  const setAntiXThreshold = v => dispatch({ type: "SET_WEAPON_FIELD", field: "antiXThreshold", value: v });

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
  const setStealthSmoke    = v => dispatch({ type: "SET_TARGET_FIELD", field: "stealthSmoke",    value: v });
  const setMinusOneToWound = v => dispatch({ type: "SET_TARGET_FIELD", field: "minusOneToWound", value: v });

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

  // UI fields
  const setShowLog         = v => dispatch({ type: "SET_UI_FIELD", field: "showLog",         value: v });
  const setShowProbability = v => dispatch({ type: "SET_UI_FIELD", field: "showProbability", value: v });
  const setShowCheatSheet  = v => dispatch({ type: "SET_UI_FIELD", field: "showCheatSheet",  value: v });
  const setShowDiceRef     = v => dispatch({ type: "SET_UI_FIELD", field: "showDiceRef",     value: v });
  const setShowTableUse    = v => dispatch({ type: "SET_UI_FIELD", field: "showTableUse",    value: v });
  const setShowWizard      = v => dispatch({ type: "SET_UI_FIELD", field: "showWizard",      value: v });
  const setStrictMode      = v => dispatch({ type: "SET_UI_FIELD", field: "strictMode",      value: v });
  const setPreserveHooks   = v => dispatch({ type: "SET_UI_FIELD", field: "preserveHooks",   value: v });
  const setShowExperimental= v => dispatch({ type: "SET_UI_FIELD", field: "showExperimental", value: v });
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


  // Transient animation state — declared early because displayComputed depends on it
  const [isRollingAll, setIsRollingAll] = useState(false);
  const [isRollingWeapon, setIsRollingWeapon] = useState(false);
  const [isRollingTarget, setIsRollingTarget] = useState(false);

  // In split mode, useCalculator only needs to run through the wound phase.
  // Passes empty strings for save/damage/fnp so it doesn't error on counts —
  // those phases are handled by useCalculatorSplit per target instead.
  const computed = useCalculator({
    attacksFixed, attacksValue, attacksRolls,
    modelQty,
    rapidFire, rapidFireX, halfRange,
    blastEnabled, blastUnitSize,
    toHit, hitMod: effectiveHitMod, strength, ap,
    damageFixed, damageValue, damageRolls,
    critHitThreshold, critWoundThreshold,
    antiXEnabled, antiXThreshold,
    torrent, overwatch, lethalHits, sustainedHits, sustainedHitsN,
    devastatingWounds, precision, lance,
    rerollHitOnes, rerollHitFails,
    rerollWoundOnes, rerollWoundFails, twinLinked,
    hitRerollRollsText, woundRerollRollsText,
    toughness, armorSave, invulnSave,
    inCover, ignoreAp, woundMod: effectiveWoundMod, saveMod,
    ignoreFirstFailedSave, minusOneDamage, halfDamage,
    fnp, fnpEnabled, fnpRollsText,
    hitRollsText, woundRollsText,
    saveRollsText: splitEnabled ? "" : saveRollsText,
    meltaEnabled, meltaX,
    hasLeaderAttached, allocatePrecisionToLeader,
  });

  // Freeze display during Roll All animation to prevent UI thrash
  const isAnyRolling = isRollingAll || isRollingWeapon || isRollingTarget;
  const lastStableComputed = useRef(null);
  const displayComputed = (isRollingAll || isRollingWeapon || isRollingTarget)
    ? (lastStableComputed.current || computed)
    : (() => { lastStableComputed.current = computed; return computed; })();

  // ── Split volley calculations ──
  // Wound pool from shared phase, dynamically allocated across all targets
  const totalSavableWounds = displayComputed.savableWounds || 0;
  const totalMortalWounds = displayComputed.mortalWoundAttacks || 0;

  // Target 1 gets remainder after extra targets claim their wounds
  const extraWoundsSum = extraTargets.reduce((s, t) => s + Math.max(0, parseInt(t.wounds) || 0), 0);
  const target1Wounds = Math.max(0, totalSavableWounds - Math.min(extraWoundsSum, totalSavableWounds));

  // Shared weapon props passed to every split target
  const sharedWeaponProps = { ap, damageFixed, damageValue, devastatingWounds, lance, meltaEnabled, meltaX };

  // Auto-sync wound distribution when total changes or targets added
  const prevTotalRef = React.useRef(totalSavableWounds);
  React.useEffect(() => {
    if (splitEnabled && extraTargets.length > 0 && totalSavableWounds !== prevTotalRef.current) {
      prevTotalRef.current = totalSavableWounds;
      dispatch({ type: "SYNC_SPLIT_WOUNDS", total: totalSavableWounds });
    }
  }, [splitEnabled, totalSavableWounds, extraTargets.length]);

  // Always-fresh ref so async roll functions read current extraTargets after SYNC_SPLIT_WOUNDS
  const extraTargetsRef = React.useRef(extraTargets);
  React.useEffect(() => { extraTargetsRef.current = extraTargets; }, [extraTargets]);

  // Build blank disabled params (used when slot has no target)
  const disabledSlot = { woundsAllocated: 0, mortalWoundsAllocated: 0, armorSave: "", invulnSave: "", inCover: false, ignoreAp: false, saveMod: 0, ignoreFirstFailedSave: false, minusOneDamage: false, halfDamage: false, fnp: "", fnpEnabled: false, saveRollsText: "", damageRolls: "", fnpRollsText: "", ...sharedWeaponProps, enabled: false };

  // Always call 4 hooks (rules of hooks — must be unconditional)
  const splitResults = [
    useCalculatorSplit({ woundsAllocated: splitEnabled ? target1Wounds : totalSavableWounds, mortalWoundsAllocated: totalMortalWounds, armorSave, invulnSave, inCover, ignoreAp, saveMod, ignoreFirstFailedSave, minusOneDamage, halfDamage, fnp, fnpEnabled, saveRollsText: splitEnabled ? parseDiceList(saveRollsText).slice(0, target1Wounds).join(" ") : saveRollsText, damageRolls, fnpRollsText, ...sharedWeaponProps, label: "1", enabled: true }),
    useCalculatorSplit(extraTargets[0] ? { woundsAllocated: Math.max(0, parseInt(extraTargets[0].wounds) || 0), mortalWoundsAllocated: 0, armorSave: extraTargets[0].armorSave, invulnSave: extraTargets[0].invulnSave, inCover: extraTargets[0].inCover, ignoreAp: extraTargets[0].ignoreAp, saveMod: extraTargets[0].saveMod || 0, ignoreFirstFailedSave: extraTargets[0].ignoreFirstFailedSave, minusOneDamage: extraTargets[0].minusOneDamage, halfDamage: extraTargets[0].halfDamage, fnp: extraTargets[0].fnp, fnpEnabled: extraTargets[0].fnpEnabled, saveRollsText: extraTargets[0].saveRollsText, damageRolls: extraTargets[0].damageRolls, fnpRollsText: extraTargets[0].fnpRollsText, ...sharedWeaponProps, label: "2", enabled: splitEnabled } : { ...disabledSlot, label: "2" }),
    useCalculatorSplit(extraTargets[1] ? { woundsAllocated: Math.max(0, parseInt(extraTargets[1].wounds) || 0), mortalWoundsAllocated: 0, armorSave: extraTargets[1].armorSave, invulnSave: extraTargets[1].invulnSave, inCover: extraTargets[1].inCover, ignoreAp: extraTargets[1].ignoreAp, saveMod: extraTargets[1].saveMod || 0, ignoreFirstFailedSave: extraTargets[1].ignoreFirstFailedSave, minusOneDamage: extraTargets[1].minusOneDamage, halfDamage: extraTargets[1].halfDamage, fnp: extraTargets[1].fnp, fnpEnabled: extraTargets[1].fnpEnabled, saveRollsText: extraTargets[1].saveRollsText, damageRolls: extraTargets[1].damageRolls, fnpRollsText: extraTargets[1].fnpRollsText, ...sharedWeaponProps, label: "3", enabled: splitEnabled } : { ...disabledSlot, label: "3" }),
    useCalculatorSplit(extraTargets[2] ? { woundsAllocated: Math.max(0, parseInt(extraTargets[2].wounds) || 0), mortalWoundsAllocated: 0, armorSave: extraTargets[2].armorSave, invulnSave: extraTargets[2].invulnSave, inCover: extraTargets[2].inCover, ignoreAp: extraTargets[2].ignoreAp, saveMod: extraTargets[2].saveMod || 0, ignoreFirstFailedSave: extraTargets[2].ignoreFirstFailedSave, minusOneDamage: extraTargets[2].minusOneDamage, halfDamage: extraTargets[2].halfDamage, fnp: extraTargets[2].fnp, fnpEnabled: extraTargets[2].fnpEnabled, saveRollsText: extraTargets[2].saveRollsText, damageRolls: extraTargets[2].damageRolls, fnpRollsText: extraTargets[2].fnpRollsText, ...sharedWeaponProps, label: "4", enabled: splitEnabled } : { ...disabledSlot, label: "4" }),
  ];

  const splitA = splitResults[0];

  // In split mode, override totals with Target 1 results; merge all errors/logs
  const activeSplitResults = splitResults.filter((_, i) => i === 0 || (splitEnabled && extraTargets[i - 1]));
  const activeComputed = (splitEnabled && splitA) ? {
    ...displayComputed,
    saveTarget: splitA.saveTarget,
    failedSaves: splitA.failedSaves,
    failedSavesEffective: splitA.failedSavesEffective,
    normalDamage: activeSplitResults.reduce((s, r) => s + (r?.normalDamage ?? 0), 0),
    mortalDamage: activeSplitResults.reduce((s, r) => s + (r?.mortalDamage ?? 0), 0),
    totalPreFnp: activeSplitResults.reduce((s, r) => s + (r?.totalPreFnp ?? 0), 0),
    ignored: activeSplitResults.reduce((s, r) => s + (r?.ignored ?? 0), 0),
    totalPostFnp: activeSplitResults.reduce((s, r) => s + (r?.totalPostFnp ?? 0), 0),
    errors: [
      ...displayComputed.errors.filter(e => !e.includes("Save roll") && !e.includes("Damage roll") && !e.includes("FNP")),
      ...activeSplitResults.flatMap(r => r ? r.errors || [] : []),
    ],
    log: [...displayComputed.log, ...activeSplitResults.flatMap(r => r ? r.log || [] : [])],
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
  const saveNeeded = splitEnabled ? target1Wounds : (activeComputed.savableWounds || 0);
  const fnpNeeded = fnpEnabled && fnp !== ""
    ? (splitEnabled ? (splitResults[0]?.fnpNeeded ?? 0) : activeComputed.totalPreFnp)
    : 0;

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
  const hasHitRerollCountError = hitRerollEntered !== hitRerollNeeded;
  const hasWoundRerollCountError = woundRerollEntered !== woundRerollNeeded;

  const hasHitCountError = !torrent && hitEntered !== hitNeeded;
  const hasWoundCountError = woundEntered !== woundNeeded;
  const hasSaveCountError = splitEnabled
    ? (saveNeeded > 0 && saveEntered < saveNeeded)
    : (saveNeeded > 0 && saveEntered !== saveNeeded);
  const hasFnpCountError = fnpNeeded > 0 && fnpEntered !== fnpNeeded;

  const isNum = (v) => v !== "" && Number.isFinite(Number(v));

  const missingWeapon = [];
  if (attacksFixed) {
    if (!isNum(attacksValue)) missingWeapon.push("Attacks (fixed)");
  } else {
    if (!parseDiceSpec(attacksValue).ok) missingWeapon.push("Attacks expression");
  }
  if (!torrent && !overwatch && !isNum(toHit)) missingWeapon.push("To Hit");
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

  // Per-target stats readiness for split view: T1 uses shared statsReady,
  // extra targets need at minimum armorSave (toughness/weapon stats are shared).
  // A target with 0 wounds allocated counts as ready (nothing to compute).
  const splitTargetStatsReady = activeSplitResults.map((_, i) => {
    if (i === 0) return statsReady;
    const t = extraTargets[i - 1];
    if (!t) return false;
    return Math.max(0, parseInt(t.wounds) || 0) === 0 || !!t.armorSave;
  });
  const allSplitStatsReady = splitTargetStatsReady.every(Boolean);
  // effectiveStatsReady gates status display: also requires split target stats when split is on
  const effectiveStatsReady = statsReady && (!splitEnabled || allSplitStatsReady);
  const diceReady =
    statsReady &&
    activeComputed.errors.length === 0 &&
    !hasHitCountError &&
    (woundNeeded === 0 || !hasWoundCountError) &&
    (saveNeeded === 0 || !hasSaveCountError) &&
    (fnpNeeded === 0 || !hasFnpCountError);
  const status = !effectiveStatsReady ? "Waiting for stats" : diceReady ? "Ready" : "Waiting for dice";

  const statusEmoji = status === "Ready" ? "✅⚔️" : status === "Waiting for dice" ? "⏳🎲" : "⛔🧩";

  const allowDamageTotals = !strictMode || diceReady;

  const shownTotalPostFnp = allowDamageTotals ? (activeComputed.totalPostFnp || 0) : 0;
  const shownTotalPreFnp  = allowDamageTotals ? (activeComputed.totalPreFnp  || 0) : 0;
  const shownNormalDamage = allowDamageTotals ? (activeComputed.normalDamage || 0) : 0;
  const shownMortalDamage = allowDamageTotals ? (activeComputed.mortalDamage || 0) : 0;
  const shownIgnoredTotal =
    allowDamageTotals ? ((activeComputed.ignored || 0) + (activeComputed.ignoredByRule || 0)) : 0;

  const viz = damageViz(shownTotalPostFnp);
  // Split viz.emoji into individual grapheme clusters so background shows 1 · 1 · 1 evenly spaced
  const bgEmojiList = [...new Intl.Segmenter().segment(viz.emoji)].map(s => s.segment);
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
    // ── Weapon keywords (same order as dropdown) ──────────────────────────────
    {
      name: "Rapid Fire X",
      what: "At half range this weapon makes X additional attacks.",
      how: "When Rapid Fire and Half Range are both enabled, +X attacks are added to A before hit rolls.",
    },
    {
      name: "Torrent",
      what: "This weapon automatically hits — no hit roll required.",
      how: "Hit rolls are skipped entirely. All attacks go straight to the wound roll pool.",
    },
    {
      name: "Lethal Hits",
      what: "Critical hits automatically wound without a wound roll.",
      how: "Each critical hit bypasses the wound roll and adds 1 auto-wound to the pool.",
    },
    {
      name: "Sustained Hits X",
      what: "Each critical hit scores X additional hits.",
      how: "Each critical hit generates X bonus hits added to the wound-roll pool. Bonus hits are not themselves critical.",
    },
    {
      name: "Devastating Wounds",
      what: "Critical wounds become mortal wounds that bypass saves.",
      how: "Each critical wound is converted to a mortal-wound attack. Remaining normal wounds are saved as usual.",
    },
    {
      name: "Twin-linked",
      what: "Reroll failed wound rolls for this weapon.",
      how: "Enabling this locks ‘Reroll failed wounds’ ON in the Rerolls panel.",
    },
    {
      name: "Lance",
      what: "In the Fight phase, if the bearer charged this turn, AP improves by 1.",
      how: "AP is strengthened by 1 (e.g., AP -1 becomes AP -2) when computing the save target.",
    },
    {
      name: "Blast",
      what: "Minimum number of attacks scales with the target unit size.",
      how: "Adds ⌊unit size ÷ 5⌋ extra attacks. Enter the enemy unit size in the field to let the tool calculate it.",
    },
    {
      name: "Melta X",
      what: "At half range, roll X extra dice and add the result to this weapon’s Damage.",
      how: "Enter the Melta bonus value; the tool adds it to each damage roll when at half range.",
    },
    {
      name: "Anti-X N+",
      what: "Wound rolls of N+ are always critical wounds against the specified keyword.",
      how: "The critical wound threshold is set to N, overriding the default 6+. Rolls of N+ auto-wound regardless of S vs T.",
    },
    {
      name: "+1 To Hit (Heavy / Guided / Markerlights)",
      what: "Certain abilities grant +1 to hit rolls (e.g. Heavy when Remained Stationary, Guided, Markerlights).",
      how: "Applies +1 to the effective hit modifier, lowering the hit target by 1 (capped at 2+).",
    },
    {
      name: "Indirect Fire",
      what: "Can target units not in line of sight, but suffers -1 to hit and grants the target Cover.",
      how: "Applies -1 to the hit modifier. Enable Cover on the target separately if applicable.",
    },
    // ── Target keywords (same order as dropdown) ──────────────────────────────
    {
      name: "Cover",
      what: "Improves the target’s armor save by 1.",
      how: "The armor save is improved by 1 (e.g., 3+ becomes 2+) before comparing to the AP-modified save target.",
      notes: "Does not model terrain-type restrictions — toggle it when the target benefits from Cover per the rules.",
    },
    {
      name: "Ignore AP",
      what: "The target treats AP as 0 for this attack sequence.",
      how: "AP is set to 0 when computing the effective save target.",
    },
    {
      name: "Ignore first failed save",
      what: "One failed save is negated.",
      how: "After rolling saves, the first failure is removed before applying damage.",
    },
    {
      name: "-1 Damage",
      what: "Each wound inflicts 1 less damage (minimum 1).",
      how: "Applied after Half Damage (if both are active). Order: half (round up) → subtract 1, min 1.",
    },
    {
      name: "Half Damage",
      what: "Each wound inflicts half damage (round up).",
      how: "Applied before -1 Damage (if both are active). Order: half (round up) → subtract 1, min 1.",
    },
    {
      name: "Stealth / Smoke",
      what: "Attacks against this unit suffer -1 to hit.",
      how: "Applies -1 to the hit modifier (stacks with other modifiers, capped at ±1 per 10th ed rules).",
    },
    {
      name: "-1 To Wound (Transhuman Physiology)",
      what: "Attacks against this unit suffer -1 to wound rolls.",
      how: "Applies -1 to the effective wound modifier, raising the wound target by 1.",
    },
    // ── General mechanics ─────────────────────────────────────────────────────
    {
      name: "Rerolls (Hit / Wound)",
      what: "Reroll certain hit or wound dice — 1s only, or all failures.",
      how: "Enable in the Rerolls panel. Twin-linked locks reroll-failed-wounds ON. After initial rolls the tool shows exactly how many reroll dice to enter.",
      notes: "Reroll dice are entered in a separate field after the initial rolls.",
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

  // ── Roll All ──
  const rollAll = async () => {
    if (isRollingAll || isRollingWeapon || isRollingTarget || !effectiveStatsReady) return;
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
    const invNum = invulnSave === "" ? null : Number(invulnSave);
    const armorWithCover = inCover ? clampMin2Plus(armorSaveNum - 1) : armorSaveNum;
    const apForSave = ignoreAp ? 0 : apNum - (lance ? 1 : 0);
    const saveTarget = clampMin2Plus(chooseSaveTarget(armorWithCover, invNum, apForSave));

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
        if (++step >= 4) { clearInterval(ticker); flushSync(() => setter(finalRolls.join(" "))); resolve(); }
      }, 25);
    });
    const pause = (ms) => new Promise(r => setTimeout(r, ms));
    const modelQtyNum = Math.max(1, parseInt(String(modelQty || "1"), 10) || 1);

    // Phase 1: Attacks
    let attacksTotal = attacksFixed ? (Number(attacksValue) || 0) * modelQtyNum : 0;
    if (!attacksFixed && attackSpecNow.n > 0) {
      const rolls = Array.from({ length: attackSpecNow.n * modelQtyNum }, () => Math.ceil(Math.random() * attackSpecNow.sides));
      await animateField(setAttacksRolls, rolls, attackSpecNow.sides);
      attacksTotal = rolls.reduce((s, d) => s + d, 0) + attackSpecNow.mod * modelQtyNum;
      await pause(30);
    }
    const rfXNum = Math.max(0, Number(rapidFireX) || 0);
    if (rapidFire && halfRange && rfXNum > 0) attacksTotal += rfXNum;
    if (blastEnabled) attacksTotal += Math.floor(Number(blastUnitSize) || 0) / 5 | 0;
    if (attacksTotal <= 0) { setIsRollingAll(false); return; }

    // Phase 2: Hits
    let hitRollsFinal = [];
    let normalHits = 0, lethalAutoWounds = 0, sustainedExtra = 0;
    if (!torrent) {
      hitRollsFinal = Array.from({ length: attacksTotal }, () => Math.ceil(Math.random() * 6));
      await animateField(setHitRollsText, hitRollsFinal, 6);
      if (rerollHitOnes || rerollHitFails) {
        const eligible = hitRollsFinal.filter(d => rerollHitOnes ? d === 1 : d + effectiveHitMod < toHitNum);
        if (eligible.length > 0) {
          const rr = Array.from({ length: eligible.length }, () => Math.ceil(Math.random() * 6));
          await pause(20); await animateField(setHitRerollRollsText, rr, 6);
          let ri = 0;
          hitRollsFinal = hitRollsFinal.map(d => ((rerollHitOnes && d === 1) || (rerollHitFails && d + effectiveHitMod < toHitNum)) ? (rr[ri++] ?? d) : d);
        }
      }
      for (const d of hitRollsFinal) {
        if (d === 1) continue;
        if (d >= critHitT) {
          if (sustainedHits) sustainedExtra += Number(sustainedHitsN) || 1;
          if (lethalHits) lethalAutoWounds++; else normalHits++;
        } else if (d + effectiveHitMod >= toHitNum) normalHits++;
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
        const eligible = woundRollsFinal.filter(d => (rerollWoundOnes && !twinLinked) ? d === 1 : d + effectiveWoundMod < woundTarget);
        if (eligible.length > 0) {
          const rr = Array.from({ length: eligible.length }, () => Math.ceil(Math.random() * 6));
          await pause(20); await animateField(setWoundRerollRollsText, rr, 6);
          let ri = 0;
          woundRollsFinal = woundRollsFinal.map(d => (rerollWoundOnes && !twinLinked && d === 1) || ((rerollWoundFails || twinLinked) && d + effectiveWoundMod < woundTarget) ? (rr[ri++] ?? d) : d);
        }
      }
      const effectiveCritWoundT = antiXEnabled ? Math.max(2, Math.min(6, Number(antiXThreshold) || 6)) : critWoundT;
      for (const d of woundRollsFinal) {
        if (d === 1) continue;
        const normalWound = d + effectiveWoundMod >= woundTarget;
        const isCrit = d >= effectiveCritWoundT && (antiXEnabled || normalWound);
        if (isCrit) { if (devastatingWounds) mortalWoundAttacks++; else totalWounds++; }
        else if (normalWound) totalWounds++;
      }
    }
    await pause(120);

    // Phases 4-6: Saves → Damage → FNP (split-aware)
    const dmgSpec = parseDiceSpec(damageValue);

    if (!splitEnabled || extraTargets.length === 0) {
      // ── Non-split path ──
      let saveRollsFinal = [];
      let failedSaves = 0;
      if (totalWounds > 0) {
        saveRollsFinal = Array.from({ length: totalWounds }, () => Math.ceil(Math.random() * 6));
        await animateField(setSaveRollsText, saveRollsFinal, 6);
        failedSaves = saveRollsFinal.filter(d => d < saveTarget).length;
      }
      await pause(30);
      const failedEffective = Math.max(0, failedSaves - (ignoreFirstFailedSave ? 1 : 0));
      let totalDmg = 0;
      if (!damageFixed && dmgSpec.hasDie) {
        const woundCount = failedEffective + mortalWoundAttacks;
        const totalDmgDice = woundCount * dmgSpec.n;
        if (totalDmgDice > 0) {
          const rolls = Array.from({ length: totalDmgDice }, () => Math.ceil(Math.random() * dmgSpec.sides));
          await animateField(setDamageRolls, rolls, dmgSpec.sides);
          totalDmg = rolls.reduce((s, d) => s + d, 0) + woundCount * dmgSpec.mod;
          await pause(30);
        } else { setDamageRolls(""); }
      } else if (damageFixed) {
        totalDmg = (failedEffective + mortalWoundAttacks) * (Number(damageValue) || 0);
        setDamageRolls("");
      }
      if (fnpEnabled && fnp !== "" && totalDmg > 0) {
        const fnpRolls = Array.from({ length: totalDmg }, () => Math.ceil(Math.random() * 6));
        await animateField(setFnpRollsText, fnpRolls, 6);
      } else { setFnpRollsText(""); }
    } else {
      // ── Split path ──
      // Compute allocation directly from totalWounds using the same even-split formula
      // as SYNC_SPLIT_WOUNDS. This avoids reading t.wounds from state, which is unreliable
      // because SYNC_SPLIT_WOUNDS fires on every animation tick with random intermediates.
      const freshExtras = extraTargetsRef.current;
      const allCount = freshExtras.length + 1; // T1 + extras
      const syncBase = allCount > 1 ? Math.floor(totalWounds / allCount) : 0;
      const syncRem  = allCount > 1 ? totalWounds % allCount : 0;
      const extraWoundsCount = freshExtras.map((_, i) => syncBase + (i < syncRem ? 1 : 0));
      const t1WoundsCount = Math.max(0, totalWounds - extraWoundsCount.reduce((s, w) => s + w, 0));

      // Push the correct allocation to state now so wound fields update before saves roll
      dispatch({ type: "SYNC_SPLIT_WOUNDS", total: totalWounds });
      await pause(20);

      // T1 saves
      let t1Failed = 0;
      if (t1WoundsCount > 0) {
        const t1Saves = Array.from({ length: t1WoundsCount }, () => Math.ceil(Math.random() * 6));
        await animateField(setSaveRollsText, t1Saves, 6);
        t1Failed = t1Saves.filter(d => d < saveTarget).length;
        await pause(20);
      } else {
        setSaveRollsText("");
      }

      // Extra target saves
      const extFailed = [];
      for (let i = 0; i < freshExtras.length; i++) {
        const t = freshExtras[i];
        const wN = extraWoundsCount[i];
        if (wN === 0) { extFailed.push(0); setSplitTargetField(i, "saveRollsText", ""); continue; }
        const tInv = t.invulnSave === "" ? null : Number(t.invulnSave);
        const tArmorBase = Number(t.armorSave) || 7;
        const tArmorMod = t.inCover ? clampMin2Plus(tArmorBase - 1) : tArmorBase;
        const tSaveTarget = clampMin2Plus(chooseSaveTarget(tArmorMod, tInv, t.ignoreAp ? 0 : apNum));
        const tSaves = Array.from({ length: wN }, () => Math.ceil(Math.random() * 6));
        await animateField(v => setSplitTargetField(i, "saveRollsText", v), tSaves, 6);
        extFailed.push(tSaves.filter(d => d < tSaveTarget).length);
        await pause(20);
      }
      await pause(40);

      // T1 damage
      const t1FailedEff = Math.max(0, t1Failed - (ignoreFirstFailedSave ? 1 : 0));
      let t1Dmg = 0;
      if (!damageFixed && dmgSpec.hasDie) {
        const t1WoundCount = t1FailedEff + mortalWoundAttacks;
        const t1DmgDice = t1WoundCount * dmgSpec.n;
        if (t1DmgDice > 0) {
          const t1DmgRolls = Array.from({ length: t1DmgDice }, () => Math.ceil(Math.random() * dmgSpec.sides));
          await animateField(setDamageRolls, t1DmgRolls, dmgSpec.sides);
          t1Dmg = t1DmgRolls.reduce((s, d) => s + d, 0) + t1WoundCount * dmgSpec.mod;
          await pause(20);
        } else { setDamageRolls(""); }
      } else if (damageFixed) {
        t1Dmg = (t1FailedEff + mortalWoundAttacks) * (Number(damageValue) || 0);
        setDamageRolls("");
      }
      if (fnpEnabled && fnp !== "" && t1Dmg > 0) {
        const t1FnpRolls = Array.from({ length: t1Dmg }, () => Math.ceil(Math.random() * 6));
        await animateField(setFnpRollsText, t1FnpRolls, 6);
        await pause(20);
      } else { setFnpRollsText(""); }

      // Extra target damage + FNP
      for (let i = 0; i < freshExtras.length; i++) {
        const t = freshExtras[i];
        const failedEff = Math.max(0, (extFailed[i] || 0) - (t.ignoreFirstFailedSave ? 1 : 0));
        let tDmg = 0;
        if (!damageFixed && dmgSpec.hasDie && failedEff > 0) {
          const extDmgRolls = Array.from({ length: failedEff * dmgSpec.n }, () => Math.ceil(Math.random() * dmgSpec.sides));
          await animateField(v => setSplitTargetField(i, "damageRolls", v), extDmgRolls, dmgSpec.sides);
          tDmg = extDmgRolls.reduce((s, d) => s + d, 0) + failedEff * dmgSpec.mod;
          await pause(20);
        } else if (damageFixed) {
          tDmg = failedEff * (Number(damageValue) || 0);
          setSplitTargetField(i, "damageRolls", "");
        } else { setSplitTargetField(i, "damageRolls", ""); }
        if (t.fnpEnabled && t.fnp !== "" && tDmg > 0) {
          const tFnpRolls = Array.from({ length: tDmg }, () => Math.ceil(Math.random() * 6));
          await animateField(v => setSplitTargetField(i, "fnpRollsText", v), tFnpRolls, 6);
          await pause(20);
        } else { setSplitTargetField(i, "fnpRollsText", ""); }
      }
    }

    setIsRollingAll(false);
  };

  const rollWeapon = async () => {
    if (isRollingAll || isRollingWeapon || isRollingTarget || !statsReady) return;
    setIsRollingWeapon(true);

    const attackSpecNow = parseDiceSpec(attacksValue);
    const toHitNum = Number(toHit);
    const critHitT = Number(critHitThreshold) || 6;
    const strengthNum = Number(strength);
    const toughnessNum = Number(toughness);
    const woundTarget = strengthNum >= toughnessNum * 2 ? 2 : strengthNum > toughnessNum ? 3 : strengthNum === toughnessNum ? 4 : strengthNum * 2 <= toughnessNum ? 6 : 5;

    const { flushSync } = await import("react-dom");
    const animateField = (setter, finalRolls, sides) => new Promise(resolve => {
      if (finalRolls.length === 0) { resolve(); return; }
      let step = 0;
      const ticker = setInterval(() => {
        flushSync(() => {
          setter(Array.from({ length: finalRolls.length }, () => Math.ceil(Math.random() * sides)).join(" "));
        });
        if (++step >= 4) { clearInterval(ticker); flushSync(() => setter(finalRolls.join(" "))); resolve(); }
      }, 25);
    });
    const pause = (ms) => new Promise(r => setTimeout(r, ms));
    const modelQtyNum = Math.max(1, parseInt(String(modelQty || "1"), 10) || 1);

    // Phase 1: Attack dice (only when variable)
    let attacksTotal = attacksFixed ? (Number(attacksValue) || 0) * modelQtyNum : 0;
    if (!attacksFixed && attackSpecNow.n > 0) {
      const rolls = Array.from({ length: attackSpecNow.n * modelQtyNum }, () => Math.ceil(Math.random() * attackSpecNow.sides));
      await animateField(setAttacksRolls, rolls, attackSpecNow.sides);
      attacksTotal = rolls.reduce((s, d) => s + d, 0) + attackSpecNow.mod * modelQtyNum;
      await pause(30);
    }
    const rfXNum = Math.max(0, Number(rapidFireX) || 0);
    if (rapidFire && halfRange && rfXNum > 0) attacksTotal += rfXNum;
    if (blastEnabled) attacksTotal += Math.floor(Number(blastUnitSize) || 0) / 5 | 0;
    if (attacksTotal <= 0) { setIsRollingWeapon(false); return; }

    // Phase 2: Hits
    let hitRollsFinal = [];
    let normalHits = 0, sustainedExtra = 0;
    if (!torrent) {
      hitRollsFinal = Array.from({ length: attacksTotal }, () => Math.ceil(Math.random() * 6));
      await animateField(setHitRollsText, hitRollsFinal, 6);
      if (rerollHitOnes || rerollHitFails) {
        const eligible = hitRollsFinal.filter(d => rerollHitOnes ? d === 1 : d + effectiveHitMod < toHitNum);
        if (eligible.length > 0) {
          const rr = Array.from({ length: eligible.length }, () => Math.ceil(Math.random() * 6));
          await pause(20); await animateField(setHitRerollRollsText, rr, 6);
          let ri = 0;
          hitRollsFinal = hitRollsFinal.map(d => ((rerollHitOnes && d === 1) || (rerollHitFails && d + effectiveHitMod < toHitNum)) ? (rr[ri++] ?? d) : d);
        }
      }
      for (const d of hitRollsFinal) {
        if (d === 1) continue;
        if (d >= critHitT) {
          if (sustainedHits) sustainedExtra += Number(sustainedHitsN) || 1;
          if (!lethalHits) normalHits++;
        } else if (d + effectiveHitMod >= toHitNum) normalHits++;
      }
      normalHits += sustainedExtra;
    } else {
      normalHits = attacksTotal;
    }
    await pause(120);

    // Phase 3: Wounds
    if (normalHits > 0) {
      let woundRollsFinal = Array.from({ length: normalHits }, () => Math.ceil(Math.random() * 6));
      await animateField(setWoundRollsText, woundRollsFinal, 6);
      if (twinLinked || rerollWoundOnes || rerollWoundFails) {
        const eligible = woundRollsFinal.filter(d => (rerollWoundOnes && !twinLinked) ? d === 1 : d < woundTarget);
        if (eligible.length > 0) {
          const rr = Array.from({ length: eligible.length }, () => Math.ceil(Math.random() * 6));
          await pause(20); await animateField(setWoundRerollRollsText, rr, 6);
          let ri = 0;
          woundRollsFinal = woundRollsFinal.map(d =>
            (rerollWoundOnes && !twinLinked && d === 1) || ((rerollWoundFails || twinLinked) && d < woundTarget)
              ? (rr[ri++] ?? d)
              : d
          );
        }
      }
    }

    // Clear stale target-side fields
    setDamageRolls("");
    setSaveRollsText("");
    setFnpRollsText("");

    setIsRollingWeapon(false);
  };

  const rollTarget = async () => {
    if (isRollingAll || isRollingWeapon || isRollingTarget || !effectiveStatsReady) return;
    const freshExtras = extraTargetsRef.current;
    const hasSplitExtra = splitEnabled && freshExtras.length > 0;
    const currentSaveNeeded = splitEnabled ? target1Wounds : (activeComputed.savableWounds || 0);
    const anyExtraWounds = hasSplitExtra && freshExtras.some(t => (parseInt(t.wounds) || 0) > 0);
    if (currentSaveNeeded <= 0 && !anyExtraWounds) return;
    setIsRollingTarget(true);

    const armorSaveNum = Number(armorSave);
    const apNum = Number(ap) || 0;
    const invNum = invulnSave === "" ? null : Number(invulnSave);
    const armorWithCover = inCover ? clampMin2Plus(armorSaveNum - 1) : armorSaveNum;
    const saveTarget = clampMin2Plus(chooseSaveTarget(armorWithCover, invNum, ignoreAp ? 0 : apNum - (lance ? 1 : 0)));
    const dmgSpec = parseDiceSpec(damageValue);
    const mortalWoundAttacks = activeComputed.mortalWoundAttacks || 0;

    const { flushSync } = await import("react-dom");
    const animateField = (setter, finalRolls, sides) => new Promise(resolve => {
      if (finalRolls.length === 0) { resolve(); return; }
      let step = 0;
      const ticker = setInterval(() => {
        flushSync(() => {
          setter(Array.from({ length: finalRolls.length }, () => Math.ceil(Math.random() * sides)).join(" "));
        });
        if (++step >= 4) { clearInterval(ticker); flushSync(() => setter(finalRolls.join(" "))); resolve(); }
      }, 25);
    });
    const pause = (ms) => new Promise(r => setTimeout(r, ms));

    // Phase 4: T1 Saves
    let t1FailedEff = 0;
    let t1Dmg = 0;
    if (currentSaveNeeded > 0) {
      const saveRollsFinal = Array.from({ length: currentSaveNeeded }, () => Math.ceil(Math.random() * 6));
      await animateField(setSaveRollsText, saveRollsFinal, 6);
      const failedSaves = saveRollsFinal.filter(d => d < saveTarget).length;
      t1FailedEff = Math.max(0, failedSaves - (ignoreFirstFailedSave ? 1 : 0));
      await pause(30);

      // Phase 5: T1 Damage
      if (!damageFixed && dmgSpec.hasDie) {
        const t1WoundCount = t1FailedEff + mortalWoundAttacks;
        const totalDmgDice = t1WoundCount * dmgSpec.n;
        if (totalDmgDice > 0) {
          const rolls = Array.from({ length: totalDmgDice }, () => Math.ceil(Math.random() * dmgSpec.sides));
          await animateField(setDamageRolls, rolls, dmgSpec.sides);
          t1Dmg = rolls.reduce((s, d) => s + d, 0) + t1WoundCount * dmgSpec.mod;
          await pause(30);
        } else { setDamageRolls(""); }
      } else if (damageFixed) {
        t1Dmg = (t1FailedEff + mortalWoundAttacks) * (Number(damageValue) || 0);
        setDamageRolls("");
      }

      // Phase 6: T1 FNP
      if (fnpEnabled && fnp !== "" && t1Dmg > 0) {
        const fnpRolls = Array.from({ length: t1Dmg }, () => Math.ceil(Math.random() * 6));
        await animateField(setFnpRollsText, fnpRolls, 6);
      } else { setFnpRollsText(""); }
      if (hasSplitExtra) await pause(80);
    } else {
      setSaveRollsText("");
      setDamageRolls("");
      setFnpRollsText("");
    }

    // Extra targets (split mode)
    if (hasSplitExtra) {
      for (let i = 0; i < freshExtras.length; i++) {
        const t = freshExtras[i];
        const wN = Math.max(0, parseInt(t.wounds) || 0);
        if (wN === 0) { setSplitTargetField(i, "saveRollsText", ""); continue; }
        const tInv = t.invulnSave === "" ? null : Number(t.invulnSave);
        const tArmorBase = Number(t.armorSave) || 7;
        const tArmorMod = t.inCover ? clampMin2Plus(tArmorBase - 1) : tArmorBase;
        const tSaveTarget = clampMin2Plus(chooseSaveTarget(tArmorMod, tInv, t.ignoreAp ? 0 : apNum));
        const tSaves = Array.from({ length: wN }, () => Math.ceil(Math.random() * 6));
        await animateField(v => setSplitTargetField(i, "saveRollsText", v), tSaves, 6);
        const tFailed = tSaves.filter(d => d < tSaveTarget).length;
        const tFailedEff = Math.max(0, tFailed - (t.ignoreFirstFailedSave ? 1 : 0));
        await pause(20);

        let tDmg = 0;
        if (!damageFixed && dmgSpec.hasDie && tFailedEff > 0) {
          const extDmgRolls = Array.from({ length: tFailedEff * dmgSpec.n }, () => Math.ceil(Math.random() * dmgSpec.sides));
          await animateField(v => setSplitTargetField(i, "damageRolls", v), extDmgRolls, dmgSpec.sides);
          tDmg = extDmgRolls.reduce((s, d) => s + d, 0) + tFailedEff * dmgSpec.mod;
          await pause(20);
        } else if (damageFixed) {
          tDmg = tFailedEff * (Number(damageValue) || 0);
          setSplitTargetField(i, "damageRolls", "");
        } else {
          setSplitTargetField(i, "damageRolls", "");
        }
        if (t.fnpEnabled && t.fnp !== "" && tDmg > 0) {
          const tFnpRolls = Array.from({ length: tDmg }, () => Math.ceil(Math.random() * 6));
          await animateField(v => setSplitTargetField(i, "fnpRollsText", v), tFnpRolls, 6);
          await pause(20);
        } else {
          setSplitTargetField(i, "fnpRollsText", "");
        }
      }
    }

    setIsRollingTarget(false);
  };

  return (
    <div className={`min-h-screen ${viz.pageBg || "bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950"} p-4 relative overflow-x-hidden`}>
      {/* Animated page-wide emoji backdrop — fixed so it covers full viewport regardless of scroll */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden mix-blend-screen" style={{ zIndex: 0, opacity: isAnyRolling ? 0 : 0.04, transition: "opacity 0.5s ease" }}>
        {diceReady && (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px", paddingTop: "40px" }}>
            {Array.from({ length: 22 }).map((_, i) => (
              <div
                key={i}
                className="nape-marquee-row"
                style={{ gap: "7rem", animationDuration: `${22 + (i % 5) * 4}s`, animationDelay: `${-(i * 1.9 % 9).toFixed(1)}s`, animationDirection: i % 2 ? "alternate-reverse" : "alternate" }}
              >
                {Array.from({ length: 8 }).map((__, j) => (
                  <span key={j}>{bgEmojiList[j % bgEmojiList.length]}</span>
                ))}
                {Array.from({ length: 8 }).map((__, j) => (
                  <span key={`d${j}`}>{bgEmojiList[j % bgEmojiList.length]}</span>
                ))}
              </div>
            ))}
          </div>
        )}
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



              <div className="max-w-screen-2xl mx-auto space-y-4 px-1 sm:px-2 overflow-x-hidden overflow-y-visible">
        {/* ── Sticky combined header + live results ── */}
        <div className={`sticky top-0 z-40 border-b border-gray-700/80 shadow-lg rounded-2xl ${viz.headerBg}`}>

          {/* Emoji marquee background — only when hard total is ready */}
          {diceReady && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: isAnyRolling ? 0 : 0.12, transition: "opacity 0.5s ease" }}>
              <div className="nape-marquee-row" style={{ animationDuration: "30s", fontSize: "0.9rem", lineHeight: 1.5 }}>
                {Array.from({ length: 40 }).map((_, i) => <span key={i} className="mr-3">{viz.emoji}</span>)}
                {Array.from({ length: 40 }).map((_, i) => <span key={`d${i}`} className="mr-3">{viz.emoji}</span>)}
              </div>
              <div className="nape-marquee-row nape-marquee-reverse" style={{ animationDuration: "36s", fontSize: "0.9rem", lineHeight: 1.5 }}>
                {Array.from({ length: 40 }).map((_, i) => <span key={i} className="mr-3">{viz.emoji}</span>)}
                {Array.from({ length: 40 }).map((_, i) => <span key={`d${i}`} className="mr-3">{viz.emoji}</span>)}
              </div>
            </div>
          )}

          {/* Header content row */}
          <div className="relative z-10 max-w-screen-2xl mx-auto px-2 sm:px-3 py-2 flex items-center gap-2 sm:gap-3 flex-wrap overflow-hidden">

            {/* NAPE chip */}
            <span className="text-xs font-extrabold tracking-widest px-2 py-0.5 rounded border border-gray-600 text-gray-300 bg-gray-900/60 shrink-0">NAPE</span>

            {/* Status pill */}
            <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1 text-sm font-bold shrink-0 ${statusClass}`}>
              <span className="text-lg leading-none">{statusEmoji}</span>
              <span>{status}</span>
            </div>

            {/* Status detail OR live damage — same row */}
            {!effectiveStatsReady ? (
              <span className="text-xs text-gray-400 truncate max-w-[200px]">{!statsReady ? `Missing: ${[...missingWeapon, ...missingTarget].join(", ")}` : "Split target stats missing"}</span>
            ) : status === "Waiting for dice" ? (
              <span className="text-xs text-gray-400 shrink-0">Hit {hitRemaining} · Wound {woundRemaining} · Save {saveRemaining}{fnpNeeded > 0 ? ` · FNP ${fnpRemaining}` : ""}</span>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-2xl leading-none">{viz.emoji}</span>
                {splitEnabled && activeSplitResults.length > 1 ? (
                  <div className="flex flex-col leading-tight">
                    <div className="flex items-center gap-2">
                      {activeSplitResults.map((r, i) => (
                        <span key={i} className={`text-xs font-bold ${splitTargetStatsReady[i] ? (theme === "dark" ? "text-amber-300/70" : "text-amber-600/70") : (theme === "dark" ? "text-red-400/70" : "text-red-500/70")}`}>T{i+1}:</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      {activeSplitResults.map((r, i) => {
                        const tReady = splitTargetStatsReady[i];
                        const val = !tReady ? '?' : (allowDamageTotals && r) ? r.totalPostFnp : '–';
                        return (
                          <React.Fragment key={i}>
                            {i > 0 && <span className={`text-sm font-bold ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}>+</span>}
                            <span className={`text-lg font-extrabold tabular-nums ${tReady ? (theme === "dark" ? "text-amber-300" : "text-amber-600") : (theme === "dark" ? "text-red-400" : "text-red-500")}`}>{val}</span>
                          </React.Fragment>
                        );
                      })}
                      <span className={`text-sm font-bold ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}>=</span>
                      <span className={`text-4xl font-extrabold tabular-nums leading-none ${viz.totalNumber}`}>{allSplitStatsReady ? dmgStr : `${dmgStr}+`}</span>
                    </div>
                  </div>
                ) : (
                  <span className={`text-3xl font-extrabold tabular-nums leading-none ${viz.totalNumber}`}>{dmgStr}</span>
                )}
                <div className="flex flex-col leading-tight">
                  <span className={`text-xs uppercase tracking-widest ${viz.totalLabel}`}>{totalLabelText}</span>
                  <span className={`text-xs ${viz.totalMeta}`}>{diceReady ? "final" : "preview"}</span>
                </div>
              </div>
            )}

            {/* Spacer */}
            <div className="flex-1" />
          </div>
        </div>

<div className="grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-visible">
          {/* LEFT: Inputs */}
          <div className="lg:col-span-6 space-y-4">
            <Section theme={theme} title="Weapon" action={
  <button
    type="button"
    className={`rounded px-2 py-1 text-xs font-semibold border transition ${theme === "dark" ? "bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700" : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100"}`}
    onClick={clearWeapon}
  >
    Clear weapon
  </button>
}>
              {hasApiKey && (
                <div className="flex flex-col gap-1 mb-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={unitLookup.attackerText}
                      onChange={e => unitLookup.setAttackerText(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !unitLookup.attackerLoading && unitLookup.attackerText.trim() && unitLookup.fillAttacker(dispatch)}
                      placeholder="e.g. intercessor bolt rifle, crisis suit plasma rifle"
                      className={`flex-1 min-w-0 rounded border px-2 py-1 text-sm ${theme === "dark" ? "bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500" : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400"}`}
                    />
                    <FillButton label="Fill" loading={unitLookup.attackerLoading} disabled={!unitLookup.attackerText.trim()} hasKey={hasApiKey} onClick={() => unitLookup.fillAttacker(dispatch)} theme={theme} />
                    <HistoryDropdown
                      history={unitHistory}
                      onFillWeapon={(fields, unitName, weaponLabel, wahapediaUrl, source) => {
                        dispatch({ type: "LOAD_WEAPON", weapon: fields });
                        const label = unitName && weaponLabel ? `${unitName} with ${weaponLabel}` : weaponLabel || unitName || "";
                        unitLookup.setAttackerText(label);
                        unitLookup.setAttackerMeta({ resolvedName: label, wahapediaUrl: wahapediaUrl || "https://wahapedia.ru", source: source || "training" });
                      }}
                      onFillTarget={(fields) => dispatch({ type: "LOAD_TARGET", target: fields })}
                      theme={theme}
                      mode="attacker"
                    />
                  </div>
                  {unitLookup.attackerError && <span className="text-xs text-red-400">{unitLookup.attackerError}</span>}
                  {unitLookup.attackerOptions
                    ? <DisambiguationChips
                        options={unitLookup.attackerOptions}
                        loading={unitLookup.attackerLoading}
                        onChoose={(choice) => unitLookup.resolveAttacker(dispatch, choice)}
                        theme={theme}
                      />
                    : <LookupSourceBadge meta={unitLookup.attackerMeta} theme={theme} />
                  }
                </div>
              )}
              <WeaponStatTable
                attacksFixed={attacksFixed} setAttacksFixed={setAttacksFixed}
                attacksValue={attacksValue} setAttacksValue={setAttacksValue}
                modelQty={modelQty} setModelQty={setModelQty}
                toHit={toHit} setToHit={setToHit}
                strength={strength} setStrength={setStrength}
                ap={ap} setAp={setAp}
                damageFixed={damageFixed} setDamageFixed={setDamageFixed}
                damageValue={damageValue} setDamageValue={setDamageValue}
                torrent={torrent} overwatch={overwatch}
                isNum={isNum} theme={theme}
              />


              <KeywordGroup label="Keywords / Effects" hint="Enable only keywords that apply to this weapon and this firing sequence." theme={theme} items={[
                  { key: "rapidFire", checked: rapidFire, node: (
                    <div className="flex flex-wrap items-center gap-2 min-h-[36px]">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={rapidFire} onChange={(e) => { const on = e.target.checked; setRapidFire(on); if (!on) setHalfRange(false); }} />
                        <span className="font-semibold">Rapid Fire</span>
                      </label>
                      {rapidFire && <input className={`w-14 rounded border p-1 text-sm font-bold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"}`} type="number" min={0} value={rapidFireX} onChange={(e) => setRapidFireX(e.target.value)} title="Rapid Fire X: add X attacks at half range." />}
                      <label className={`flex items-center gap-2 ${!rapidFire || Number(rapidFireX || 0) <= 0 ? "opacity-50" : ""}`}>
                        <input type="checkbox" checked={halfRange} disabled={!rapidFire || Number(rapidFireX || 0) <= 0} onChange={(e) => setHalfRange(e.target.checked)} />
                        <span className="font-semibold">Half range</span>
                      </label>
                    </div>
                  )},
                  { key: "torrent", checked: torrent, node: (
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input type="checkbox" checked={torrent} onChange={(e) => setTorrent(e.target.checked)} />
                      <span className="font-semibold">TORRENT</span>
                      <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>(auto-hit)</span>
                    </label>
                  )},
                  { key: "overwatch", checked: overwatch, node: (
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input type="checkbox" checked={overwatch} onChange={(e) => setOverwatch(e.target.checked)} disabled={torrent} />
                      <span className={`font-semibold ${torrent ? "opacity-40" : ""}`}>Overwatch</span>
                      <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"} ${torrent ? "opacity-40" : ""}`}>(hits on nat 6 only)</span>
                    </label>
                  )},
                  { key: "lethalHits", checked: lethalHits, node: (
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input type="checkbox" checked={lethalHits} onChange={(e) => setLethalHits(e.target.checked)} />
                      <span className="font-semibold">Lethal Hits</span>
                      <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>(crit hit auto-wounds)</span>
                    </label>
                  )},
                  { key: "sustainedHits", checked: sustainedHits, node: (
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input type="checkbox" checked={sustainedHits} onChange={(e) => setSustainedHits(e.target.checked)} />
                      <span className="font-semibold">Sustained Hits</span>
                      {sustainedHits && <input className={`w-14 rounded border p-1 text-sm font-bold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"}`} type="number" min={1} value={sustainedHitsN} onChange={(e) => setSustainedHitsN(e.target.value)} title="Sustained Hits X: each crit hit adds X extra hits." />}
                      <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>(crit hit = extra hits)</span>
                    </label>
                  )},
                  { key: "devastatingWounds", checked: devastatingWounds, node: (
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input type="checkbox" checked={devastatingWounds} onChange={(e) => setDevastatingWounds(e.target.checked)} />
                      <span className="font-semibold">Devastating Wounds</span>
                      <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>(crit wound → mortals)</span>
                    </label>
                  )},
                  { key: "twinLinked", checked: twinLinked, node: (
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input type="checkbox" checked={twinLinked} onChange={(e) => { const next = e.target.checked; setTwinLinked(next); if (next) setRerollWoundFails(true); if (!next) setRerollWoundFails(false); }} title="Twin-linked: reroll failed wound rolls." />
                      <span className="font-semibold">Twin-linked</span>
                      <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>(reroll failed wounds)</span>
                    </label>
                  )},
                  { key: "lance", checked: lance, node: (
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input type="checkbox" checked={lance} onChange={e => setLance(e.target.checked)} />
                      <span className="font-semibold">Lance</span>
                      <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>(AP improves by 1)</span>
                    </label>
                  )},
                  { key: "blast", checked: blastEnabled, node: (
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input type="checkbox" checked={blastEnabled} onChange={e => setBlastEnabled(e.target.checked)} />
                      <span className="font-semibold">Blast</span>
                      {blastEnabled && <input type="number" min={1} className={`w-16 rounded border p-1 text-sm font-bold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"}`} value={blastUnitSize} onChange={e => setBlastUnitSize(Number(e.target.value))} title="Enemy unit size" />}
                      <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>{blastEnabled ? `(+${Math.floor((blastUnitSize||0)/5)} attacks)` : "(+1 per 5 models)"}</span>
                    </label>
                  )},
                  { key: "melta", checked: meltaEnabled, node: (
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input type="checkbox" checked={meltaEnabled} onChange={e => setMeltaEnabled(e.target.checked)} />
                      <span className="font-semibold">Melta</span>
                      {meltaEnabled && <input type="number" min={0} className={`w-14 rounded border p-1 text-sm font-bold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"}`} value={meltaX} onChange={e => setMeltaX(Number(e.target.value))} title="Melta bonus damage" />}
                      <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>(+X damage, half range)</span>
                    </label>
                  )},
                  { key: "antiX", checked: antiXEnabled, node: (
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input type="checkbox" checked={antiXEnabled} onChange={e => { setAntiXEnabled(e.target.checked); if (!e.target.checked) dispatch({ type: "SET_WEAPON_FIELD", field: "critWoundThreshold", value: 6 }); }} />
                      <span className="font-semibold">Anti-X</span>
                      {antiXEnabled && <input type="number" min={2} max={6} className={`w-14 rounded border p-1 text-sm font-bold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"}`} value={antiXThreshold} onChange={e => setAntiXThreshold(Number(e.target.value))} title="Critical wound on N+" />}
                      <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>(crit wound on N+, e.g. Anti-Infantry 4+)</span>
                    </label>
                  )},
                  { key: "plusOneToHit", checked: plusOneToHit, node: (
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input type="checkbox" checked={plusOneToHit} onChange={e => setPlusOneToHit(e.target.checked)} />
                      <span className="font-semibold">+1 To Hit</span>
                      <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>(Heavy, Guided, Markerlights)</span>
                    </label>
                  )},
                  { key: "indirectFire", checked: indirectFire, node: (
                    <label className="flex items-center gap-2 min-h-[36px]">
                      <input type="checkbox" checked={indirectFire} onChange={e => setIndirectFire(e.target.checked)} />
                      <span className="font-semibold">Indirect Fire</span>
                      <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>(-1 to hit)</span>
                    </label>
                  )},
                ]} />

            </Section>

            <Section theme={theme} title="Target 1" action={
  <div className="flex items-center gap-2">
    <button type="button" onClick={toggleSplit}
      className={`rounded px-2 py-1 text-xs font-extrabold border transition ${splitEnabled ? "bg-gradient-to-r from-amber-500 to-orange-500 border-amber-400/40 text-gray-950" : theme === "dark" ? "bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700" : "bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200"}`}>
      {splitEnabled ? "⚔️ Split ON" : "Split Volley"}
    </button>
    <button
      type="button"
      className={`rounded px-2 py-1 text-xs font-semibold border transition ${theme === "dark" ? "bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700" : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100"}`}
      onClick={clearTarget}
    >
      Clear target
    </button>
  </div>
}>
              {hasApiKey && (
                <div className="flex flex-col gap-1 mb-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={unitLookup.defenderText}
                      onChange={e => unitLookup.setDefenderText(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !unitLookup.defenderLoading && unitLookup.defenderText.trim() && unitLookup.fillDefender(dispatch)}
                      placeholder="e.g. doomstalker, ork boy, space marine"
                      className={`flex-1 min-w-0 rounded border px-2 py-1 text-sm ${theme === "dark" ? "bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500" : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400"}`}
                    />
                    <FillButton label="Fill" loading={unitLookup.defenderLoading} disabled={!unitLookup.defenderText.trim()} hasKey={hasApiKey} onClick={() => unitLookup.fillDefender(dispatch)} theme={theme} />
                    <HistoryDropdown
                      history={unitHistory}
                      onFillWeapon={(fields) => dispatch({ type: "LOAD_WEAPON", weapon: fields })}
                      onFillTarget={(fields, unitName, wahapediaUrl, source) => {
                        dispatch({ type: "LOAD_TARGET", target: fields });
                        if (unitName) unitLookup.setDefenderText(unitName);
                        unitLookup.setDefenderMeta({ resolvedName: unitName, wahapediaUrl: wahapediaUrl || "https://wahapedia.ru", source: source || "training" });
                      }}
                      theme={theme}
                      mode="defender"
                    />
                  </div>
                  {unitLookup.defenderError && <span className="text-xs text-red-400">{unitLookup.defenderError}</span>}
                  {unitLookup.defenderOptions
                    ? <DisambiguationChips
                        options={unitLookup.defenderOptions}
                        loading={unitLookup.defenderLoading}
                        onChoose={(choice) => unitLookup.resolveDefender(dispatch, choice)}
                        theme={theme}
                        label="Multiple units found — pick one:"
                      />
                    : <LookupSourceBadge meta={unitLookup.defenderMeta} theme={theme} />
                  }
                </div>
              )}
              <TargetStatTable
                toughness={toughness} setToughness={setToughness}
                armorSave={armorSave} setArmorSave={setArmorSave}
                invulnSave={invulnSave} setInvulnSave={setInvulnSave}
                fnpEnabled={fnpEnabled} setFnpEnabled={setFnpEnabled}
                fnp={fnp} setFnp={setFnp}
                setFnpRollsText={setFnpRollsText}
                isNum={isNum} theme={theme}
              />
              <div className="mt-3">
                <KeywordGroup theme={theme} items={[
                  { key: "inCover", checked: inCover, node: (<label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={inCover} onChange={e => setInCover(e.target.checked)} className="accent-amber-400" /><span>Cover (+1 Sv)</span></label>) },
                  { key: "ignoreAp", checked: ignoreAp, node: (<label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={ignoreAp} onChange={e => setIgnoreAp(e.target.checked)} className="accent-amber-400" /><span>Ignore AP</span></label>) },
                  { key: "ignoreFirstFailedSave", checked: ignoreFirstFailedSave, node: (<label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={ignoreFirstFailedSave} onChange={e => setIgnoreFirstFailedSave(e.target.checked)} className="accent-amber-400" /><span>Ignore 1st failed save</span></label>) },
                  { key: "minusOneDamage", checked: minusOneDamage, node: (<label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={minusOneDamage} onChange={e => setMinusOneDamage(e.target.checked)} className="accent-amber-400" /><span>-1 Damage</span></label>) },
                  { key: "halfDamage", checked: halfDamage, node: (<label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={halfDamage} onChange={e => setHalfDamage(e.target.checked)} className="accent-amber-400" /><span>Half Damage</span></label>) },
                  { key: "stealthSmoke", checked: stealthSmoke, node: (<label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={stealthSmoke} onChange={e => setStealthSmoke(e.target.checked)} className="accent-amber-400" /><span className="font-semibold">Stealth / Smoke</span><span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>(-1 to hit)</span></label>) },
                  { key: "minusOneToWound", checked: minusOneToWound, node: (<label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={minusOneToWound} onChange={e => setMinusOneToWound(e.target.checked)} className="accent-amber-400" /><span className="font-semibold">-1 To Wound</span><span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>(Transhuman Physiology)</span></label>) },
                ]} />
              </div>
              {splitEnabled && (
                <div className="mt-4 space-y-4">
                  {/* Wound allocation summary */}
                  <div className={`rounded-xl p-3 border ${theme === "dark" ? "bg-gray-900/60 border-gray-700" : "bg-gray-50 border-gray-200 text-gray-900"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold">Wound allocation</div>
                      <div className={`text-xs font-bold ${extraWoundsSum <= totalSavableWounds ? (theme === "dark" ? "text-green-400" : "text-green-700") : (theme === "dark" ? "text-red-400" : "text-red-600")}`}>
                        {Math.min(extraWoundsSum, totalSavableWounds) + target1Wounds}/{totalSavableWounds} allocated
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm w-20">🎯 Target 1:</span>
                      <span className={`w-14 rounded border p-1.5 text-center font-bold text-base ${theme === "dark" ? "bg-gray-900/20 border-gray-700 text-amber-400" : "bg-gray-50 border-gray-200 text-amber-600"}`}>{target1Wounds}</span>
                      <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>wounds (remainder)</span>
                    </div>
                    {extraTargets.map((t, i) => (
                      <div key={i} className="flex items-center gap-2 mb-2">
                        <span className="text-sm w-20">🎯 Target {i + 2}:</span>
                        <input type="text" inputMode="numeric"
                          value={t.wounds}
                          onChange={e => setSplitTargetField(i, "wounds", e.target.value.replace(/[^0-9]/g, ""))}
                          className={`w-14 rounded border p-1.5 text-center font-bold text-base ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"}`}
                          placeholder="0"
                        />
                        <span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>wounds</span>
                        <button type="button" onClick={() => removeSplitTarget(i)} className="ml-auto text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-800/40 hover:bg-red-900/20">✕ Remove</button>
                      </div>
                    ))}
                    {extraTargets.length < 3 && totalSavableWounds > 0 && (extraTargets.length === 0 || parseDiceList(woundRollsText).length > 0) && (
                      <button type="button" onClick={() => dispatch({ type: "ADD_SPLIT_TARGET", totalWounds: totalSavableWounds })}
                        className={`mt-1 text-xs px-3 py-1.5 rounded border font-semibold transition ${theme === "dark" ? "border-amber-700/60 text-amber-300 hover:bg-amber-900/20" : "border-amber-400 text-amber-700 hover:bg-amber-50"}`}>
                        + Add Target {extraTargets.length + 2}
                      </button>
                    )}
                  </div>
                  {/* Extra target stats panels */}
                  {extraTargets.map((t, i) => (
                    <div key={i} className={`rounded-xl p-3 border ${theme === "dark" ? "bg-gray-900/40 border-gray-700" : "bg-gray-50 border-gray-200 text-gray-900"}`}>
                      <div className={`text-sm font-extrabold mb-2 ${theme === "dark" ? "text-amber-400" : "text-amber-700"}`}>🎯 Target {i + 2} — Stats</div>
                      <TargetStatTable
                        toughness={t.toughness} setToughness={v => setSplitTargetField(i, "toughness", v)}
                        armorSave={t.armorSave} setArmorSave={v => setSplitTargetField(i, "armorSave", v)}
                        invulnSave={t.invulnSave} setInvulnSave={v => setSplitTargetField(i, "invulnSave", v)}
                        fnpEnabled={t.fnpEnabled} setFnpEnabled={v => setSplitTargetField(i, "fnpEnabled", v)}
                        fnp={t.fnp} setFnp={v => setSplitTargetField(i, "fnp", v)}
                        setFnpRollsText={v => setSplitTargetField(i, "fnpRollsText", v)}
                        isNum={isNum} theme={theme}
                      />
                      <div className="mt-2">
                        <KeywordGroup theme={theme} items={[
                          { key: "inCover", checked: t.inCover, node: (<label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={t.inCover} onChange={e => setSplitTargetField(i, "inCover", e.target.checked)} className="accent-amber-400" /><span>Cover (+1 Sv)</span></label>) },
                          { key: "ignoreAp", checked: t.ignoreAp, node: (<label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={t.ignoreAp} onChange={e => setSplitTargetField(i, "ignoreAp", e.target.checked)} className="accent-amber-400" /><span>Ignore AP</span></label>) },
                          { key: "ignoreFirstFailedSave", checked: t.ignoreFirstFailedSave, node: (<label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={t.ignoreFirstFailedSave} onChange={e => setSplitTargetField(i, "ignoreFirstFailedSave", e.target.checked)} className="accent-amber-400" /><span>Ignore 1st failed save</span></label>) },
                          { key: "minusOneDamage", checked: t.minusOneDamage, node: (<label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={t.minusOneDamage} onChange={e => setSplitTargetField(i, "minusOneDamage", e.target.checked)} className="accent-amber-400" /><span>-1 Damage</span></label>) },
                          { key: "halfDamage", checked: t.halfDamage, node: (<label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={t.halfDamage} onChange={e => setSplitTargetField(i, "halfDamage", e.target.checked)} className="accent-amber-400" /><span>Half Damage</span></label>) },
                          { key: "stealthSmoke", checked: t.stealthSmoke ?? false, node: (<label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={t.stealthSmoke ?? false} onChange={e => setSplitTargetField(i, "stealthSmoke", e.target.checked)} className="accent-amber-400" /><span className="font-semibold">Stealth / Smoke</span><span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>(-1 to hit)</span></label>) },
                          { key: "minusOneToWound", checked: t.minusOneToWound ?? false, node: (<label className="flex items-center gap-2 min-h-[32px]"><input type="checkbox" checked={t.minusOneToWound ?? false} onChange={e => setSplitTargetField(i, "minusOneToWound", e.target.checked)} className="accent-amber-400" /><span className="font-semibold">-1 To Wound</span><span className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>(Transhuman Physiology)</span></label>) },
                        ]} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {showExperimental && (
              <Section theme={theme} title="Experimental">
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={rerollHitOnes} onChange={e => setRerollHitOnes(e.target.checked)} />
                    Reroll hit 1s
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={rerollHitFails} onChange={e => setRerollHitFails(e.target.checked)} />
                    Reroll failed hits
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={rerollWoundOnes} onChange={e => setRerollWoundOnes(e.target.checked)} />
                    Reroll wound 1s
                  </label>
                  <label className={`flex items-center gap-2 ${twinLinked ? "opacity-75" : ""}`}>
                    <input type="checkbox" checked={rerollWoundFails || twinLinked} disabled={twinLinked} onChange={e => setRerollWoundFails(e.target.checked)} />
                    Reroll failed wounds {twinLinked ? <span className="text-xs text-gray-500">(Twin-linked)</span> : null}
                  </label>
                </div>
                <div className="space-y-2 border-t border-gray-700/50 pt-3">
                  <InlineStatField label={<span className="flex items-center gap-1">Crit Hit <FieldHint hint="Default 6. If the weapon crits on 5+, set 5. Affects Lethal Hits and Sustained Hits triggers." theme={theme} /></span>}>
                    <input className={`w-full rounded border p-2 text-xl font-bold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"}`} type="number" value={critHitThreshold} onChange={(e) => setCritHitThreshold(e.target.value)} />
                  </InlineStatField>
                  <InlineStatField label={<span className="flex items-center gap-1">Crit Wound <FieldHint hint="Default 6. Anti-X rules (e.g. Anti-Infantry 4+) may lower this. Affects Devastating Wounds trigger." theme={theme} /></span>}>
                    <input className={`w-full rounded border p-2 text-xl font-bold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"}`} type="number" value={critWoundThreshold} onChange={(e) => setCritWoundThreshold(e.target.value)} />
                  </InlineStatField>
                </div>
              </Section>
            )}

          </div>

          {/* RIGHT: Results */}
          <div className="lg:col-span-6 space-y-4">
                            <Section theme={theme} title={
                              <span className="flex items-center gap-2">
                                Dice entry
                                <DiceEntryTooltip theme={theme} />
                              </span>
                            } action={
                              <div className="flex items-center gap-2">
                                <RollButton
                                  onClick={rollWeapon}
                                  disabled={!statsReady || isRollingAll || isRollingWeapon || isRollingTarget}
                                  isRolling={isRollingWeapon}
                                  isReady={statsReady}
                                  emoji="⚔️"
                                  label="Roll weapon"
                                  readyClass="bg-gradient-to-r from-red-700 to-rose-700 hover:from-red-600 hover:to-rose-600 border-red-500/40 text-white"
                                  rollingClass="bg-red-700 border-red-500 text-white"
                                />
                                <RollButton
                                  onClick={rollTarget}
                                  disabled={!effectiveStatsReady || !((splitEnabled ? target1Wounds : (activeComputed.savableWounds || 0)) > 0) || isRollingAll || isRollingWeapon || isRollingTarget}
                                  isRolling={isRollingTarget}
                                  isReady={effectiveStatsReady && (splitEnabled ? target1Wounds : (activeComputed.savableWounds || 0)) > 0}
                                  emoji="🎯"
                                  label="Roll target"
                                  readyClass="bg-gradient-to-r from-teal-700 to-cyan-700 hover:from-teal-600 hover:to-cyan-600 border-teal-500/40 text-white"
                                  rollingClass="bg-teal-700 border-teal-500 text-white"
                                />
                                <RollButton
                                  onClick={rollAll}
                                  disabled={!effectiveStatsReady || isRollingAll || isRollingWeapon || isRollingTarget}
                                  isRolling={isRollingAll}
                                  isReady={effectiveStatsReady}
                                  emoji="🎲"
                                  label="Roll all"
                                  readyClass="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 border-amber-400/40 text-gray-950"
                                  rollingClass="bg-amber-600 border-amber-400 text-gray-950"
                                />
                                <button
                                  type="button"
                                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-extrabold border transition ${theme === "dark" ? "bg-transparent border-gray-600 text-gray-400 hover:bg-gray-800 hover:text-gray-300" : "bg-transparent border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-gray-700"}`}
                                  onClick={clearDice}
                                >
                                  Clear dice
                                </button>
                              </div>
                            }>

              {!attacksFixed ? (
                              <Field
                                label={
                                  <CounterLabel
                                    prefix={`Attack rolls${parseDiceSpec(attacksValue).mod > 0 ? ` (+${parseDiceSpec(attacksValue).mod * (modelQty ?? 1)} added after)` : ""}`}
                                    need={parseDiceSpec(attacksValue).n * (modelQty ?? 1)}
                                    entered={parseDiceList(attacksRolls).length}
                                    remaining={Math.max(0, parseDiceSpec(attacksValue).n * (modelQty ?? 1) - parseDiceList(attacksRolls).length)}
                                    theme={theme}
                                  />
                                }
                                hint='Enter exactly N dice results (the roll count). Any +N modifier in the expression is added to the total automatically.'
                                theme={theme}
                              >
                                <div className="flex gap-2">
                                  <input
                                    className={`flex-1 min-w-0 rounded border p-2 text-lg font-semibold ${theme === "dark" ? "bg-gray-900/40 border-gray-700 text-gray-100 placeholder:text-gray-500" : "bg-white border-gray-300 text-gray-900"} ${
                                      parseDiceList(attacksRolls).length !== parseDiceSpec(attacksValue).n * (modelQty ?? 1)
                                        ? "border-red-500 ring-2 ring-red-200"
                                        : ""
                                    }`}
                                    value={attacksRolls}
                                    onChange={(e) => setAttacksRolls(e.target.value)}
                                    placeholder='e.g. 3 5 (rolls only — +N modifier is auto-added)'
                                  />
                                  <button type="button" title="Roll for me"
                                    disabled={parseDiceSpec(attacksValue).n === 0}
                                    onClick={() => { const sp = parseDiceSpec(attacksValue); const qty = modelQty ?? 1; setAttacksRolls(Array.from({ length: qty }, () => rollDice(sp.n, sp.sides)).join(" ")); }}
                                    className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                                </div>
                              </Field>
                            ) : null}

              <Field
                              label={<CounterLabel prefix={`Hit rolls${isNum(toHit) && !torrent ? ` · ${Math.max(2, Number(toHit) - effectiveHitMod)}+${effectiveHitMod > 0 ? ` (+${effectiveHitMod})` : effectiveHitMod < 0 ? ` (${effectiveHitMod})` : ""}` : torrent ? " · Auto" : ""}`} need={hitNeeded} entered={hitEntered} remaining={hitNeeded - hitEntered} theme={theme} />}
                              hint="One die per attack. Skip if Torrent (auto-hits). Crits trigger Lethal Hits / Sustained Hits. Count must match A exactly."
                            >
                              <div className="flex gap-2">
                                <ColoredDiceInput
                                  className={`flex-1 min-w-0 rounded border p-2 text-lg font-semibold ${hasHitCountError ? "border-red-500 ring-2 ring-red-200" : ""}`}
                                  value={hitRollsText}
                                  onChange={(e) => setHitRollsText(e.target.value)}
                                  placeholder="e.g. 6 5 2 1 4 ..."
                                  target={Number(toHit)} mod={effectiveHitMod} theme={theme}
                                />
                                <button type="button" title="Roll for me" disabled={hitNeeded === 0}
                                  onClick={() => setHitRollsText(rollDice(hitNeeded, 6))}
                                  className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                              </div>
                            </Field>

                            {(rerollHitOnes || rerollHitFails) ? (
                              <Field
                                label={<CounterLabel prefix="Hit reroll dice" need={hitRerollNeeded} entered={hitRerollEntered} remaining={hitRerollNeeded - hitRerollEntered} theme={theme} />}
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
                                label={<CounterLabel prefix={`Wound rolls${activeComputed.woundTarget > 0 ? ` · ${activeComputed.woundTarget}+` : ""}`} need={woundNeeded} entered={woundEntered} remaining={woundNeeded - woundEntered} theme={theme} />}
                                hint={`One die per hit (incl. Sustained bonus hits). Lethal Hits skip directly to saves — auto-wounds this volley: ${activeComputed.autoWoundsFromLethal}. Count must match the wound roll pool.`}
                              >
                                <div className="flex gap-2">
                                  <ColoredDiceInput
                                    className={`flex-1 min-w-0 rounded border p-2 text-lg font-semibold ${hasWoundCountError ? "border-red-500 ring-2 ring-red-200" : ""}`}
                                    value={woundRollsText}
                                    onChange={(e) => setWoundRollsText(e.target.value)}
                                    placeholder="e.g. 6 4 3 1 ..."
                                    target={activeComputed.woundTarget} mod={effectiveWoundMod} theme={theme}
                                  />
                                  <button type="button" title="Roll for me" disabled={woundNeeded === 0}
                                    onClick={() => setWoundRollsText(rollDice(woundNeeded, 6))}
                                    className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                                </div>
                              </Field>

                            {(rerollWoundOnes || rerollWoundFails || twinLinked) ? (
                              <Field
                                label={<CounterLabel prefix="Wound reroll dice" need={woundRerollNeeded} entered={woundRerollEntered} remaining={woundRerollNeeded - woundRerollEntered} theme={theme} />}
                                hint="Enter rerolled wound dice in order for each eligible reroll. Eligibility is determined from the initial wound rolls."
                              >
                                <div className="flex gap-2">
                                  <ColoredDiceInput
                                    className={`flex-1 min-w-0 rounded border p-2 text-lg font-semibold ${hasWoundRerollCountError ? "border-red-500 ring-2 ring-red-200" : ""}`}
                                    value={woundRerollRollsText}
                                    onChange={(e) => setWoundRerollRollsText(e.target.value)}
                                    placeholder="e.g. 5 4 ..."
                                    target={activeComputed.woundTarget} mod={effectiveWoundMod} theme={theme}
                                  />
                                  <button type="button" title="Roll for me" disabled={woundRerollNeeded === 0}
                                    onClick={() => setWoundRerollRollsText(rollDice(woundRerollNeeded, 6))}
                                    className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                                </div>
                              </Field>
                            ) : null}

                            <>
                                {splitEnabled && <div className={`text-sm font-extrabold tracking-wide mt-2 mb-0 uppercase ${theme === "dark" ? "text-amber-300/80" : "text-amber-700/80"}`}>🎯 Target 1 — Dice</div>}
                                <Field
                                  label={<CounterLabel prefix={`${splitEnabled ? "Save rolls (T1)" : "Save rolls"}${activeComputed.saveTarget > 0 ? ` · ${activeComputed.saveTarget}+` : ""}`} need={saveNeeded} entered={saveEntered} remaining={saveNeeded - saveEntered} theme={theme} />}
                                  hint="One die per savable wound. Mortal wounds (Devastating) bypass saves and go straight to damage. Count must equal wounds allocated to this target."
                                >
                                  <div className="flex gap-2">
                                    <ColoredDiceInput
                                      className={`flex-1 min-w-0 rounded border p-2 text-lg font-semibold ${hasSaveCountError ? "border-red-500 ring-2 ring-red-200" : ""}`}
                                      value={saveRollsText}
                                      onChange={(e) => setSaveRollsText(e.target.value)}
                                      placeholder="e.g. 5 2 6 ..."
                                      target={activeComputed.saveTarget} mod={clampModPlusMinusOne(Number(saveMod) || 0)} theme={theme}
                                    />
                                    <button type="button" title="Roll for me" disabled={saveNeeded === 0}
                                      onClick={() => setSaveRollsText(rollDice(saveNeeded, 6))}
                                      className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                                  </div>
                                </Field>
                              </>

                            {fnpEnabled ? (
                            <Field
                                            label={<CounterLabel prefix={`FNP rolls${fnpEnabled && isNum(fnp) ? ` · ${fnp}+` : ""}`} need={fnpNeeded} entered={fnpEntered} remaining={fnpNeeded - fnpEntered} theme={theme} />}
                                            hint="Only if FNP is enabled. One die per point of damage."
                                          >
                                            <div className="flex gap-2">
                                              <ColoredDiceInput
                                                className={`flex-1 min-w-0 rounded border p-2 text-lg font-semibold ${hasFnpCountError ? "border-red-500 ring-2 ring-red-200" : ""}`}
                                                value={fnpRollsText}
                                                onChange={(e) => setFnpRollsText(e.target.value)}
                                                placeholder="e.g. 1 5 6 2 ..."
                                                target={Number(fnp)} theme={theme}
                                              />
                                              <button type="button" title="Roll for me" disabled={fnpNeeded === 0}
                                                onClick={() => setFnpRollsText(rollDice(fnpNeeded, 6))}
                                                className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                                            </div>
                                          </Field>
                            ) : null}

                            {!damageFixed && (
                              <Field
                                label={
                                  <CounterLabel
                                    prefix={`Damage rolls${parseDiceSpec(damageValue).mod > 0 ? ` (+${parseDiceSpec(damageValue).mod} added after)` : ""}`}
                                    need={parseDiceSpec(damageValue).n * activeComputed.failedSavesEffective}
                                    entered={parseDiceList(damageRolls).length}
                                    remaining={Math.max(0, parseDiceSpec(damageValue).n * activeComputed.failedSavesEffective - parseDiceList(damageRolls).length)}
                                    theme={theme}
                                  />
                                }
                                hint={`${parseDiceSpec(damageValue).n > 1 ? `${parseDiceSpec(damageValue).n} dice` : "One die"} per failed save${parseDiceSpec(damageValue).mod > 0 ? `. +${parseDiceSpec(damageValue).mod} modifier is added per wound automatically` : ""}. Count updates after save rolls are entered.`}
                                theme={theme}
                              >
                                <div className="flex gap-2">
                                  <input
                                    className={`flex-1 min-w-0 rounded border p-2 text-lg font-semibold ${
                                      parseDiceSpec(damageValue).n * activeComputed.failedSavesEffective > 0 && parseDiceList(damageRolls).length < parseDiceSpec(damageValue).n * activeComputed.failedSavesEffective
                                        ? "border-red-500 ring-2 ring-red-200" : ""
                                    }`}
                                    value={damageRolls}
                                    onChange={(e) => setDamageRolls(e.target.value)}
                                    placeholder="e.g. 3 5 2 ..."
                                  />
                                  <button type="button" title="Roll for me"
                                    disabled={activeComputed.failedSavesEffective === 0}
                                    onClick={() => {
                                      const sp = parseDiceSpec(damageValue);
                                      setDamageRolls(rollDice(sp.n * activeComputed.failedSavesEffective, sp.sides));
                                    }}
                                    className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                                </div>
                              </Field>
                            )}

                          {splitEnabled && extraTargets.map((t, i) => {
                            const sr = splitResults[i + 1];
                            const woundsN = Math.max(0, parseInt(t.wounds) || 0);
                            const saveCountMismatch = parseDiceList(t.saveRollsText).length > 0 && parseDiceList(t.saveRollsText).length !== woundsN && woundsN > 0;
                            const tFnpNeeded = sr ? sr.fnpNeeded : 0;
                            const tFnpEntered = parseDiceList(t.fnpRollsText).length;
                            const tFnpCountError = tFnpNeeded > 0 && tFnpEntered !== tFnpNeeded;
                            const tSaveTarget = sr ? sr.saveTarget : 0;
                            const tFnpTarget = t.fnpEnabled && t.fnp !== "" ? Number(t.fnp) : 0;
                            return (
                              <div key={i} className={`border-t mt-2 pt-3 ${theme === "dark" ? "border-gray-700" : "border-gray-200"}`}>
                                <div className={`text-sm font-extrabold tracking-wide mb-1 uppercase ${theme === "dark" ? "text-amber-300/80" : "text-amber-700/80"}`}>
                                  🎯 Target {i + 2} — Dice
                                </div>
                                <div className={`text-xs mb-2 ${theme === "dark" ? "text-amber-400" : "text-amber-600"}`}>
                                  {woundsN} wounds allocated{tSaveTarget > 0 ? ` · save ${tSaveTarget}+` : ""}
                                </div>
                                <Field
                                  label={<CounterLabel prefix={`Save rolls (T${i + 2})${tSaveTarget > 0 ? ` · ${tSaveTarget}+` : ""}`} need={woundsN} entered={parseDiceList(t.saveRollsText).length} remaining={woundsN - parseDiceList(t.saveRollsText).length} theme={theme} />}
                                  hint={sr ? `Save target: ${tSaveTarget}+` : "Enter Target stats first."}
                                  theme={theme}
                                >
                                  <div className="flex gap-2">
                                    <ColoredDiceInput
                                      className={`flex-1 min-w-0 rounded border p-2 text-lg font-semibold ${saveCountMismatch ? "border-red-500 ring-2 ring-red-200" : ""}`}
                                      value={t.saveRollsText}
                                      onChange={e => setSplitTargetField(i, "saveRollsText", e.target.value)}
                                      placeholder="e.g. 5 2 6 ..."
                                      target={tSaveTarget} mod={clampModPlusMinusOne(Number(t.saveMod) || 0)} theme={theme}
                                    />
                                    <button type="button" title="Roll for me" disabled={woundsN === 0}
                                      onClick={() => setSplitTargetField(i, "saveRollsText", rollDice(woundsN, 6))}
                                      className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                                  </div>
                                </Field>
                                {!damageFixed && (
                                  <Field
                                    label={<CounterLabel prefix={`Damage rolls (T${i + 2})`} need={parseDiceSpec(damageValue).n * (sr ? sr.failedSavesEffective : 0)} entered={parseDiceList(t.damageRolls).length} remaining={parseDiceSpec(damageValue).n * (sr ? sr.failedSavesEffective : 0) - parseDiceList(t.damageRolls).length} theme={theme} />}
                                    hint={`${parseDiceSpec(damageValue).n > 1 ? `${parseDiceSpec(damageValue).n} dice` : "One die"} per failed save.`} theme={theme}
                                  >
                                    <div className="flex gap-2">
                                      <input
                                        className={`flex-1 min-w-0 rounded border p-2 text-lg font-semibold`}
                                        value={t.damageRolls}
                                        onChange={e => setSplitTargetField(i, "damageRolls", e.target.value)}
                                        placeholder="e.g. 3 5 2 ..."
                                      />
                                      <button type="button" title="Roll for me"
                                        disabled={!sr || sr.failedSavesEffective === 0}
                                        onClick={() => { const sp = parseDiceSpec(damageValue); setSplitTargetField(i, "damageRolls", rollDice(sr.failedSavesEffective, sp.sides)); }}
                                        className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                                    </div>
                                  </Field>
                                )}
                                {(t.fnpEnabled && t.fnp !== "") && (
                                  <Field
                                    label={<CounterLabel prefix={`FNP rolls (T${i + 2})${tFnpTarget > 0 ? ` · ${tFnpTarget}+` : ""}`} need={tFnpNeeded} entered={tFnpEntered} remaining={tFnpNeeded - tFnpEntered} theme={theme} />}
                                    hint="One die per point of damage." theme={theme}
                                  >
                                    <div className="flex gap-2">
                                      <ColoredDiceInput
                                        className={`flex-1 min-w-0 rounded border p-2 text-lg font-semibold ${tFnpCountError ? "border-red-500 ring-2 ring-red-200" : ""}`}
                                        value={t.fnpRollsText}
                                        onChange={e => setSplitTargetField(i, "fnpRollsText", e.target.value)}
                                        placeholder="e.g. 1 5 6 ..."
                                        target={tFnpTarget} theme={theme}
                                      />
                                      <button type="button" title="Roll for me"
                                        disabled={tFnpNeeded === 0}
                                        onClick={() => setSplitTargetField(i, "fnpRollsText", rollDice(tFnpNeeded, 6))}
                                        className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-gray-950 px-3 font-bold text-lg transition">🎲</button>
                                    </div>
                                  </Field>
                                )}
                              </div>
                            );
                          })}

                          </Section>

<Section theme={theme} title="Results" action={
  <div className="flex items-center gap-2">
    <div className={`inline-flex items-center gap-1.5 rounded-xl border px-2 py-0.5 text-xs font-bold ${statusClass}`}>
      <span className="leading-none">{statusEmoji}</span>
      <span>{status}</span>
    </div>
    <select
      className="rounded px-2 py-1 text-xs font-extrabold border transition bg-gradient-to-r from-yellow-400/80 to-amber-400/80 text-gray-950 border-yellow-200/40 hover:from-yellow-300/90 hover:to-amber-300/90 cursor-pointer"
      title="Load a preset example"
      value=""
      onChange={e => {
        const idx = Number(e.target.value);
        if (!isNaN(idx) && e.target.value !== "") {
          dispatch({ type: "LOAD_PRESET", preset: PRESETS[idx] });
        }
      }}
    >
      <option value="" disabled>Load preset…</option>
      {PRESETS.map((p, i) => (
        <option key={i} value={i}>{p.label}</option>
      ))}
    </select>
    <button
      type="button"
      className={`rounded px-2 py-1 text-xs font-semibold border transition ${theme === "dark" ? "bg-gray-900 text-gray-100 border-gray-700 hover:bg-gray-800" : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"}`}
      onClick={() => { handleClearAllEaster(); clearAll(); }}
    >
      Clear all
    </button>
  </div>
}>

                
                {/* Prominent total damage panel (full width) */}
                {splitEnabled && activeSplitResults.length > 1 ? (
                  // ── Split view: per-target grid inside the same viz panel ──
                  <div className={`mt-4 rounded-2xl border p-4 ${viz.totalPanel} relative overflow-visible`}>
                    {diceReady && allSplitStatsReady ? (
                      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl" style={{ opacity: isAnyRolling ? 0 : 0.15, transition: "opacity 0.5s ease" }}>
                        <div className="nape-marquee-row" style={{ animationDuration: "24s" }}>
                          {Array.from({ length: 28 }).map((_, i) => <span key={`m-${i}`}>{viz.emoji}</span>)}
                          {Array.from({ length: 28 }).map((_, i) => <span key={`m-dup-${i}`}>{viz.emoji}</span>)}
                        </div>
                        <div className="nape-marquee-row nape-marquee-reverse" style={{ animationDuration: "26s" }}>
                          {Array.from({ length: 28 }).map((_, i) => <span key={`mr-${i}`}>{viz.emoji}</span>)}
                          {Array.from({ length: 28 }).map((_, i) => <span key={`mr-dup-${i}`}>{viz.emoji}</span>)}
                        </div>
                      </div>
                    ) : null}
                    <div className="relative">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className={`text-sm uppercase tracking-widest ${viz.totalLabel}`}>
                            {viz.emoji} {allSplitStatsReady ? totalLabelText : "Partial Total · Soft"}
                          </div>
                          <div className={`text-sm ${viz.totalMeta}`}>{viz.title} · {viz.sub}</div>
                          {!allSplitStatsReady
                            ? <div className={`text-xs mt-1 ${theme === "dark" ? "text-red-400" : "text-red-500"}`}>Some targets missing stats — total is a minimum estimate</div>
                            : softNote ? <div className={`text-xs ${viz.totalMeta} mt-1`}>{softNote}</div> : null}
                        </div>
                        <div className={`text-sm ${viz.totalMeta}`}>{diceReady && allSplitStatsReady ? 'final · post-mitigation' : 'preview'}</div>
                      </div>
                      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(80px, 1fr))` }}>
                        {activeSplitResults.map((r, i) => {
                          const tReady = splitTargetStatsReady[i];
                          const tDmg = tReady && allowDamageTotals && r ? r.totalPostFnp : null;
                          return (
                            <div key={i} className={`rounded-xl p-2 border text-center ${theme === "dark" ? "bg-slate-900/60 border-gray-700" : "bg-white/60 border-gray-200"}`}>
                              <div className={`text-xs uppercase tracking-widest mb-1 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>🎯 Target {i + 1}</div>
                              {!tReady ? (
                                <>
                                  <div className={`text-4xl font-black ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}>?</div>
                                  <div className={`text-xs ${theme === "dark" ? "text-red-400/80" : "text-red-500"}`}>stats missing</div>
                                </>
                              ) : (
                                <>
                                  <div className={`text-4xl font-black ${viz.totalNumber}`}>{tDmg ?? '–'}</div>
                                  <div className={`text-xs ${viz.totalMeta}`}>dmg</div>
                                </>
                              )}
                            </div>
                          );
                        })}
                        <div
                          className={`rounded-xl p-2 border text-center cursor-pointer ${theme === "dark" ? "bg-slate-900/60 border-gray-600" : "bg-white/60 border-gray-300"}`}
                          onClick={() => setSecretClicks((c) => c + 1)}
                          title="Konami-style easter egg, (secret) click 5x"
                        >
                          <div className={`text-xs uppercase tracking-widest mb-1 ${viz.totalLabel}`}>Total</div>
                          <div className={`text-4xl font-black ${viz.totalNumber}`}>
                            {allowDamageTotals ? `${dmgStr}${allSplitStatsReady ? '' : '+'}` : '–'}
                          </div>
                          <div className={`text-xs ${viz.totalMeta}`}>{allSplitStatsReady ? 'dmg' : 'soft'}</div>
                        </div>
                      </div>
                      {easterEgg ? (
                        <div className={`mt-3 rounded-xl border p-3 text-center ${easterEgg?.style === "dbz" ? "border-yellow-300 bg-gradient-to-r from-purple-700 via-indigo-600 to-yellow-500 text-white" : "border-amber-300 bg-amber-50 text-gray-900"}`}>
                          <div className={`text-lg font-extrabold ${easterEgg?.style === "dbz" ? "drop-shadow" : ""}`}>{easterEgg.title}</div>
                          <div className="text-2xl">{easterEgg.emoji}</div>
                          {easterEgg.note ? <div className={`mt-1 text-xs ${easterEgg?.style === "dbz" ? "text-white/90 drop-shadow" : "text-gray-700"}`}>{easterEgg.note}</div> : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  // ── Normal single-target view ──
                  <div className={`mt-4 rounded-2xl border p-4 ${viz.totalPanel} relative overflow-visible w-full`}>
                    {diceReady ? (
                      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl" style={{ opacity: isAnyRolling ? 0 : 0.15, transition: "opacity 0.5s ease" }}>
                        <div className="nape-marquee-row" style={{ animationDuration: "24s" }}>
                          {Array.from({ length: 28 }).map((_, i) => <span key={`m-${i}`}>{viz.emoji}</span>)}
                          {Array.from({ length: 28 }).map((_, i) => <span key={`m-dup-${i}`}>{viz.emoji}</span>)}
                        </div>
                        <div className="nape-marquee-row nape-marquee-reverse" style={{ animationDuration: "26s" }}>
                          {Array.from({ length: 28 }).map((_, i) => <span key={`mr-${i}`}>{viz.emoji}</span>)}
                          {Array.from({ length: 28 }).map((_, i) => <span key={`mr-dup-${i}`}>{viz.emoji}</span>)}
                        </div>
                      </div>
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
                )}

              </Section>


              {showLog && (
                <Section theme={theme} title="Step-by-step log">
                  <ol className={`text-sm leading-relaxed list-decimal pl-5 space-y-1 ${theme === "dark" ? "text-gray-100" : "text-gray-800"}`}>
                    {activeComputed.log.map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ol>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div className={`rounded-lg border p-2 ${theme === "dark" ? "bg-gray-900 border-gray-700 text-gray-100" : "bg-white border-gray-200 text-gray-900"}`}>
                      <div className="text-base font-extrabold">Attack math</div>
                      <div className="mt-1">{activeComputed.A} attacks</div>
                      <div>Wound-roll pool: {activeComputed.woundRollPool}</div>
                      <div>Wound target: {activeComputed.needed}+</div>
                      {splitEnabled && activeSplitResults.length > 1 ? (
                        activeSplitResults.map((r, i) => (
                          <div key={i}>T{i+1} save target: {r?.saveTarget ?? "—"}+{i === 0 ? ` (${target1Wounds} wounds)` : ` (${extraTargets[i-1]?.wounds ?? 0} wounds)`}</div>
                        ))
                      ) : (
                        <div>Save target: {activeComputed.saveTarget}+</div>
                      )}
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
                          <div className={`text-3xl font-extrabold ${theme === "dark" ? "text-white" : "text-gray-900"}`}>{shownNormalDamage}</div>
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
                  </div>
                </Section>
              )}

              {showProbability && (
                <Section theme={theme} title="📊 Damage Probability Distribution">
                  <ProbabilityPanel theme={theme} statsReady={statsReady} params={{
                    attacksFixed, attacksValue, attacksRolls, modelQty,
                    rapidFire, rapidFireX, halfRange,
                    blastEnabled, blastUnitSize,
                    toHit, hitMod: effectiveHitMod, overwatch,
                    strength, ap, lance,
                    damageFixed, damageValue,
                    critHitThreshold, critWoundThreshold,
                    antiXEnabled, antiXThreshold,
                    torrent, lethalHits, sustainedHits, sustainedHitsN,
                    devastatingWounds,
                    rerollHitOnes, rerollHitFails,
                    rerollWoundOnes, rerollWoundFails, twinLinked,
                    toughness, armorSave, invulnSave,
                    inCover, ignoreAp, saveMod,
                    ignoreFirstFailedSave, minusOneDamage, halfDamage,
                    fnpEnabled, fnp,
                    meltaEnabled, meltaX,
                    woundMod: effectiveWoundMod,
                  }} />
                </Section>
              )}
          </div>

        </div>

          <div className="rounded-2xl bg-gray-900/40 border border-gray-700 text-gray-100 p-3 sm:p-4">
            <div className="flex flex-wrap justify-between gap-y-2">
              <div className="flex flex-wrap gap-2">
                {[
                  { label: showTableUse ? "Hide table guide" : "📋 Table guide", on: showTableUse, action: () => setShowTableUse(!showTableUse), title: "Show/hide table use guide" },
                  { label: showDiceRef ? "Hide dice ref" : "🎲 Dice ref", on: showDiceRef, action: () => setShowDiceRef(!showDiceRef), title: "Dice sequencing reference" },
                  { label: showCheatSheet ? "Hide cheat sheet" : "Cheat sheet", on: showCheatSheet, action: () => setShowCheatSheet(!showCheatSheet) },
                  { label: `Preserve hooks: ${preserveHooks ? "ON" : "OFF"}`, on: preserveHooks, action: () => setPreserveHooks(!preserveHooks), title: "Keep toggle states on Clear" },
                  { label: `Strict: ${strictMode ? "ON" : "OFF"}`, on: strictMode, action: () => setStrictMode(!strictMode), title: "Lock totals until dice complete" },
                  { label: showLog ? "Hide log" : "Show log", on: showLog, action: () => setShowLog(!showLog) },
                  { label: showProbability ? "Hide probability" : "📊 Probability", on: showProbability, action: () => setShowProbability(!showProbability), title: "Show damage probability distribution" },
                  { label: showExperimental ? "Hide experimental" : "Experimental", on: showExperimental, action: () => setShowExperimental(!showExperimental), title: "Show/hide rerolls and crit thresholds" },
                ].map(({ label, on, action, title }) => (
                  <button key={label} type="button"
                    className={`rounded px-2 py-1 text-xs font-semibold border transition ${on ? "bg-amber-600/70 text-white border-amber-500/40" : "bg-gray-900 text-gray-300 border-gray-700 hover:bg-gray-800"}`}
                    onClick={action} title={title}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 items-start">
                <button type="button"
                  className={`rounded px-2 py-1 text-xs font-bold border transition shrink-0 ${theme === "dark" ? "bg-slate-800 border-gray-600 text-gray-300 hover:bg-slate-700" : "bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200"}`}
                  onClick={toggleTheme} title="Toggle dark/light theme">
                  {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
                </button>
                <SettingsPanel theme={theme} />
              </div>
            </div>



          {showTableUse && (
            <div className={`rounded-2xl border p-4 ${theme === "dark" ? "bg-slate-900 border-gray-700 text-gray-100" : "bg-white border-gray-200 text-gray-900"}`}>
              <div className="text-sm font-extrabold mb-2">📋 Table Use Guide</div>
              <ul className="text-xs space-y-1.5 list-disc pl-5 text-gray-300">
                <li>Enter <strong>Weapon</strong> stats first (A, BS/WS, S, AP, D), then <strong>Target</strong> stats (T, Sv+).</li>
                <li>If Attacks is random (D6, 2D6, D6+1) enter the expression, roll your attack dice, enter the rolled values in <em>Attack rolls</em>. The +N modifier is added automatically.</li>
                <li>Roll and enter dice in sequence: Hit → Wound → Save → FNP (if enabled).</li>
                <li>Wound-roll pool auto-adjusts for Lethal Hits and Sustained Hits.</li>
                <li>Split Volley: enable after wound rolls to divide wounds across multiple targets, each with their own stats and save dice.</li>
                <li>Use <strong>Roll all</strong> to auto-fill all dice at once for quick previews.</li>
              </ul>
            </div>
          )}

          {showDiceRef && (
            <div className={`rounded-2xl border p-4 ${theme === "dark" ? "bg-slate-900 border-gray-700 text-gray-100" : "bg-white border-gray-200 text-gray-900"}`}>
              <div className="text-sm font-extrabold mb-2">🎲 Dice Reference</div>
              <div className={`rounded-xl border p-3 text-xs ${theme === "dark" ? "bg-gray-900 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                <DiceEntryTooltipContent theme={theme} />
              </div>
            </div>
          )}

          {showCheatSheet && (
            <div className="mt-4 rounded-xl border border-gray-700 bg-gray-950/30 p-3">
              <div className="text-sm font-semibold">Keyword cheat sheet</div>
              <div className="mt-1 text-xs text-gray-300">
                Weapon keywords first, then target keywords — same order as the dropdowns.
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
              .nape-dice-input:empty::before {
                content: attr(data-placeholder);
                color: #6b7280;
                pointer-events: none;
              }
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
                animation: napeMarquee linear infinite alternate;
                will-change: transform;
              }
              .nape-emoji-tile {display:flex; align-items:center; justify-content:center;}
            .nape-emoji-tile-inner {font-size: 3.25rem; line-height:1.05; white-space: pre-wrap;}

            .nape-marquee-reverse {
                animation-direction: alternate-reverse;
                padding-top: 0.25rem;
              }
            `}</style>
        </div>
      </div>
      </div>
    </div>
  );
}

export default AttackCalculator;