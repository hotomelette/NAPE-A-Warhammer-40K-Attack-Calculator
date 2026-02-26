/**
 * appReducer.js
 * All application state consolidated into logical slices.
 * Enables atomic clear/load/preset operations with a single dispatch.
 */

// ─────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────

export const initialWeapon = {
  attacksFixed: true,
  attacksValue: "",
  attacksRolls: "",
  toHit: "",
  strength: "",
  ap: "",
  damageFixed: true,
  damageValue: "",
  damageRolls: "",
  critHitThreshold: 6,
  critWoundThreshold: 6,
  rapidFire: false,
  rapidFireX: 0,
  halfRange: false,
  torrent: false,
  lethalHits: false,
  sustainedHits: false,
  sustainedHitsN: 1,
  devastatingWounds: false,
  precision: false,
  hitMod: 0,
  woundMod: 0,
};

export const initialTarget = {
  toughness: "",
  armorSave: "",
  invulnSave: "",
  fnpEnabled: false,
  fnp: "",
  inCover: false,
  ignoreAp: false,
  ignoreFirstFailedSave: false,
  minusOneDamage: false,
  halfDamage: false,
  saveMod: 0,
  hasLeaderAttached: false,
  allocatePrecisionToLeader: false,
};

export const initialDice = {
  hitRollsText: "",
  woundRollsText: "",
  saveRollsText: "",
  fnpRollsText: "",
  hitRerollRollsText: "",
  woundRerollRollsText: "",
};

export const initialRerolls = {
  rerollHitOnes: false,
  rerollHitFails: false,
  rerollWoundOnes: false,
  rerollWoundFails: false,
  twinLinked: false,
  showRerolls: false,
};

export const initialUI = {
  theme: (() => {
    try { return localStorage.getItem("nape-theme") || "dark"; } catch { return "dark"; }
  })(),
  simpleMode: (() => {
    try { return localStorage.getItem("nape-simple-mode") === "true"; } catch { return false; }
  })(),
  showLog: true,
  showLimitations: false,
  showCheatSheet: false,
  showDiceRef: false,
  showWizard: false,
  strictMode: false,
  preserveHooks: false,
};

export const initialEaster = {
  secretClicks: 0,
  emperorToast: false,
  clearAllTapCount: 0,
  lastClearAllTapMs: 0,
};

// A single extra target entry (used in splitTargets array)
export const initialSplitTarget = {
  toughness: "",
  armorSave: "",
  invulnSave: "",
  fnpEnabled: false,
  fnp: "",
  inCover: false,
  ignoreAp: false,
  ignoreFirstFailedSave: false,
  minusOneDamage: false,
  halfDamage: false,
  saveMod: 0,
  wounds: "",           // how many savable wounds are allocated here (string for input)
  saveRollsText: "",
  damageRolls: "",
  fnpRollsText: "",
};

export const initialSplit = {
  enabled: false,
  // splitTargets[0] is always Target 1 allocation (rest of wounds go here auto)
  // Additional entries are extra split targets (Target 2, 3, 4...)
  extraTargets: [],  // array of initialSplitTarget
};

export const initialState = {
  weapon: initialWeapon,
  target: initialTarget,
  dice: initialDice,
  rerolls: initialRerolls,
  ui: initialUI,
  easter: initialEaster,
  split: initialSplit,
};

// ─────────────────────────────────────────
// Example preset
// ─────────────────────────────────────────

export const EXAMPLE_WEAPON = {
  ...initialWeapon,
  attacksFixed: true,
  attacksValue: "10",
  toHit: "3",
  strength: "5",
  ap: "-1",
  damageFixed: true,
  damageValue: "2",
};

export const EXAMPLE_TARGET = {
  ...initialTarget,
  toughness: "4",
  armorSave: "3",
};

export const EXAMPLE_DICE = {
  ...initialDice,
  hitRollsText: "6 5 5 4 4 3 2 2 1 6",
  woundRollsText: "6 5 4 3 2 1 6",
  saveRollsText: "1 2 4 5 6",
};

// ─────────────────────────────────────────
// Reducers
// ─────────────────────────────────────────

function weaponReducer(state, action) {
  switch (action.type) {
    case "SET_WEAPON_FIELD":
      return { ...state, [action.field]: action.value };
    case "CLEAR_WEAPON":
      return action.preserveHooks
        ? { ...initialWeapon, hitMod: state.hitMod, woundMod: state.woundMod }
        : { ...initialWeapon };
    case "LOAD_WEAPON":
      return { ...initialWeapon, ...action.weapon };
    default:
      return state;
  }
}

function targetReducer(state, action) {
  switch (action.type) {
    case "SET_TARGET_FIELD":
      return { ...state, [action.field]: action.value };
    case "CLEAR_TARGET":
      return action.preserveHooks
        ? { ...initialTarget, saveMod: state.saveMod }
        : { ...initialTarget };
    case "LOAD_TARGET":
      return { ...initialTarget, ...action.target };
    default:
      return state;
  }
}

function diceReducer(state, action) {
  switch (action.type) {
    case "SET_DICE_FIELD":
      return { ...state, [action.field]: action.value };
    case "CLEAR_DICE":
      return { ...initialDice };
    case "LOAD_DICE":
      return { ...initialDice, ...action.dice };
    default:
      return state;
  }
}

function rerollsReducer(state, action) {
  switch (action.type) {
    case "SET_REROLL_FIELD":
      return { ...state, [action.field]: action.value };
    default:
      return state;
  }
}

function uiReducer(state, action) {
  switch (action.type) {
    case "SET_UI_FIELD":
      return { ...state, [action.field]: action.value };
    case "TOGGLE_THEME": {
      const next = state.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem("nape-theme", next); } catch {}
      return { ...state, theme: next };
    }
    case "TOGGLE_SIMPLE_MODE": {
      const next = !state.simpleMode;
      try { localStorage.setItem("nape-simple-mode", String(next)); } catch {}
      return { ...state, simpleMode: next };
    }
    default:
      return state;
  }
}

function easterReducer(state, action) {
  switch (action.type) {
    case "SET_EASTER_FIELD":
      return { ...state, [action.field]: action.value };
    default:
      return state;
  }
}

function splitReducer(state, action) {
  switch (action.type) {
    case "TOGGLE_SPLIT":
      return { ...initialSplit, enabled: !state.enabled };
    case "CLEAR_SPLIT":
      return { ...initialSplit };
    case "ADD_SPLIT_TARGET": {
      // Max 3 extra targets (so Target 1 + up to 3 extras = 4 total)
      if (state.extraTargets.length >= 3) return state;
      return { ...state, extraTargets: [...state.extraTargets, { ...initialSplitTarget }] };
    }
    case "REMOVE_SPLIT_TARGET": {
      const next = state.extraTargets.filter((_, i) => i !== action.index);
      return { ...state, extraTargets: next };
    }
    case "SET_SPLIT_TARGET_FIELD": {
      const next = state.extraTargets.map((t, i) =>
        i === action.index ? { ...t, [action.field]: action.value } : t
      );
      return { ...state, extraTargets: next };
    }
    case "SET_TARGET1_WOUNDS":
      return { ...state, woundsToTarget1: action.value };
    default:
      return state;
  }
}

// ─────────────────────────────────────────
// Root reducer
// ─────────────────────────────────────────

export function appReducer(state, action) {
  switch (action.type) {

    // ── Compound actions ──

    case "CLEAR_ALL": {
      const preserveHooks = state.ui.preserveHooks;
      const savedHooks = preserveHooks ? {
        hitMod: state.weapon.hitMod,
        woundMod: state.weapon.woundMod,
        saveMod: state.target.saveMod,
        hasLeaderAttached: state.target.hasLeaderAttached,
        allocatePrecisionToLeader: state.target.allocatePrecisionToLeader,
      } : {};
      return {
        ...state,
        weapon: preserveHooks
          ? { ...initialWeapon, hitMod: savedHooks.hitMod, woundMod: savedHooks.woundMod }
          : { ...initialWeapon },
        target: preserveHooks
          ? { ...initialTarget, saveMod: savedHooks.saveMod, hasLeaderAttached: savedHooks.hasLeaderAttached, allocatePrecisionToLeader: savedHooks.allocatePrecisionToLeader }
          : { ...initialTarget },
        dice: { ...initialDice },
        split: { ...initialSplit },
      };
    }

    case "LOAD_EXAMPLE": {
      const preserveHooks = state.ui.preserveHooks;
      return {
        ...state,
        weapon: preserveHooks
          ? { ...EXAMPLE_WEAPON, hitMod: state.weapon.hitMod, woundMod: state.weapon.woundMod }
          : { ...EXAMPLE_WEAPON },
        target: preserveHooks
          ? { ...EXAMPLE_TARGET, saveMod: state.target.saveMod }
          : { ...EXAMPLE_TARGET },
        dice: { ...EXAMPLE_DICE },
      };
    }

    case "LOAD_PRESET":
      return {
        ...state,
        weapon: { ...initialWeapon, ...action.preset.weapon },
        target: { ...initialTarget, ...action.preset.target },
        dice: { ...initialDice },
      };

    // ── Slice delegation ──

    case "SET_WEAPON_FIELD":
    case "CLEAR_WEAPON":
    case "LOAD_WEAPON":
      return { ...state, weapon: weaponReducer(state.weapon, { ...action, preserveHooks: state.ui.preserveHooks }) };

    case "SET_TARGET_FIELD":
    case "CLEAR_TARGET":
    case "LOAD_TARGET":
      return { ...state, target: targetReducer(state.target, { ...action, preserveHooks: state.ui.preserveHooks }) };

    case "SET_DICE_FIELD":
    case "CLEAR_DICE":
    case "LOAD_DICE":
      return { ...state, dice: diceReducer(state.dice, action) };

    case "SET_REROLL_FIELD":
      return { ...state, rerolls: rerollsReducer(state.rerolls, action) };

    case "SET_UI_FIELD":
    case "TOGGLE_THEME":
    case "TOGGLE_SIMPLE_MODE":
      return { ...state, ui: uiReducer(state.ui, action) };

    case "SET_EASTER_FIELD":
      return { ...state, easter: easterReducer(state.easter, action) };

    case "TOGGLE_SPLIT":
    case "CLEAR_SPLIT":
    case "ADD_SPLIT_TARGET":
    case "REMOVE_SPLIT_TARGET":
    case "SET_SPLIT_TARGET_FIELD":
    case "SET_TARGET1_WOUNDS":
      return { ...state, split: splitReducer(state.split, action) };

    default:
      return state;
  }
}
