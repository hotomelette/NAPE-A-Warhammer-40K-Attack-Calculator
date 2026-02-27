import { useState, useCallback } from "react";
import { fetchAttackerStats, fetchDefenderStats } from "./claudeService.js";

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
    } catch {
      setError("Couldn't identify unit — try a different description");
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
    } catch {
      setError("Couldn't identify unit — try a different description");
    } finally {
      setDefenderLoading(false);
    }
  }, [text, getApiKey]);

  return { text, setText, attackerLoading, defenderLoading, error, lastFilled, fillAttacker, fillDefender };
}
