const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");
    if (!path) return json({ error: "missing_path" }, 400);

    const wahapediaUrl = `https://wahapedia.ru/wh40k10ed/factions/${path}`;
    try {
      const res = await fetch(wahapediaUrl, {
        headers: { "User-Agent": "NAPE-40K-Calculator/1.0" },
      });
      if (!res.ok) return json({ error: "not_found", status: res.status }, 404);

      const html = await res.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000);

      return json({ text, url: wahapediaUrl });
    } catch (e) {
      return json({ error: "fetch_failed", message: e.message }, 502);
    }
  },
};
