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

function safeCodePoint(value) {
  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number < 0 ||
    number > 0x10FFFF ||
    (number >= 0xD800 && number <= 0xDFFF)
  ) {
    return null;
  }

  try {
    return String.fromCodePoint(number);
  } catch {
    return null;
  }
}

export function cleanUrl(raw, base) {
  try {
    if (!raw) return null;

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
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&hellip;/gi, "…")
    .replace(/&euro;/gi, "€")
    .replace(/&lsquo;|&rsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')

    .replace(/&#(\d+);/g, (match, code) => {
      return safeCodePoint(code) ?? match;
    })

    .replace(/&#x([0-9a-f]+);/gi, (match, code) => {
      return safeCodePoint(parseInt(code, 16)) ?? match;
    })

    .replace(/\u00a0/g, " ")
    .replace(/[\r\n\t]+/g, " ")
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
  const limit = Math.max(1, Number(max) || 520);

  if (clean.length <= limit) {
    return clean;
  }

  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");

  const output = cut.slice(
    0,
    lastSpace > limit * 0.65 ? lastSpace : limit
  ).trim();

  return output + "…";
}

export function makeShortSummary(text = "", max = 420) {
  const clean = cleanText(text);
  const limit = Math.max(1, Number(max) || 420);

  if (!clean) {
    return "";
  }

  const sentences =
    clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];

  let output = "";

  for (const sentence of sentences) {
    const next = `${output} ${sentence.trim()}`.trim();

    if (next.length > limit) {
      break;
    }

    output = next;

    if (output.length >= Math.min(220, limit)) {
      break;
    }
  }

  return makeExcerpt(
    output || clean,
    limit
  );
}
