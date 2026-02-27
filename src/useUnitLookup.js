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
  const [text, setText] = useState("");
  const [attackerLoading, setAttackerLoading] = useState(false);
  const [defenderLoading, setDefenderLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFilled, setLastFilled] = useState(null);

  const fillAttacker = useCallback(async (dispatch) => {
    setAttackerLoading(true);
    setError(null);
    try {
      const apiKey = getApiKey();
      const fields = await fetchAttackerStats(text, apiKey);
      dispatch({ type: "LOAD_WEAPON", weapon: fields });
      setLastFilled("attacker");
    } catch (err) {
      console.error("[UnitLookup] fillAttacker failed:", err);
      setError(classifyError(err));
    } finally {
      setAttackerLoading(false);
    }
  }, [text, getApiKey]);

  const fillDefender = useCallback(async (dispatch) => {
    setDefenderLoading(true);
    setError(null);
    try {
      const apiKey = getApiKey();
      const fields = await fetchDefenderStats(text, apiKey);
      dispatch({ type: "LOAD_TARGET", target: fields });
      setLastFilled("defender");
    } catch (err) {
      console.error("[UnitLookup] fillDefender failed:", err);
      setError(classifyError(err));
    } finally {
      setDefenderLoading(false);
    }
  }, [text, getApiKey]);

  return { text, setText, attackerLoading, defenderLoading, error, lastFilled, fillAttacker, fillDefender };
}
