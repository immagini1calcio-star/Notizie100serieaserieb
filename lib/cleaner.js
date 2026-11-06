const TRACKING_KEYS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "referrer",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content"
]);

export function cleanUrl(raw, base) {
  try {
    const url = new URL(raw, base);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    url.hash = "";

    for (const key of [...url.searchParams.keys()]) {
      const normalizedKey = key.toLowerCase();

      if (
        TRACKING_KEYS.has(normalizedKey) ||
        normalizedKey.startsWith("utm_")
      ) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function cleanText(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")

    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")

    .replace(/&#(\d+);/g, (_, code) => {
      const number = Number(code);

      return Number.isFinite(number)
        ? String.fromCodePoint(number)
        : _;
    })

    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const number = parseInt(code, 16);

      return Number.isFinite(number)
        ? String.fromCodePoint(number)
        : _;
    })

    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTitle(value = "") {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(
      /\b(ultimora|ufficiale|calciomercato|serie a|serie b|calcio)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function makeExcerpt(text = "", max = 520) {
  const clean = cleanText(text);

  if (clean.length <= max) {
    return clean;
  }

  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");

  return (
    cut.slice(
      0,
      lastSpace > 350 ? lastSpace : max
    ).trim() + "…"
  );
}

export function makeShortSummary(text = "", max = 420) {
  const clean = cleanText(text);

  if (!clean) {
    return "";
  }

  const sentences =
    clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];

  let output = "";

  for (const sentence of sentences) {
    const next = `${output} ${sentence.trim()}`.trim();

    if (next.length > max) {
      break;
    }

    output = next;

    if (output.length >= 220) {
      break;
    }
  }

  return makeExcerpt(
    output || clean,
    max
  );
}
