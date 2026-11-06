const KEY = "football-news:v3:recent";
const MAX_ITEMS = 2500;
const TTL_SECONDS = 60 * 60 * 24 * 14;

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function command(parts) {
  const cfg = redisConfig();
  if (!cfg) return null;
  const response = await fetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(parts),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Redis HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

export async function loadRecent() {
  if (!redisConfig()) return [];
  const value = await command(["GET", KEY]);
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveRecent(items) {
  if (!redisConfig()) return false;
  const safe = items.slice(0, MAX_ITEMS);
  await command(["SET", KEY, JSON.stringify(safe), "EX", String(TTL_SECONDS)]);
  return true;
}

export function persistentStorageEnabled() {
  return Boolean(redisConfig());
}
