import Anthropic from "@anthropic-ai/sdk";

const ATTACKER_SYSTEM_PROMPT = `You are a Warhammer 40,000 10th edition rules expert with deep knowledge of Wahapedia (wahapedia.ru) datasheets.
Given a unit/weapon description, look up its exact 10th edition datasheet stats as listed on Wahapedia and return ONLY a valid JSON object with these fields (omit any you are unsure of):
{
  "attacks": number or string (e.g. 1, 4, "D6", "2D6+1"),
  "bs": number (the target number to hit, e.g. 3 means roll 3+),
  "strength": number,
  "ap": number (negative values, e.g. -3 for AP-3; use 0 for no AP),
  "damage": number or string (e.g. 1, 3, "D3", "D6"),
  "torrent": boolean,
  "lethalHits": boolean,
  "sustainedHits": boolean,
  "sustainedHitsN": number,
  "devastatingWounds": boolean,
  "twinLinked": boolean
}
Rules:
- Use the exact weapon profile from the Wahapedia datasheet, not approximations.
- If a unit has multiple weapon options, pick the one named or the most iconic/common loadout.
- Handle misspellings and partial names — match to the closest Wahapedia entry.
- If the weapon has [TWIN-LINKED], set twinLinked to true. If [TORRENT], set torrent to true. If [LETHAL HITS], set lethalHits to true. If [SUSTAINED HITS X], set sustainedHits to true and sustainedHitsN to X. If [DEVASTATING WOUNDS], set devastatingWounds to true.
- If you are not confident in a field, omit it rather than guessing.
- Return ONLY the raw JSON object with no markdown, no explanation, no prose.`;

const DEFENDER_SYSTEM_PROMPT = `You are a Warhammer 40,000 10th edition rules expert with deep knowledge of Wahapedia (wahapedia.ru) datasheets.
Given a unit description, look up its exact 10th edition datasheet stats as listed on Wahapedia and return ONLY a valid JSON object with these fields (omit any you are unsure of):
{
  "toughness": number,
  "save": number (the armor save target number, e.g. 3 means 3+),
  "invulnSave": number or null (e.g. 4 means 4++ invulnerable; omit if none),
  "fnpSave": number or null (e.g. 5 for 5+ Feel No Pain or Reanimation Protocols; omit if none)
}
Rules:
- Use the exact profile from the Wahapedia datasheet, not approximations.
- Handle misspellings and partial names — match to the closest Wahapedia entry.
- For Necron units with Reanimation Protocols, set fnpSave to 5.
- If you are not confident in a field, omit it rather than guessing.
- Return ONLY the raw JSON object with no markdown, no explanation, no prose.`;

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
  const result = {
    toughness: raw.toughness != null ? String(raw.toughness) : "",
    armorSave: raw.save != null ? String(raw.save) : "",
    invulnSave: raw.invulnSave != null ? String(raw.invulnSave) : "",
    fnpEnabled: raw.fnpSave != null,
    fnp: raw.fnpSave != null ? String(raw.fnpSave) : "",
  };
  return result;
}

export async function fetchAttackerStats(description, apiKey) {
  // Browser-direct by design; see docs/plans/2026-02-26-unit-lookup-design.md
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    system: ATTACKER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: description }],
  });
  const text = message.content[0].text.trim().replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
  const raw = JSON.parse(text);
  return mapToWeaponFields(raw);
}

export async function fetchDefenderStats(description, apiKey) {
  // Browser-direct by design; see docs/plans/2026-02-26-unit-lookup-design.md
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 128,
    system: DEFENDER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: description }],
  });
  const text = message.content[0].text.trim().replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
  const raw = JSON.parse(text);
  return mapToTargetFields(raw);
}
