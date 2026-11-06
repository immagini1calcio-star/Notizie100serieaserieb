import Parser from "rss-parser";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import crypto from "node:crypto";

import {
  cleanText,
  normalizeTitle,
  getDomain,
  detectSource
} from "./cleaner.js";

import { SOURCES } from "./sources.js";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "FootballNewsCollector/2.0"
  }
});

const HOURS_BACK = Number(process.env.HOURS_BACK || 24);
const MAX_ARTICLES_PER_SOURCE = Number(
  process.env.MAX_ARTICLES_PER_SOURCE || 40
);

const FULL_TEXT_ALLOWED_DOMAINS = (
  process.env.FULL_TEXT_ALLOWED_DOMAINS || ""
)
  .split(",")
  .map(x => x.trim().toLowerCase())
  .filter(Boolean);

const FOOTBALL_TERMS = [
  "calcio", "serie a", "serie b", "serie c",
  "champions", "europa league", "conference league",
  "coppa italia", "nazionale", "mercato",
  "trasferimento", "allenatore", "attaccante",
  "difensore", "centrocampista", "portiere",
  "gol", "partita", "campionato", "infortunio",
  "squalifica", "como", "inter", "milan", "juventus",
  "roma", "napoli", "lazio", "atalanta", "fiorentina",
  "torino", "bologna", "genoa", "sampdoria",
  "palermo", "spezia", "venezia", "monza",
  "frosinone", "empoli", "parma", "cagliari"
];

function makeId(url, title) {
  return crypto
    .createHash("sha256")
    .update(url || title)
    .digest("hex");
}

function isFootball(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  return FOOTBALL_TERMS.some(term => text.includes(term));
}

function isAllowedForFullText(url) {
  const domain = getDomain(url);

  return FULL_TEXT_ALLOWED_DOMAINS.some(allowed =>
    domain === allowed || domain.endsWith("." + allowed)
  );
}

function isRecent(dateValue) {
  if (!dateValue) return true;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return true;

  const limit = Date.now() - HOURS_BACK * 60 * 60 * 1000;

  return date.getTime() >= limit;
}

async function fetchArticle(url) {
  if (!url || !url.startsWith("http")) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FootballNewsCollector/2.0)",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) return null;

    const html = await response.text();

    if (html.length > 5_000_000) return null;

    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();

    if (!article?.textContent) return null;

    return cleanText(article.textContent);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function collectSource(source) {
  if (!source.feed) {
    return {
      source: source.name,
      status: "not_configured",
      count: 0,
      error: null,
      news: []
    };
  }

  try {
    const feed = await parser.parseURL(source.feed);
    const items = (feed.items || []).slice(0, MAX_ARTICLES_PER_SOURCE);

    const news = [];

    for (const item of items) {
      const title = normalizeTitle(item.title || "");
      const url = item.link || item.guid || "";

      const rssText = cleanText(
        item.contentSnippet ||
        item.summary ||
        item.description ||
        item.content ||
        ""
      );

      if (!title || !url) continue;
      if (!isFootball(title, rssText)) continue;
      if (!isRecent(item.isoDate || item.pubDate)) continue;

      const actualSource = detectSource(url, source.name, SOURCES);

      let extractedText = null;
      let fullText = "";

      if (isAllowedForFullText(url)) {
        extractedText = await fetchArticle(url);
        fullText = extractedText || "";
      }

      const excerpt = rssText.slice(0, 1200);

      news.push({
        id: makeId(url, title),
        titolo: title,
        testo: excerpt,
        contenuto_completo: fullText,
        integrale_disponibile: Boolean(fullText),
        fonte: actualSource,
        data: item.isoDate || item.pubDate || null,
        url
      });
    }

    return {
      source: source.name,
      status: "ok",
      count: news.length,
      error: null,
      news
    };
  } catch (error) {
    return {
      source: source.name,
      status: "error",
      count: 0,
      error: String(error.message || error),
      news: []
    };
  }
}

export async function collectNews() {
  const results = await Promise.all(
    SOURCES.map(source => collectSource(source))
  );

  const allNews = results.flatMap(result => result.news);

  const unique = new Map();

  for (const item of allNews) {
    if (!unique.has(item.id)) {
      unique.set(item.id, item);
    }
  }

  const news = [...unique.values()].sort((a, b) => {
    const dateA = new Date(a.data || 0).getTime();
    const dateB = new Date(b.data || 0).getTime();
    return dateB - dateA;
  });

  return {
    success: true,
    generated_at: new Date().toISOString(),
    total: news.length,
    sources: results.map(({ source, status, count, error }) => ({
      source,
      status,
      count,
      error
    })),
    news
  };
}
