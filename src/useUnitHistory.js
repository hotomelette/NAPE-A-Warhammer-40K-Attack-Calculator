import { useState, useCallback } from "react";

const HISTORY_KEY = "nape_unit_history";
const MAX_ENTRIES = 20;

function normalizeId(text) {
  return text.toLowerCase().trim().replace(/\s+/g, "-");
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {}
}

export function useUnitHistory() {
  const [history, setHistory] = useState(loadHistory);

  const addOrUpdateEntry = useCallback((searchText, unitName, targetFields, wahapediaUrl) => {
    const id = normalizeId(searchText);
    setHistory(prev => {
      const existingIdx = prev.findIndex(e => e.id === id);
      let next;
      if (existingIdx >= 0) {
        const existing = prev[existingIdx];
        const updated = { ...existing, unitName, targetFields, wahapediaUrl, timestamp: new Date().toISOString() };
        next = [updated, ...prev.filter((_, i) => i !== existingIdx)];
      } else {
        const entry = { id, unitName, targetFields, wahapediaUrl, timestamp: new Date().toISOString(), weapons: [] };
        next = [entry, ...prev].slice(0, MAX_ENTRIES);
      }
      saveHistory(next);
      return next;
    });
  }, []);

  const addWeapon = useCallback((searchText, label, fields) => {
    const id = normalizeId(searchText);
    setHistory(prev => {
      const next = prev.map(e => {
        if (e.id !== id) return e;
        if (e.weapons.some(w => w.label === label)) return e;
        return { ...e, weapons: [...e.weapons, { label, fields }] };
      });
      saveHistory(next);
      return next;
    });
  }, []);

  const removeEntry = useCallback((id) => {
    setHistory(prev => {
      const next = prev.filter(e => e.id !== id);
      saveHistory(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
  }, []);

  return { history, addOrUpdateEntry, addWeapon, removeEntry, clearAll };
}
