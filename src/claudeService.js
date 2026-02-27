import Anthropic from "@anthropic-ai/sdk";

const WORKER_URL = import.meta.env.VITE_WAHAPEDIA_WORKER_URL || null;
const CLAUDE_MODEL = "claude-sonnet-4-6";

// ─── System prompts ──────────────────────────────────────────────────────────

const URL_RESOLUTION_PROMPT = `You are a Warhammer 40,000 10th edition rules expert.
Given a unit or weapon description, return ONLY the Wahapedia path for the unit's datasheet page.
The path format is: {faction-slug}/{Unit-Name-With-Hyphens}

Examples:
- "space marine intercessor bolt rifle" → space-marines/Intercessor-Squad
- "crisis battlesuits plasma" → tau-empire/Crisis-Battlesuits
- "forgefiend" → chaos-space-marines/Forgefiend
- "canoptek doomstalker" → necrons/Canoptek-Doomstalker
- "ork boy" → orks/Boyz

Rules:
- Return ONLY the path string. No URL prefix, no explanation, no markdown.
- For weapons, return the unit page that contains that weapon.
- Handle misspellings — match to the closest Wahapedia entry.
- If truly unknown, return: unknown`;

const ATTACKER_SYSTEM_PROMPT = `You are a Warhammer 40,000 10th edition rules expert.
Given a weapon description and optionally a Wahapedia datasheet, extract weapon stats.
Return ONLY a valid JSON object with these fields (omit any you are unsure of):
{
  "attacks": number or string — use exact GW dice notation: 1, 4, "D3", "D6", "2D6", "D6+1", "2D3+1",
  "bs": number (target number to hit, e.g. 3 means 3+),
  "strength": number,
  "ap": number (0 for no AP; use -1, -2, -3 for AP-1/2/3),
  "damage": number or string — use exact GW dice notation: 1, 3, "D3", "D6", "2D6", "D6+2",
  "torrent": boolean,
  "lethalHits": boolean,
  "sustainedHits": boolean,
  "sustainedHitsN": number (the X in SUSTAINED HITS X),
  "devastatingWounds": boolean,
  "twinLinked": boolean
}
Rules:
- If a Wahapedia datasheet is provided below, use it as the primary source of truth.
- Otherwise use your training knowledge of 10th edition datasheets.
- For dice values, use the exact GW notation. Never round — e.g. "2D6" not 7, "D6+1" not "D6".
- [TWIN-LINKED] → twinLinked: true. [TORRENT] → torrent: true. [LETHAL HITS] → lethalHits: true.
- [SUSTAINED HITS X] → sustainedHits: true, sustainedHitsN: X. [DEVASTATING WOUNDS] → devastatingWounds: true.
- If a unit has multiple weapon options, use the one named or the most common/iconic.
- Omit any field you are not confident in.
- Return ONLY the raw JSON object with no markdown, no explanation, no prose.`;

const DEFENDER_SYSTEM_PROMPT = `You are a Warhammer 40,000 10th edition rules expert.
Given a unit description and optionally a Wahapedia datasheet, extract defensive stats.
Return ONLY a valid JSON object with these fields (omit any you are unsure of):
{
  "toughness": number,
  "save": number (armor save target number, e.g. 3 means 3+),
  "invulnSave": number or null (e.g. 4 means 4++; omit if none),
  "fnpSave": number or null (e.g. 5 for 5+ Feel No Pain or Reanimation Protocols; omit if none)
}
Rules:
- If a Wahapedia datasheet is provided below, use it as the primary source of truth.
- Otherwise use your training knowledge of 10th edition datasheets.
- For Necron units with Reanimation Protocols, set fnpSave to 5.
- Omit any field you are not confident in.
- Return ONLY the raw JSON object with no markdown, no explanation, no prose.`;

// ─── Pure mapping functions (unchanged) ──────────────────────────────────────

export function mapToWeaponFields(raw) {
  const isDiceString = (v) => typeof v === "string" && /[dD]/.test(v);
  const attacksFixed = !isDiceString(raw.attacks);
  const damageFixed = !isDiceString(raw.damage);
  return {
    attacksFixed,
    attacksValue: raw.attacks != null ? String(raw.attacks) : "",
    toHit: raw.bs != null ? String(raw.bs) : "",
    strength: raw.strength != null ? String(raw.strength) : "",
    ap: raw.ap != null ? String(raw.ap) : "",
    damageFixed,
    damageValue: raw.damage != null ? String(raw.damage) : "",
    torrent: Boolean(raw.torrent),
    lethalHits: Boolean(raw.lethalHits),
    sustainedHits: Boolean(raw.sustainedHits),
    sustainedHitsN: raw.sustainedHitsN != null ? Number(raw.sustainedHitsN) : 1,
    devastatingWounds: Boolean(raw.devastatingWounds),
    twinLinked: Boolean(raw.twinLinked),
  };
}

export function mapToTargetFields(raw) {
  return {
    toughness: raw.toughness != null ? String(raw.toughness) : "",
    armorSave: raw.save != null ? String(raw.save) : "",
    invulnSave: raw.invulnSave != null ? String(raw.invulnSave) : "",
    fnpEnabled: raw.fnpSave != null,
    fnp: raw.fnpSave != null ? String(raw.fnpSave) : "",
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function parseJson(text) {
  const cleaned = text.trim().replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned non-JSON response: ${cleaned.slice(0, 120)}`);
  }
}

async function resolveWahapediaPath(description, client) {
  try {
    const msg = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 64,
      temperature: 0,
      system: URL_RESOLUTION_PROMPT,
      messages: [{ role: "user", content: description }],
    });
    const path = msg.content[0].text.trim();
    const pathPattern = /^[a-z0-9-]+\/[A-Za-z0-9-]+$/;
    if (!path || path === "unknown" || !pathPattern.test(path)) return null;
    return path;
  } catch {
    return null;
  }
}

export async function fetchWahapediaPage(path, workerUrl) {
  try {
    const url = `${workerUrl}/wahapedia?path=${encodeURIComponent(path)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) return null;
    return data;
  } catch (err) {
    console.warn("[fetchWahapediaPage] failed for path", path, err);
    return null;
  }
}

async function resolveAndFetch(description, client) {
  const path = await resolveWahapediaPath(description, client);
  const wahapediaUrl = path
    ? `https://wahapedia.ru/wh40k10ed/factions/${path}`
    : "https://wahapedia.ru";
  let pageContent = null;
  let source = "training";
  let fetchedAt;
  if (WORKER_URL && path) {
    const page = await fetchWahapediaPage(path, WORKER_URL);
    if (page) {
      pageContent = page.text;
      source = "live";
      fetchedAt = new Date().toISOString();
    }
  }
  return { pageContent, source, wahapediaUrl, fetchedAt };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchAttackerStats(description, apiKey) {
  // Browser-direct by design; see docs/plans/2026-02-26-unit-lookup-design.md
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const { pageContent, source, wahapediaUrl, fetchedAt } = await resolveAndFetch(description, client);

  const userContent = pageContent
    ? `Unit/weapon: ${description}\n\nWahapedia datasheet:\n${pageContent}`
    : description;
  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    temperature: 0,
    system: ATTACKER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  const raw = parseJson(msg.content[0].text);
  const meta = { source, wahapediaUrl };
  if (source === "live") meta.fetchedAt = fetchedAt;
  return { fields: mapToWeaponFields(raw), meta };
}

export async function fetchDefenderStats(description, apiKey) {
  // Browser-direct by design; see docs/plans/2026-02-26-unit-lookup-design.md
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const { pageContent, source, wahapediaUrl, fetchedAt } = await resolveAndFetch(description, client);

  const userContent = pageContent
    ? `Unit: ${description}\n\nWahapedia datasheet:\n${pageContent}`
    : description;
  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 128,
    temperature: 0,
    system: DEFENDER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  const raw = parseJson(msg.content[0].text);
  const meta = { source, wahapediaUrl };
  if (source === "live") meta.fetchedAt = fetchedAt;
  return { fields: mapToTargetFields(raw), meta };
}
