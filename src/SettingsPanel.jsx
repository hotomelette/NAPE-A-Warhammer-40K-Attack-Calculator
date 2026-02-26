import React, { useState } from "react";

const STORAGE_KEY = "nape_claude_api_key";

export function getApiKey() {
  try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
}

export function SettingsPanel({ theme }) {
  const dark = theme === "dark";
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(() => getApiKey());
  const [saved, setSaved] = useState(false);

  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, key.trim()); } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const clear = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setKey("");
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Settings"
        className={`rounded px-2 py-1 text-xs font-bold border transition ${open ? "bg-blue-600/80 text-white border-blue-500/40" : "bg-gray-900/80 text-gray-300 border-gray-700 hover:bg-gray-800"}`}
      >
        ⚙
      </button>
      {open && (
        <div className={`absolute right-0 top-9 z-50 w-72 rounded-lg border p-3 shadow-2xl space-y-2 ${dark ? "bg-gray-900 border-gray-600 text-gray-200" : "bg-white border-gray-300 text-gray-800"}`}>
          <div className="text-xs font-bold">Claude API Key</div>
          <input
            type="password"
            value={key}
            onChange={e => { setKey(e.target.value); setSaved(false); }}
            placeholder="sk-ant-..."
            className={`w-full rounded border px-2 py-1 text-xs font-mono ${dark ? "bg-gray-800 border-gray-600 text-gray-100" : "bg-gray-50 border-gray-300 text-gray-900"}`}
          />
          <div className="flex gap-2">
            <button type="button" onClick={save} className="flex-1 rounded bg-blue-600 text-white text-xs py-1 hover:bg-blue-500 transition">
              {saved ? "Saved ✓" : "Save"}
            </button>
            <button type="button" onClick={clear} className={`rounded border px-2 text-xs py-1 transition ${dark ? "border-gray-600 text-gray-400 hover:text-gray-200" : "border-gray-300 text-gray-500 hover:text-gray-700"}`}>
              Clear
            </button>
          </div>
          <p className={`text-xs leading-snug ${dark ? "text-gray-500" : "text-gray-400"}`}>
            Key is stored locally in your browser. Never sent anywhere except the Claude API.
          </p>
        </div>
      )}
    </div>
  );
}
