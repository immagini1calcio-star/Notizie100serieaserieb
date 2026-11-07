const KEY = "football-news:v3:recent";

const MAX_ITEMS = 2500;
const TTL_SECONDS = 60 * 60 * 24 * 14;
const REDIS_TIMEOUT = 8000;

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  return {
    url: url.replace(/\/+$/, ""),
    token
  };
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
    signal: AbortSignal.timeout(REDIS_TIMEOUT)
  });

  if (!response.ok) {
    throw new Error(`Redis HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return data.result;
}

export async function loadRecent() {
  if (!redisConfig()) return [];

  try {
    const value = await command(["GET", KEY]);

    if (!value) return [];

    const parsed =
      typeof value === "string"
        ? JSON.parse(value)
        : value;

    return Array.isArray(parsed)
      ? parsed.slice(0, MAX_ITEMS)
      : [];

  } catch (error) {
    console.error(
      "[STORAGE] Errore caricamento Redis:",
      error.message
    );

    return [];
  }
}

export async function saveRecent(items) {
  if (!redisConfig()) return false;

  try {
    if (!Array.isArray(items)) return false;

    const safe = items
      .filter(item => item && typeof item === "object")
      .slice(0, MAX_ITEMS);

    await command([
      "SET",
      KEY,
      JSON.stringify(safe),
      "EX",
      String(TTL_SECONDS)
    ]);

    return true;

  } catch (error) {
    console.error(
      "[STORAGE] Errore salvataggio Redis:",
      error.message
    );

    return false;
  }
}

export function persistentStorageEnabled() {
  return Boolean(redisConfig());
}
