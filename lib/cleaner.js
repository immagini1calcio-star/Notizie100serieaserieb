
import he from "he";

export function cleanText(value = "") {
  return he.decode(
    String(value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/www\.\S+/gi, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export async function translateToItalian(text) {
  const cleaned = cleanText(text);

  if (!cleaned) return "";

  try {
    const url = new URL(
      "https://translate.googleapis.com/translate_a/single"
    );

    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", "auto");
    url.searchParams.set("tl", "it");
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", cleaned);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error("Traduzione non disponibile");
    }

    const data = await response.json();

    return cleanText(
      (data[0] || [])
        .map(part => part[0] || "")
        .join("")
    ) || cleaned;

  } catch (error) {
    console.error("Errore traduzione:", error.message);
    return cleaned;
  }
}
