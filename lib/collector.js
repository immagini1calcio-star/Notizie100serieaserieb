
import Parser from "rss-parser";
import crypto from "node:crypto";
import { SOURCES } from "./sources.js";
import { cleanText, translateToItalian } from "./cleaner.js";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "100SerieA&SerieB-NewsBot/1.0"
  }
});

const FOOTBALL_TERMS = [
  "calcio", "football", "soccer", "serie a", "serie b",
  "champions", "europa league", "conference league",
  "coppa italia", "nazionale", "mondiale", "europei",
  "mercato", "calciomercato", "trasferimento",
  "allenatore", "mister", "squadra", "club",
  "giocatore", "calciatore", "portiere", "difensore",
  "attaccante", "centrocampista", "gol", "goal",
  "rigore", "arbitro", "partita", "campionato",
  "pallone d'oro", "infortunio", "squalifica",
  "fantacalcio", "inter", "milan", "juventus",
  "napoli", "roma", "lazio", "como", "atalanta",
  "fiorentina", "bologna", "torino", "genoa",
  "parma", "lecce", "cagliari", "udinese",
  "sassuolo", "cremonese", "pisa"
];

function isFootball(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  return FOOTBALL_TERMS.some(term => text.includes(term));
}

function makeId(url, title) {
  return crypto
    .createHash("sha256")
    .update(url || title)
    .digest("hex");
}

async function collectSource(source) {
  if (!source.url) {
    return {
      source: source.name,
      status: "not_configured",
      articles: []
    };
  }

  try {
    const feed = await parser.parseURL(source.url);

    const articles = [];

    for (const item of (feed.items || []).slice(0, 50)) {
      const title = cleanText(item.title || "");
      const originalText = cleanText(
        item.contentSnippet ||
        item.summary ||
        item.description ||
        item.content ||
        ""
      );

      const articleUrl = item.link || "";

      if (!title || !originalText || !articleUrl) continue;

      if (!isFootball(title, originalText)) continue;

      const translatedText = await translateToItalian(originalText);

      articles.push({
        id: makeId(articleUrl, title),
        titolo: title,
        testo: translatedText,
        fonte: source.name,
        data: item.isoDate || item.pubDate || null,
        url: articleUrl
      });
    }

    return {
      source: source.name,
      status: "ok",
      articles
    };

  } catch (error) {
    console.error(
      `Errore ${source.name}:`,
      error.message
    );

    return {
      source: source.name,
      status: "error",
      error: error.message,
      articles: []
    };
  }
}

export async function collectNews() {
  const results = await Promise.all(
    SOURCES.map(source => collectSource(source))
  );

  const articles = results.flatMap(result => result.articles);

  const unique = [
    ...new Map(
      articles.map(article => [article.id, article])
    ).values()
  ];

  unique.sort((a, b) => {
    return new Date(b.data || 0) - new Date(a.data || 0);
  });

  return {
    success: true,
    total: unique.length,
    news: unique,
    sources: results.map(result => ({
      name: result.source,
      status: result.status,
      count: result.articles.length,
      error: result.error || null
    })),
    generatedAt: new Date().toISOString()
  };
}
