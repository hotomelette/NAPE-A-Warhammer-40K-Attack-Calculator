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

DISAMBIGUATION: If the input names only a unit without specifying a weapon (e.g. "space marine intercessor", "crisis battlesuits"), return ALL available weapons as options. If a specific weapon is clearly named in the input, extract stats directly.

When disambiguation is needed, return ONLY this JSON:
{ "type": "options", "options": ["Weapon Name 1", "Weapon Name 2", ...] }
Include ALL ranged AND melee weapons available to the unit. Use exact weapon names from the datasheet.

When a specific weapon is identified, return ONLY this JSON:
{
  "type": "stats",
  "resolvedName": "Human-readable description e.g. 'Intercessor with Bolt Rifle'",
  "attacks": number or string,
  "bs": number,
  "strength": number,
  "ap": number,
  "damage": number or string,
  "torrent": boolean,
  "lethalHits": boolean,
  "sustainedHits": boolean,
  "sustainedHitsN": number,
  "devastatingWounds": boolean,
  "twinLinked": boolean
}

Rules:
- attacks/damage: use exact GW dice notation: 1, 4, "D3", "D6", "2D6", "D6+1". Never round.
- ap: 0 for no AP; -1, -2, -3 for AP-1/2/3.
- bs: target number e.g. 3 means 3+.
- [TWIN-LINKED] → twinLinked: true. [TORRENT] → torrent: true. [LETHAL HITS] → lethalHits: true.
- [SUSTAINED HITS X] → sustainedHits: true, sustainedHitsN: X. [DEVASTATING WOUNDS] → devastatingWounds: true.
- If a Wahapedia datasheet is provided, use it as the primary source of truth.
- Omit stat fields you are not confident in.
- Return ONLY the raw JSON object. No markdown, no explanation, no prose.`;

const DEFENDER_SYSTEM_PROMPT = `You are a Warhammer 40,000 10th edition rules expert.
Given a unit description and optionally a Wahapedia datasheet, extract defensive stats.

DISAMBIGUATION: If the input could match multiple distinct units (e.g. "fire dragon warriors" could be Fire Warriors or Fire Dragons), return the possible matches as options. If the unit is clearly identified, extract stats directly.

When disambiguation is needed, return ONLY this JSON:
{ "type": "options", "options": ["Unit Name 1", "Unit Name 2", ...] }

When the unit is clearly identified, return ONLY this JSON:
{
  "type": "stats",
  "resolvedName": "Human-readable unit name e.g. 'Space Marine Intercessor'",
  "toughness": number,
  "save": number,
  "invulnSave": number or null,
  "fnpSave": number or null
}

Rules:
- save: armor save target number, e.g. 3 means 3+.
- invulnSave: e.g. 4 means 4++. Omit if none.
- fnpSave: e.g. 5 for 5+ Feel No Pain or Reanimation Protocols. Omit if none.
- For Necron units with Reanimation Protocols, set fnpSave to 5.
- If a Wahapedia datasheet is provided, use it as the primary source of truth.
- Omit fields you are not confident in.
- Return ONLY the raw JSON object. No markdown, no explanation, no prose.`;

// ─── Pure mapping functions ───────────────────────────────────────────────────

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

function buildMeta(source, wahapediaUrl, fetchedAt, resolvedName) {
  const meta = { source, wahapediaUrl, resolvedName };
  if (source === "live") meta.fetchedAt = fetchedAt;
  return meta;
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
    max_tokens: 512,
    temperature: 0,
    system: ATTACKER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  const raw = parseJson(msg.content[0].text);

  if (raw.type === "options") {
    return {
      type: "disambiguation",
      options: raw.options,
      pageCache: { pageText: pageContent, wahapediaUrl, source, fetchedAt },
    };
  }

  return {
    type: "stats",
    fields: mapToWeaponFields(raw),
    meta: buildMeta(source, wahapediaUrl, fetchedAt, raw.resolvedName),
  };
}

export async function fetchAttackerStatsFromPage(description, chosenWeapon, pageCache, apiKey) {
  // Browser-direct by design; see docs/plans/2026-02-26-unit-lookup-design.md
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const { pageText, wahapediaUrl, source, fetchedAt } = pageCache;

  const userContent = pageText
    ? `Unit/weapon: ${description} — specifically the ${chosenWeapon}\n\nWahapedia datasheet:\n${pageText}`
    : `${description} — specifically the ${chosenWeapon}`;

  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    temperature: 0,
    system: ATTACKER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  const raw = parseJson(msg.content[0].text);
  return {
    type: "stats",
    fields: mapToWeaponFields(raw),
    meta: buildMeta(source, wahapediaUrl, fetchedAt, raw.resolvedName),
  };
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
    max_tokens: 256,
    temperature: 0,
    system: DEFENDER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  const raw = parseJson(msg.content[0].text);

  if (raw.type === "options") {
    return {
      type: "disambiguation",
      options: raw.options,
      pageCache: { pageText: pageContent, wahapediaUrl, source, fetchedAt },
    };
  }

  return {
    type: "stats",
    fields: mapToTargetFields(raw),
    meta: buildMeta(source, wahapediaUrl, fetchedAt, raw.resolvedName),
  };
}

export async function fetchDefenderStatsFromPage(description, chosenUnit, pageCache, apiKey) {
  // Browser-direct by design; see docs/plans/2026-02-26-unit-lookup-design.md
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const { pageText, wahapediaUrl, source, fetchedAt } = pageCache;

  const userContent = pageText
    ? `Unit: ${description} — specifically ${chosenUnit}\n\nWahapedia datasheet:\n${pageText}`
    : `${description} — specifically ${chosenUnit}`;

  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    temperature: 0,
    system: DEFENDER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  const raw = parseJson(msg.content[0].text);
  return {
    type: "stats",
    fields: mapToTargetFields(raw),
    meta: buildMeta(source, wahapediaUrl, fetchedAt, raw.resolvedName),
  };
}
