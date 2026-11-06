import he from "he";

export function cleanText(value = "") {
  let text = String(value);

  text = text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  text = he.decode(text);

  text = text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/[\u00a0\u200b\u200e\u200f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

export function normalizeTitle(value = "") {
  return cleanText(value)
    .replace(/\s+/g, " ")
    .trim();
}

export function getDomain(url = "") {
  try {
    return new URL(url).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function detectSource(url, fallbackName, sources) {
  const domain = getDomain(url);

  const match = sources.find(source =>
    source.domains.some(known =>
      domain === known || domain.endsWith("." + known)
    )
  );

  return match?.name || fallbackName || "Fonte non identificata";
}
