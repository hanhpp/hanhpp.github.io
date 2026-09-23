// Post view counter. Increments once per browser session, reads otherwise.
// Storage is Upstash Redis over its REST API (no npm dependencies), wired to
// this project through the Vercel Marketplace integration, which injects the
// URL/token env vars below. Returns { slug, count }.
//
// Both the GitHub Pages site and the Vercel copy call this endpoint, so a
// post's number reflects total readership rather than being split per domain.

const ALLOWED_ORIGINS = new Set([
  "https://hanhpp.github.io",
  "https://hanhpham.vercel.app",
  "http://localhost:1313",
  "http://127.0.0.1:1313",
]);

// Post slugs are Hugo content base names: lowercase, digits, hyphens.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

// Unfurlers and crawlers may read, but never increment.
const BOT_RE =
  /bot|crawl|spider|slurp|preview|embed|fetch|curl|wget|headless|monitor|scan|lighthouse/i;

function storageConfig() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function redis(config, ...command) {
  const path = command.map(encodeURIComponent).join("/");
  const response = await fetch(`${config.url}/${path}`, {
    headers: { Authorization: `Bearer ${config.token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`upstash responded ${response.status}`);
  }
  const body = await response.json();
  return body.result;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const config = storageConfig();
  if (!config) {
    res.status(503).json({ error: "storage not configured" });
    return;
  }

  // Return view counts across all articles for archive reporting
  if (req.query && (req.query.all === "1" || req.query.all === "true" || req.query.slug === "all")) {
    try {
      const keys = await redis(config, "keys", "views:*");
      if (!keys || !keys.length) {
        res.status(200).json({ views: {}, total: 0 });
        return;
      }
      const values = await redis(config, "mget", ...keys);
      const views = {};
      let total = 0;
      keys.forEach((key, i) => {
        const s = key.replace(/^views:/, "");
        const count = Number(values[i]) || 0;
        views[s] = count;
        total += count;
      });
      res.status(200).json({ views, total });
      return;
    } catch (err) {
      res.status(502).json({ error: "storage unavailable" });
      return;
    }
  }

  const slug = String((req.query && req.query.slug) || "");
  if (!SLUG_RE.test(slug)) {
    res.status(400).json({ error: "invalid slug" });
    return;
  }

  const isBot = BOT_RE.test(req.headers["user-agent"] || "");
  const shouldIncrement = req.method === "POST" && !isBot;

  try {
    const result = shouldIncrement
      ? await redis(config, "incr", `views:${slug}`)
      : await redis(config, "get", `views:${slug}`);
    res.status(200).json({ slug, count: Number(result) || 0 });
  } catch (err) {
    res.status(502).json({ error: "storage unavailable" });
  }
};
