// Cellar storage API for Vercel.
// Needs: an Upstash Redis database (Vercel → Storage → Upstash for Redis) and a CELLAR_PASSWORD env var.
const crypto = require("crypto");

// Vercel's Upstash integration may add a custom prefix (e.g. STORAGE_KV_REST_API_URL), so match by suffix.
function findEnv(...suffixes) {
  for (const s of suffixes) if (process.env[s]) return process.env[s];
  for (const s of suffixes) {
    const k = Object.keys(process.env).find((name) => name.endsWith("_" + s) && process.env[name]);
    if (k) return process.env[k];
  }
  return "";
}
const REDIS_URL = findEnv("KV_REST_API_URL", "UPSTASH_REDIS_REST_URL");
const REDIS_TOKEN = findEnv("KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN");
const PASSWORD = (process.env.CELLAR_PASSWORD || "").trim();
const KEYS = { wine: "cellar:wines", log: "cellar:log" };
const ID = /^[\w.~:@+-]{1,100}$/;

async function redis(commands) {
  const r = await fetch(REDIS_URL.replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + REDIS_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error("redis http " + r.status);
  return (await r.json()).map((x) => { if (x.error) throw new Error(x.error); return x.result; });
}

function authorised(key) {
  if (!PASSWORD) return false;
  const a = crypto.createHash("sha256").update(String(key || "").trim()).digest();
  const b = crypto.createHash("sha256").update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

function hashToList(flat) {
  const out = [];
  for (let i = 0; i < (flat || []).length; i += 2) {
    try { out.push(JSON.parse(flat[i + 1])); } catch (e) {}
  }
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!REDIS_URL || !REDIS_TOKEN || !PASSWORD) {
    return res.status(500).json({ error: "setup", missing: { database: !REDIS_URL || !REDIS_TOKEN, password: !PASSWORD } });
  }
  if (!authorised(req.headers["x-cellar-key"])) {
    await new Promise((r) => setTimeout(r, 600)); // slow down password guessing
    return res.status(401).json({ error: "auth" });
  }
  try {
    if (req.method === "GET") {
      const [wines, log] = await redis([["HGETALL", KEYS.wine], ["HGETALL", KEYS.log]]);
      return res.status(200).json({ wines: hashToList(wines), log: hashToList(log) });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const ops = Array.isArray(body.ops) ? body.ops : [];
      if (!ops.length || ops.length > 500) return res.status(400).json({ error: "bad ops" });
      const commands = [];
      for (const op of ops) {
        const key = KEYS[op && op.kind];
        if (!key) return res.status(400).json({ error: "bad kind" });
        if (op.action === "put") {
          const item = op.item;
          if (!item || typeof item !== "object" || !ID.test(item.id)) return res.status(400).json({ error: "bad item" });
          const json = JSON.stringify(item);
          if (json.length > 50000) return res.status(400).json({ error: "item too large" });
          commands.push(["HSET", key, item.id, json]);
        } else if (op.action === "del") {
          if (!ID.test(op.id)) return res.status(400).json({ error: "bad id" });
          commands.push(["HDEL", key, op.id]);
        } else return res.status(400).json({ error: "bad action" });
      }
      await redis(commands);
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method" });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "storage" });
  }
};
