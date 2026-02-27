import { useState, useCallback } from "react";
import { fetchAttackerStats, fetchDefenderStats, fetchAttackerStatsFromPage, fetchDefenderStatsFromPage } from "./claudeService.js";

function classifyError(err) {
  const msg = err?.message ?? "";
  if (msg.includes("credit balance is too low"))
    return "Insufficient API credits — add funds at console.anthropic.com";
  if (msg.includes("401") || msg.includes("authentication"))
    return "Invalid API key — check your key in ⚙ settings";
  return "Couldn't identify unit — try a different description";
}

export function useUnitLookup(getApiKey) {
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

  const fillAttacker = useCallback(async (dispatch) => {
    setAttackerLoading(true);
    setAttackerError(null);
    try {
      const apiKey = getApiKey();
      const result = await fetchAttackerStats(attackerText, apiKey);
      if (result.type === "disambiguation") {
        setAttackerOptions(result.options);
        setAttackerPageCache(result.pageCache);
      } else {
        const { fields, meta } = result;
        dispatch({ type: "LOAD_WEAPON", weapon: fields });
        setAttackerMeta(meta);
        setAttackerOptions(null);
        setAttackerPageCache(null);
        setLastFilled("attacker");
      }
    } catch (err) {
      console.error("[UnitLookup] fillAttacker failed:", err);
      setAttackerError(classifyError(err));
    } finally {
      setAttackerLoading(false);
    }
  }, [attackerText, getApiKey]);

  const resolveAttacker = useCallback(async (dispatch, choice) => {
    setAttackerLoading(true);
    setAttackerError(null);
    try {
      const apiKey = getApiKey();
      const { fields, meta } = await fetchAttackerStatsFromPage(attackerText, choice, attackerPageCache, apiKey);
      dispatch({ type: "LOAD_WEAPON", weapon: fields });
      setAttackerMeta(meta);
      setLastFilled("attacker");
      setAttackerOptions(null);
      setAttackerPageCache(null);
    } catch (err) {
      console.error("[UnitLookup] resolveAttacker failed:", err);
      setAttackerError(classifyError(err));
    } finally {
      setAttackerLoading(false);
    }
  }, [attackerText, attackerPageCache, getApiKey]);

  const fillDefender = useCallback(async (dispatch) => {
    setDefenderLoading(true);
    setDefenderError(null);
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
      }
    } catch (err) {
      console.error("[UnitLookup] fillDefender failed:", err);
      setDefenderError(classifyError(err));
    } finally {
      setDefenderLoading(false);
    }
  }, [defenderText, getApiKey]);

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
    } catch (err) {
      console.error("[UnitLookup] resolveDefender failed:", err);
      setDefenderError(classifyError(err));
    } finally {
      setDefenderLoading(false);
    }
  }, [defenderText, defenderPageCache, getApiKey]);

  return {
    attackerText, setAttackerText,
    defenderText, setDefenderText,
    attackerLoading, defenderLoading,
    attackerError, defenderError,
    lastFilled, fillAttacker, fillDefender,
    attackerMeta, defenderMeta,
    attackerOptions, defenderOptions,
    resolveAttacker, resolveDefender,
  };
}
