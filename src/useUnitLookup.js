import { useState, useCallback } from "react";
import { fetchAttackerStats, fetchDefenderStats } from "./claudeService.js";

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

  const fillAttacker = useCallback(async (dispatch) => {
    setAttackerLoading(true);
    setAttackerError(null);
    try {
      const apiKey = getApiKey();
      const fields = await fetchAttackerStats(attackerText, apiKey);
      dispatch({ type: "LOAD_WEAPON", weapon: fields });
      setLastFilled("attacker");
    } catch (err) {
      console.error("[UnitLookup] fillAttacker failed:", err);
      setAttackerError(classifyError(err));
    } finally {
      setAttackerLoading(false);
    }
  }, [attackerText, getApiKey]);

  const fillDefender = useCallback(async (dispatch) => {
    setDefenderLoading(true);
    setDefenderError(null);
    try {
      const apiKey = getApiKey();
      const fields = await fetchDefenderStats(defenderText, apiKey);
      dispatch({ type: "LOAD_TARGET", target: fields });
      setLastFilled("defender");
    } catch (err) {
      console.error("[UnitLookup] fillDefender failed:", err);
      setDefenderError(classifyError(err));
    } finally {
      setDefenderLoading(false);
    }
  }, [defenderText, getApiKey]);

  return {
    attackerText, setAttackerText,
    defenderText, setDefenderText,
    attackerLoading, defenderLoading,
    attackerError, defenderError,
    lastFilled, fillAttacker, fillDefender,
  };
}
