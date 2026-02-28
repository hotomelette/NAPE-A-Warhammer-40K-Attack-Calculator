const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Authoritative Wahapedia faction slugs (verified Feb 2026)
const FACTION_SLUGS = [
  "space-marines", "grey-knights", "adeptus-custodes", "adepta-sororitas",
  "adeptus-mechanicus", "astra-militarum", "imperial-knights", "imperial-agents",
  "chaos-space-marines", "death-guard", "thousand-sons", "world-eaters", "emperor-s-children",
  "t-au-empire", "aeldari", "drukhari", "tyranids", "necrons", "orks",
  "genestealer-cults", "leagues-of-votann", "chaos-knights",
  "dark-angels", "blood-angels", "space-wolves", "black-templars", "deathwatch",
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

// Capitalize first letter of each hyphen-separated word, preserve rest of casing.
// "broadside-battlesuits" → "Broadside-Battlesuits"
// "XV88-Broadside" → "XV88-Broadside" (already correct)
function normalizeUnitName(name) {
  return name
    .replace(/\s+/g, "-")
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join("-");
}

async function scrapeWahapediaPage(faction, unitName) {
  const url = `https://wahapedia.ru/wh40k10ed/factions/${faction}/${unitName}`;
  const res = await fetch(url, { headers: { "User-Agent": "NAPE-40K-Calculator/1.0" } });
  if (!res.ok) return null;
  const html = await res.text();
  return { text: stripHtml(html), url };
}

async function handleSearch(searchParams) {
  const rawUnit = searchParams.get("unit");
  if (!rawUnit) return json({ error: "missing_unit" }, 400);

  const unitName = normalizeUnitName(rawUnit);
  const rawFaction = searchParams.get("faction");
  const factionHint = rawFaction && FACTION_SLUGS.includes(rawFaction) ? rawFaction : null;

  // Try faction hint first, then all remaining factions
  const orderedFactions = factionHint
    ? [factionHint, ...FACTION_SLUGS.filter((f) => f !== factionHint)]
    : FACTION_SLUGS;

  for (const faction of orderedFactions) {
    try {
      const result = await scrapeWahapediaPage(faction, unitName);
      if (result) return json(result);
    } catch {
      // network error on this faction — continue to next
    }
  }

  return json({ error: "not_found" }, 404);
}

async function handleWahapedia(searchParams) {
  const path = searchParams.get("path");
  if (!path) return json({ error: "missing_path" }, 400);

  const wahapediaUrl = `https://wahapedia.ru/wh40k10ed/factions/${path}`;
  try {
    const res = await fetch(wahapediaUrl, {
      headers: { "User-Agent": "NAPE-40K-Calculator/1.0" },
    });
    if (!res.ok) return json({ error: "not_found", status: res.status }, 404);

    const html = await res.text();
    return json({ text: stripHtml(html), url: wahapediaUrl });
  } catch (e) {
    return json({ error: "fetch_failed", message: e.message }, 502);
  }
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const { pathname, searchParams } = new URL(request.url);

    if (pathname === "/search") return handleSearch(searchParams);
    return handleWahapedia(searchParams);
  },
};
