import { useState, useCallback } from "react";
import { fetchAttackerStats, fetchDefenderStats, fetchAttackerStatsFromPage, fetchDefenderStatsFromPage } from "./claudeService.js";

function unitNameFromUrl(wahapediaUrl, fallback) {
  if (wahapediaUrl && wahapediaUrl !== "https://wahapedia.ru") {
    const slug = wahapediaUrl.split("/").pop();
    if (slug && slug.length > 1) return slug.replace(/-/g, " ");
  }
  return fallback;
}

function classifyError(err) {
  const msg = err?.message ?? "";
  if (msg.includes("credit balance is too low"))
    return "Insufficient API credits — add funds at console.anthropic.com";
  if (msg.includes("401") || msg.includes("authentication"))
    return "Invalid API key — check your key in ⚙ settings";
  return "Couldn't identify unit — try a different description";
}

export function useUnitLookup(getApiKey, history) {
  const [attackerText, setAttackerText] = useState("");
  const [defenderText, setDefenderText] = useState("");
  const [attackerLoading, setAttackerLoading] = useState(false);
  const [defenderLoading, setDefenderLoading] = useState(false);
  const [attackerError, setAttackerError] = useState(null);
  const [defenderError, setDefenderError] = useState(null);
  const [lastFilled, setLastFilled] = useState(null);
  const [attackerMeta, setAttackerMeta] = useState(null);
  const [defenderMeta, setDefenderMeta] = useState(null);
  const [attackerOptions, setAttackerOptions] = useState(null);
  const [defenderOptions, setDefenderOptions] = useState(null);
  const [attackerPageCache, setAttackerPageCache] = useState(null);
  const [defenderPageCache, setDefenderPageCache] = useState(null);
  // Cache target fields captured during attacker disambiguation
  const [attackerTargetFieldsCache, setAttackerTargetFieldsCache] = useState(null);
  // Cache pre-fetched weapon fields from all_stats response (label → fields)
  const [attackerWeaponsCache, setAttackerWeaponsCache] = useState(null);

  const fillAttacker = useCallback(async (dispatch) => {
    setAttackerLoading(true);
    setAttackerError(null);
    setAttackerOptions(null);
    setAttackerPageCache(null);
    setAttackerTargetFieldsCache(null);
    setAttackerWeaponsCache(null);
    try {
      const apiKey = getApiKey();
      const result = await fetchAttackerStats(attackerText, apiKey);

      if (result.type === "disambiguation") {
        setAttackerOptions(result.options);
        setAttackerPageCache(result.pageCache);
        setAttackerTargetFieldsCache(result.targetFields ?? null);
        if (result.targetFields && history) {
          history.addOrUpdateEntry(attackerText, unitNameFromUrl(result.pageCache?.wahapediaUrl, attackerText), result.targetFields, result.pageCache?.wahapediaUrl ?? "", result.pageCache?.source);
        }
        // Pre-fetch all weapon stats in parallel using the already-fetched page
        // (background, non-blocking — cache fills as each resolves)
        const apiKey = getApiKey();
        const pageCache = result.pageCache;
        const searchText = attackerText;
        Promise.all(result.options.map(async weapon => {
          try {
            const r = await fetchAttackerStatsFromPage(searchText, weapon, pageCache, apiKey);
            if (r?.fields) {
              if (history) history.addWeapon(searchText, weapon, r.fields);
              setAttackerWeaponsCache(prev => ({ ...(prev || {}), [weapon]: r.fields }));
            }
          } catch { /* silently ignore individual weapon fetch failures */ }
        }));
      } else {
        const { fields, targetFields, meta } = result;
        dispatch({ type: "LOAD_WEAPON", weapon: fields });
        setAttackerMeta(meta);
        setLastFilled("attacker");
        if (history) {
          if (targetFields) history.addOrUpdateEntry(attackerText, unitNameFromUrl(meta.wahapediaUrl, attackerText), targetFields, meta.wahapediaUrl ?? "", meta.source);
          history.addWeapon(attackerText, meta.resolvedName, fields);
        }
      }
    } catch (err) {
      console.error("[UnitLookup] fillAttacker failed:", err);
      setAttackerError(classifyError(err));
    } finally {
      setAttackerLoading(false);
    }
  }, [attackerText, getApiKey, history]);

  const resolveAttacker = useCallback(async (dispatch, choice) => {
    setAttackerLoading(true);
    setAttackerError(null);
    try {
      // Use pre-fetched weapon data if available (all_stats path — no API call needed)
      if (attackerWeaponsCache && attackerWeaponsCache[choice]) {
        const fields = attackerWeaponsCache[choice];
        dispatch({ type: "LOAD_WEAPON", weapon: fields });
        setAttackerMeta({ resolvedName: choice, wahapediaUrl: attackerPageCache?.wahapediaUrl ?? "", source: attackerPageCache?.source ?? "training" });
        setLastFilled("attacker");
        setAttackerOptions(null);
        setAttackerPageCache(null);
        setAttackerWeaponsCache(null);
        return;
      }
      // Fallback: API call (old disambiguation path)
      const apiKey = getApiKey();
      const result = await fetchAttackerStatsFromPage(attackerText, choice, attackerPageCache, apiKey);
      const { fields, targetFields, meta } = result;
      dispatch({ type: "LOAD_WEAPON", weapon: fields });
      setAttackerMeta(meta);
      setLastFilled("attacker");
      setAttackerOptions(null);
      setAttackerPageCache(null);
      const resolvedTargetFields = targetFields ?? attackerTargetFieldsCache;
      if (history) {
        if (resolvedTargetFields) history.addOrUpdateEntry(attackerText, unitNameFromUrl(meta.wahapediaUrl, attackerText), resolvedTargetFields, meta.wahapediaUrl ?? "", meta.source);
        history.addWeapon(attackerText, choice, fields);
      }
    } catch (err) {
      console.error("[UnitLookup] resolveAttacker failed:", err);
      setAttackerError(classifyError(err));
    } finally {
      setAttackerLoading(false);
    }
  }, [attackerText, attackerPageCache, attackerTargetFieldsCache, attackerWeaponsCache, getApiKey, history]);

  const fillDefender = useCallback(async (dispatch) => {
    setDefenderLoading(true);
    setDefenderError(null);
    setDefenderOptions(null);
    setDefenderPageCache(null);
    try {
      const apiKey = getApiKey();
      const result = await fetchDefenderStats(defenderText, apiKey);
      if (result.type === "disambiguation") {
        setDefenderOptions(result.options);
        setDefenderPageCache(result.pageCache);
      } else {
        const { fields, meta } = result;
        dispatch({ type: "LOAD_TARGET", target: fields });
        setDefenderMeta(meta);
        setDefenderOptions(null);
        setDefenderPageCache(null);
        setLastFilled("defender");
        if (history) history.addOrUpdateEntry(defenderText, unitNameFromUrl(meta.wahapediaUrl, defenderText), fields, meta.wahapediaUrl ?? "", meta.source);
      }
    } catch (err) {
      console.error("[UnitLookup] fillDefender failed:", err);
      setDefenderError(classifyError(err));
    } finally {
      setDefenderLoading(false);
    }
  }, [defenderText, getApiKey, history]);

  const resolveDefender = useCallback(async (dispatch, choice) => {
    setDefenderLoading(true);
    setDefenderError(null);
    try {
      const apiKey = getApiKey();
      const { fields, meta } = await fetchDefenderStatsFromPage(defenderText, choice, defenderPageCache, apiKey);
      dispatch({ type: "LOAD_TARGET", target: fields });
      setDefenderMeta(meta);
      setLastFilled("defender");
      setDefenderOptions(null);
      setDefenderPageCache(null);
      if (history) history.addOrUpdateEntry(defenderText, unitNameFromUrl(meta.wahapediaUrl, defenderText), fields, meta.wahapediaUrl ?? "", meta.source);
    } catch (err) {
      console.error("[UnitLookup] resolveDefender failed:", err);
      setDefenderError(classifyError(err));
    } finally {
      setDefenderLoading(false);
    }
  }, [defenderText, defenderPageCache, getApiKey, history]);

  return {
    attackerText, setAttackerText,
    defenderText, setDefenderText,
    attackerLoading, defenderLoading,
    attackerError, defenderError,
    lastFilled, fillAttacker, fillDefender,
    attackerMeta, setAttackerMeta,
    defenderMeta, setDefenderMeta,
    attackerOptions, defenderOptions,
    resolveAttacker, resolveDefender,
  };
}
