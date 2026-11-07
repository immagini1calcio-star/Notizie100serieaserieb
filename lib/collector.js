
// ============================================================
// 100% SERIE A & SERIE B
// FOOTBALL NEWS COLLECTOR v3.3.0
// SOLO NOTIZIE IN ITALIANO
// ============================================================

import Parser from "rss-parser";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

import { SOURCES } from "./sources.js";

import {
  cleanUrl,
  cleanText,
  makeExcerpt,
  makeShortSummary
} from "./cleaner.js";

import {
  stableNewsId,
  deduplicateNews,
  makeHistoryRecord
} from "./deduplicator.js";

import {
  loadRecent,
  saveRecent,
  persistentStorageEnabled
} from "./storage.js";

// ============================================================
// CONFIGURAZIONE
// ============================================================

const VERSION = "3.3.0";

const MAX_ARTICLES_PER_SOURCE = Math.min(
  Math.max(Number(process.env.MAX_ARTICLES_PER_SOURCE || 8), 1),
  15
);

const HOURS_BACK = Math.min(
  Math.max(Number(process.env.HOURS_BACK || 36), 1),
  168
);

const FETCH_TIMEOUT = Math.min(
  Math.max(Number(process.env.FETCH_TIMEOUT || 12000), 4000),
  30000
);

const MIN_COMPLETE_LENGTH = 700;
const MAX_ARTICLE_LENGTH = 50000;
const MAX_SITEMAP_FILES = 5;

const parser = new Parser({
  timeout: FETCH_TIMEOUT,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; FootballNewsCollector/3.3)",
    "Accept":
      "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    "Accept-Language":
      "it-IT,it;q=0.9,en;q=0.7"
  }
});

// ============================================================
// PAROLE CHIAVE CALCISTICHE
// ============================================================

const FOOTBALL_WORDS = [
  "calcio",
  "football",
  "soccer",
  "serie a",
  "serie b",
  "serie c",
  "coppa italia",
  "champions league",
  "europa league",
  "conference league",
  "supercoppa",
  "nazionale",
  "inter",
  "milan",
  "juventus",
  "napoli",
  "roma",
  "lazio",
  "como",
  "atalanta",
  "fiorentina",
  "torino",
  "bologna",
  "genoa",
  "sampdoria",
  "cagliari",
  "parma",
  "sassuolo",
  "lecce",
  "udinese",
  "verona",
  "monza",
  "frosinone",
  "palermo",
  "venezia",
  "bari",
  "spezia",
  "modena",
  "cesena",
  "empoli",
  "sudtirol",
  "catanzaro",
  "avellino",
  "pescara",
  "brescia",
  "mercato",
  "calciomercato",
  "allenatore",
  "calciatore",
  "attaccante",
  "difensore",
  "portiere",
  "centrocampista",
  "infortunio",
  "trasferimento",
  "cessione",
  "acquisto",
  "esonerato",
  "esonero",
  "panchina",
  "formazione",
  "gol",
  "rigore",
  "ammonizione",
  "espulsione",
  "fantacalcio",
  "euroleghe",
  "mondiali",
  "mondiale",
  "europei",
  "under 21",
  "under 19",
  "primavera",
  "calciatori",
  "campionato",
  "partita",
  "partite",
  "arbitro",
  "arbitraggio",
  "tifosi",
  "tifoseria",
  "diritti tv"
];

// ============================================================
// RICONOSCIMENTO LINGUA
// ============================================================

// Indicatori linguistici italiani.
// Non viene effettuata alcuna traduzione.

const ITALIAN_WORDS = new Set([
  "il", "lo", "la", "gli", "le",
  "un", "uno", "una",
  "di", "del", "dello", "della",
  "dei", "degli", "delle",
  "al", "allo", "alla", "ai", "agli", "alle",
  "dal", "dallo", "dalla", "dai", "dagli", "dalle",
  "nel", "nello", "nella", "nei", "negli", "nelle",
  "sul", "sullo", "sulla", "sui", "sugli", "sulle",
  "che", "chi", "cui",
  "per", "con", "tra", "fra",
  "non", "sono", "è", "era", "erano",
  "ha", "hanno", "aveva", "avevano",
  "si", "se", "ma", "anche",
  "come", "quando", "dopo", "prima",
  "contro", "dalla", "dopo",
  "più", "meno", "già", "ancora",
  "questa", "questo", "queste", "questi",
  "sua", "suo", "loro",
  "dove", "mentre", "perché",
  "oggi", "ieri", "domani",
  "squadra", "giocatore", "partita",
  "allenatore", "campionato"
]);

const ENGLISH_WORDS = new Set([
  "the", "and", "for", "with", "from",
  "has", "have", "had", "was", "were",
  "this", "that", "these", "those",
  "after", "before", "will", "would",
  "his", "her", "their", "they",
  "are", "not", "into", "over",
  "under", "about", "been", "being",
  "which", "who", "what", "when",
  "where", "match", "team", "player",
  "manager", "league", "football",
  "signing", "transfer", "official"
]);

const SPANISH_WORDS = new Set([
  "el", "los", "las", "una", "unos",
  "para", "con", "por", "pero",
  "está", "están", "han", "tras",
  "ante", "equipo", "jugador",
  "partido", "entrenador", "liga"
]);

const FRENCH_WORDS = new Set([
  "les", "des", "une", "pour",
  "avec", "dans", "sur", "mais",
  "après", "avant", "joueur",
  "équipe", "match", "entraîneur"
]);

function detectLanguage(text) {
  const tokens = String(text || "")
    .toLowerCase()
    .normalize("NFC")
    .match(/[\p{L}']+/gu) || [];

  if (!tokens.length) {
    return "non_verificabile";
  }

  let italian = 0;
  let english = 0;
  let spanish = 0;
  let french = 0;

  for (const token of tokens) {
    if (ITALIAN_WORDS.has(token)) italian++;
    if (ENGLISH_WORDS.has(token)) english++;
    if (SPANISH_WORDS.has(token)) spanish++;
    if (FRENCH_WORDS.has(token)) french++;
  }

  const foreign = Math.max(
    english,
    spanish,
    french
  );

  // Testi troppo corti: nessuna classificazione sicura.
  if (tokens.length < 12) {
    if (foreign >= 2 && foreign > italian) {
      return "non_italiano";
    }

    return "non_verificabile";
  }

  // Esclude i testi chiaramente stranieri.
  if (
    english >= 3 &&
    english > italian + 1
  ) {
    return "non_italiano";
  }

  if (
    spanish >= 3 &&
    spanish > italian + 1
  ) {
    return "non_italiano";
  }

  if (
    french >= 3 &&
    french > italian + 1
  ) {
    return "non_italiano";
  }

  if (
    italian >= 3 &&
    italian >= foreign
  ) {
    return "italiano";
  }

  return "non_verificabile";
}

// ============================================================
// UTILITY
// ============================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function withinWindow(value) {
  // Le date mancanti non vengono inventate.
  // Rimangono ammesse, ma vengono ordinate dopo quelle note.
  if (!value) return true;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return true;
  }

  const difference = Date.now() - date.getTime();

  const maximumAge = HOURS_BACK * 3600000;
  const maximumFuture = 24 * 3600000;

  return (
    difference <= maximumAge &&
    difference >= -maximumFuture
  );
}

// Mantiene i confini dei paragrafi.
// cleanText da solo può appiattire gli a capo.

function preserveArticleText(value) {
  if (!value) return "";

  const prepared = String(value)
    .replace(
      /<\/(p|div|section|article|h[1-6]|li|blockquote|br)>/gi,
      "\n"
    )
    .replace(
      /<br\s*\/?>/gi,
      "\n"
    );

  return prepared
    .split(/\n+/)
    .map(part => cleanText(part))
    .filter(part => part.length > 0)
    .join("\n\n")
    .slice(0, MAX_ARTICLE_LENGTH);
}

function absoluteUrl(value, baseUrl) {
  if (!value) return null;

  try {
    return new URL(
      String(value).trim(),
      baseUrl
    ).toString();
  } catch {
    return null;
  }
}

function normalizeUrl(value, baseUrl) {
  const absolute = absoluteUrl(value, baseUrl);

  if (!absolute) return null;

  return cleanUrl(absolute);
}

function getHostname(value) {
  try {
    return new URL(value).hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/^m\./, "");
  } catch {
    return "";
  }
}

function getSourceDomains(source) {
  return (source.domains || [])
    .map(domain =>
      String(domain)
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/^m\./, "")
        .replace(/\/.*$/, "")
    )
    .filter(Boolean);
}

function belongsToSource(url, source) {
  const hostname = getHostname(url);
  const domains = getSourceDomains(source);

  if (!hostname || !domains.length) {
    return false;
  }

  return domains.some(domain =>
    hostname === domain ||
    hostname.endsWith(`.${domain}`)
  );
}

function escapeRegex(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function isFootball(text) {
  const value = cleanText(text).toLowerCase();

  return FOOTBALL_WORDS.some(word => {
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegex(word)}($|[^\\p{L}\\p{N}])`,
      "iu"
    );

    return pattern.test(value);
  });
}

function articleKey(url) {
  return normalizeUrl(url)?.toLowerCase() || "";
}

// ============================================================
// CONTROLLO URL ARTICOLI
// ============================================================

function articleCandidate(
  value,
  source,
  baseUrl = source.url
) {
  const url = normalizeUrl(value, baseUrl);

  if (!url || !belongsToSource(url, source)) {
    return false;
  }

  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return false;
  }

  const pathname = parsed.pathname.toLowerCase();

  if (
    /\.(jpg|jpeg|png|gif|webp|svg|pdf|mp4|mp3|css|js|woff|woff2|xml|json)$/i.test(
      pathname
    )
  ) {
    return false;
  }

  const excludedPaths = [
    "/tag/",
    "/categoria/",
    "/category/",
    "/author/",
    "/autore/",
    "/privacy",
    "/cookie",
    "/login",
    "/account",
    "/abbonamenti",
    "/newsletter",
    "/contatti",
    "/about",
    "/video/",
    "/gallery/",
    "/galleries/",
    "/classifica",
    "/calendario",
    "/risultati",
    "/competizioni/",
    "/competition/",
    "/squadre/",
    "/teams/",
    "/partite/",
    "/live/",
    "/diretta/"
  ];

  if (
    excludedPaths.some(path =>
      pathname.includes(path)
    )
  ) {
    return false;
  }

  const segments = pathname
    .split("/")
    .filter(Boolean);

  const last = (
    segments.at(-1) || ""
  ).toLowerCase();

  const excludedNames = [
    "home",
    "news",
    "calcio",
    "serie-a",
    "serie-b",
    "partite",
    "team",
    "squadre",
    "gallery",
    "galleries",
    "classifica",
    "competizioni",
    "ultime-notizie",
    "feed",
    "rss"
  ];

  if (excludedNames.includes(last)) {
    return false;
  }

  return segments.length >= 1;
}

// ============================================================
// DOWNLOAD CON TIMEOUT
// ============================================================

async function fetchText(url) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",

        "Accept":
          "text/html,application/xhtml+xml,application/xml,application/rss+xml,application/atom+xml;q=0.9,*/*;q=0.8",

        "Accept-Language":
          "it-IT,it;q=0.9,en;q=0.7",

        "Cache-Control": "no-cache"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType =
      response.headers.get("content-type") || "";

    const text = await response.text();

    if (!text || text.length < 100) {
      throw new Error("Risposta vuota o troppo corta");
    }

    return {
      text,
      contentType,
      finalUrl: response.url || url,
      status: response.status
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// SCOPERTA RSS
// ============================================================

function discoverFeeds(html, baseUrl) {
  const dom = new JSDOM(html, {
    url: baseUrl
  });

  const document = dom.window.document;
  const feeds = new Set();

  const elements = document.querySelectorAll(
    'link[rel~="alternate"][href]'
  );

  for (const element of elements) {
    const type = (
      element.getAttribute("type") || ""
    ).toLowerCase();

    const href = element.getAttribute("href");

    if (
      !/rss|atom|xml/.test(type) &&
      !/rss|feed|atom/i.test(href || "")
    ) {
      continue;
    }

    const url = normalizeUrl(href, baseUrl);

    if (
      url &&
      belongsToSource(url, { domains: [getHostname(baseUrl)] })
    ) {
      feeds.add(url);
    }
  }

  dom.window.close();

  return [...feeds].slice(0, 8);
}

// ============================================================
// LETTURA RSS
// ============================================================

async function readFeed(url, source) {
  try {
    const feed = await parser.parseURL(url);

    const items = (feed.items || [])
      .map(item => {
        const link = normalizeUrl(
          item.link || item.guid,
          url
        );

        const rssContent = preserveArticleText(
          item["content:encoded"] ||
          item.content ||
          item.contentSnippet ||
          item.summary ||
          item.description ||
          ""
        );

        return {
          title: cleanText(item.title || ""),

          summary: preserveArticleText(
            item.contentSnippet ||
            item.summary ||
            item.description ||
            rssContent
          ),

          rssContent,

          publishedAt: parseDate(
            item.isoDate ||
            item.pubDate ||
            item.published ||
            item.updated
          ),

          url: link,

          author: cleanText(
            item.creator ||
            item.author ||
            ""
          ),

          image: item.enclosure?.url
            ? normalizeUrl(item.enclosure.url, url)
            : null,

          sourceId: source.id,
          source: source.name
        };
      })
      .filter(item =>
        item.title &&
        item.url &&
        articleCandidate(item.url, source)
      );

    return {
      items,
      error: null
    };
  } catch (error) {
    return {
      items: [],
      error: String(
        error.message || error
      ).slice(0, 180)
    };
  }
}

// ============================================================
// SCOPERTA LINK HOMEPAGE
// ============================================================

function discoverLinks(html, baseUrl, source) {
  const dom = new JSDOM(html, {
    url: baseUrl
  });

  const document = dom.window.document;
  const links = new Map();

  const anchors = document.querySelectorAll(
    "article a[href], h1 a[href], h2 a[href], h3 a[href], a[href]"
  );

  for (const anchor of anchors) {
    const url = normalizeUrl(
      anchor.getAttribute("href"),
      baseUrl
    );

    const title = cleanText(
      anchor.textContent ||
      anchor.getAttribute("title") ||
      ""
    );

    if (
      !url ||
      !articleCandidate(url, source) ||
      title.length < 15
    ) {
      continue;
    }

    const key = articleKey(url);

    if (!links.has(key)) {
      links.set(key, {
        url,
        title
      });
    }
  }

  dom.window.close();

  return [...links.values()].slice(
    0,
    MAX_ARTICLES_PER_SOURCE * 5
  );
}

// ============================================================
// SITEMAP
// ============================================================

function extractLocs(xml) {
  return [
    ...xml.matchAll(
      /<loc[^>]*>\s*([\s\S]*?)\s*<\/loc>/gi
    )
  ].map(match =>
    cleanText(match[1])
  ).filter(Boolean);
}

async function discoverSitemap(source) {
  const sitemapUrls = [
    absoluteUrl("/sitemap.xml", source.url),
    absoluteUrl("/sitemap_index.xml", source.url),
    absoluteUrl("/sitemap-news.xml", source.url),
    absoluteUrl("/news-sitemap.xml", source.url)
  ].filter(Boolean);

  const found = new Set();

  async function readSitemap(sitemapUrl) {
    const response = await fetchText(sitemapUrl);
    const xml = response.text;

    if (!/<urlset|<sitemapindex/i.test(xml)) {
      return;
    }

    const locs = extractLocs(xml);

    // Sitemap index: apre alcuni sitemap figli.
    if (/<sitemapindex/i.test(xml)) {
      const children = locs
        .map(loc => normalizeUrl(loc, sitemapUrl))
        .filter(Boolean)
        .slice(0, MAX_SITEMAP_FILES);

      for (const child of children) {
        try {
          const childResponse = await fetchText(child);

          if (!/<urlset/i.test(childResponse.text)) {
            continue;
          }

          for (const loc of extractLocs(childResponse.text)) {
            const articleUrl = normalizeUrl(loc, child);

            if (
              articleUrl &&
              articleCandidate(articleUrl, source)
            ) {
              found.add(articleUrl);
            }
          }
        } catch {
          // Continua con gli altri sitemap.
        }

        if (
          found.size >= MAX_ARTICLES_PER_SOURCE * 5
        ) {
          break;
        }
      }

      return;
    }

    for (const loc of locs) {
      const articleUrl = normalizeUrl(loc, sitemapUrl);

      if (
        articleUrl &&
        articleCandidate(articleUrl, source)
      ) {
        found.add(articleUrl);
      }
    }
  }

  for (const sitemapUrl of sitemapUrls) {
    try {
      await readSitemap(sitemapUrl);
    } catch {
      // Prova il successivo sitemap.
    }

    if (found.size) {
      break;
    }
  }

  return [...found].slice(
    0,
    MAX_ARTICLES_PER_SOURCE * 5
  );
}

// ============================================================
// RIMOZIONE CONTENUTI ESTRANEI
// ============================================================

const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "canvas",
  "form",
  "button",
  "input",
  "textarea",
  "select",
  "nav",
  "footer",
  "header",
  "aside",
  "[role='navigation']",
  "[role='complementary']",
  "[role='banner']",
  "[aria-label*='pubblicità' i]",
  "[aria-label*='advert' i]",
  "[class*='advert']",
  "[class*='advertisement']",
  "[class*='sponsor']",
  "[class*='newsletter']",
  "[class*='social-share']",
  "[class*='share-button']",
  "[class*='related']",
  "[class*='recommend']",
  "[class*='suggested']",
  "[class*='most-read']",
  "[class*='mostread']",
  "[class*='popular']",
  "[class*='sidebar']",
  "[class*='widget']",
  "[class*='fixture']",
  "[class*='scoreboard']",
  "[class*='live-score']",
  "[class*='livescore']",
  "[class*='match-center']",
  "[class*='matchcenter']",
  "[class*='ticker']",
  "[class*='carousel']",
  "[id*='related']",
  "[id*='recommend']",
  "[id*='advert']",
  "[id*='newsletter']",
  "[id*='sidebar']",
  "[id*='widget']"
];

function removeNoise(root) {
  for (const selector of NOISE_SELECTORS) {
    try {
      root.querySelectorAll(selector).forEach(element => {
        element.remove();
      });
    } catch {
      // Ignora selettori non compatibili.
    }
  }
}

// ============================================================
// JSON-LD
// ============================================================

function extractJsonLd(document) {
  const results = [];

  function visit(value) {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    const types = Array.isArray(value["@type"])
      ? value["@type"]
      : [value["@type"]];

    if (
      types.some(type =>
        /Article|NewsArticle|ReportageNewsArticle|BlogPosting/i.test(
          String(type || "")
        )
      )
    ) {
      results.push(value);
    }

    if (value["@graph"]) {
      visit(value["@graph"]);
    }

    if (value.mainEntity) {
      visit(value.mainEntity);
    }
  }

  const scripts = document.querySelectorAll(
    'script[type="application/ld+json"]'
  );

  for (const script of scripts) {
    try {
      visit(JSON.parse(script.textContent || ""));
    } catch {
      // JSON-LD non valido.
    }
  }

  return results;
}

function extractStructuredBody(document) {
  for (const article of extractJsonLd(document)) {
    const body = article.articleBody || "";

    if (
      preserveArticleText(body).length >=
      MIN_COMPLETE_LENGTH
    ) {
      return {
        text: body,
        method: "json_ld",
        confidence: "alta"
      };
    }
  }

  return null;
}

// ============================================================
// CONTENITORI ARTICOLO
// ============================================================

const ARTICLE_SELECTORS = [
  '[itemprop="articleBody"]',
  '[data-testid="article-body"]',
  '[data-testid="article-content"]',
  ".article-body",
  ".article__body",
  ".article-content",
  ".article__content",
  ".article-text",
  ".article__text",
  ".article-detail__content",
  ".article-detail-content",
  ".post-content",
  ".post__content",
  ".entry-content",
  ".story-body",
  ".story-content",
  ".news-body",
  ".news-content",
  ".content-article",
  ".content__article",
  ".articleMain",
  ".article-main",
  ".articleBody",
  ".articleContent",
  ".detail-content",
  ".detail__content",
  ".news-detail-content",
  ".news-detail__content",
  "article"
];

function extractElementText(element) {
  const clone = element.cloneNode(true);

  removeNoise(clone);

  const paragraphs = [
    ...clone.querySelectorAll("p, h2, h3, blockquote")
  ]
    .map(node =>
      cleanText(node.textContent || "")
    )
    .filter(text => text.length >= 35);

  if (paragraphs.length) {
    return paragraphs.join("\n\n");
  }

  return preserveArticleText(
    clone.innerHTML || clone.textContent || ""
  );
}

function hasGoodArticleStructure(
  element,
  text,
  title
) {
  if (!element || !text) return false;

  const tag = element.tagName?.toLowerCase() || "";

  const className =
    typeof element.className === "string"
      ? element.className.toLowerCase()
      : "";

  const id = String(element.id || "").toLowerCase();

  const semantic =
    tag === "article" ||
    element.getAttribute("itemprop") === "articleBody" ||
    /article|story|post|news|content|body|text/.test(
      `${className} ${id}`
    );

  const paragraphs =
    element.querySelectorAll("p").length;

  const normalizedText = text.toLowerCase();
  const normalizedTitle = cleanText(title).toLowerCase();

  const titleMatch =
    normalizedTitle.length >= 12 &&
    normalizedText.includes(
      normalizedTitle.slice(0, 35)
    );

  return (
    semantic &&
    text.length >= 350 &&
    (paragraphs >= 2 || titleMatch)
  );
}

function extractSpecificContainer(document, title) {
  let best = null;

  for (const selector of ARTICLE_SELECTORS) {
    let elements = [];

    try {
      elements = [
        ...document.querySelectorAll(selector)
      ];
    } catch {
      continue;
    }

    for (const element of elements) {
      const text = extractElementText(element);

      if (
        !hasGoodArticleStructure(
          element,
          text,
          title
        )
      ) {
        continue;
      }

      const paragraphs =
        element.querySelectorAll("p").length;

      const strongSelector =
        element.getAttribute("itemprop") === "articleBody" ||
        selector.includes("article-body") ||
        selector.includes("article__body");

      const candidate = {
        text,
        method: `selector:${selector}`,
        confidence:
          strongSelector && paragraphs >= 3
            ? "alta"
            : "media"
      };

      if (
        !best ||
        candidate.text.length > best.text.length
      ) {
        best = candidate;
      }
    }

    // Un contenitore specifico di alta qualità
    // è preferibile a ulteriori contenitori generici.
    if (best?.confidence === "alta") {
      break;
    }
  }

  return best;
}

// ============================================================
// READABILITY
// ============================================================

function extractReadability(document, title) {
  try {
    const clone = document.cloneNode(true);

    removeNoise(clone);

    const reader = new Readability(clone, {
      keepClasses: false,
      charThreshold: 500
    });

    const parsed = reader.parse();

    if (!parsed?.textContent) {
      return null;
    }

    const text = preserveArticleText(
      parsed.textContent
    );

    if (text.length < MIN_COMPLETE_LENGTH) {
      return null;
    }

    const articleTitle = cleanText(
      parsed.title || ""
    ).toLowerCase();

    const expectedTitle = cleanText(
      title || ""
    ).toLowerCase();

    const titleWords = expectedTitle
      .split(/\s+/)
      .filter(word => word.length >= 4);

    const matchingWords = titleWords.filter(word =>
      articleTitle.includes(word)
    );

    const titleMatch =
      titleWords.length > 0 &&
      matchingWords.length >= Math.min(
        2,
        titleWords.length
      );

    const paragraphCount =
      (parsed.content.match(/<p[\s>]/gi) || []).length;

    if (!titleMatch || paragraphCount < 3) {
      return null;
    }

    return {
      text,
      method: "readability",
      confidence: "media"
    };
  } catch {
    return null;
  }
}

// ============================================================
// CONTROLLO QUALITÀ E COMPLETEZZA
// ============================================================

function evaluateText(text, method, confidence) {
  const cleaned = preserveArticleText(text).slice(
    0,
    MAX_ARTICLE_LENGTH
  );

  const paragraphs = cleaned
    .split(/\n+/)
    .map(item => item.trim())
    .filter(item => item.length >= 35);

  const words = cleaned
    .split(/\s+/)
    .filter(Boolean);

  const sentences = cleaned
    .split(/[.!?]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 25);

  const suspiciousPatterns = [
    /ultime notizie/i,
    /potrebbe interessarti/i,
    /leggi anche/i,
    /scopri anche/i,
    /articoli correlati/i,
    /le più lette/i,
    /risultati in diretta/i,
    /classifica aggiornata/i,
    /prossime partite/i,
    /seguici sui social/i,
    /accetta i cookie/i,
    /gestisci il consenso/i,
    /potrebbero interessarti/i,
    /notizie correlate/i,
    /altri articoli/i
  ];

  const suspiciousCount = suspiciousPatterns.filter(
    pattern => pattern.test(cleaned)
  ).length;

  const enoughText =
    cleaned.length >= MIN_COMPLETE_LENGTH &&
    words.length >= 100 &&
    (
      paragraphs.length >= 3 ||
      sentences.length >= 6
    );

  const lowNoise = suspiciousCount <= 1;

  let complete = false;
  let quality = "bassa";

  if (
    confidence === "alta" &&
    enoughText &&
    lowNoise
  ) {
    complete = true;
    quality = "alta";
  } else if (
    confidence === "media" &&
    cleaned.length >= 1200 &&
    words.length >= 180 &&
    (
      paragraphs.length >= 5 ||
      sentences.length >= 10
    ) &&
    lowNoise
  ) {
    complete = true;
    quality = "media";
  } else if (cleaned.length >= 250) {
    quality = "parziale";
  }

  return {
    text: cleaned,
    complete,
    quality,
    length: cleaned.length,
    words: words.length,
    paragraphs: paragraphs.length,
    sentences: sentences.length,
    suspiciousCount,
    method
  };
}

// ============================================================
// ESTRAZIONE COMPLETA PAGINA
// ============================================================

function extractMainText(html, url, title) {
  const dom = new JSDOM(html, {
    url
  });

  const document = dom.window.document;

  const candidates = [];

  // 1. JSON-LD.
  const structured = extractStructuredBody(document);

  if (structured) {
    const checked = evaluateText(
      structured.text,
      structured.method,
      structured.confidence
    );

    candidates.push(checked);

    if (checked.complete) {
      dom.window.close();
      return checked;
    }
  }

  // 2. Contenitori specifici.
  const specific = extractSpecificContainer(
    document,
    title
  );

  if (specific) {
    const checked = evaluateText(
      specific.text,
      specific.method,
      specific.confidence
    );

    candidates.push(checked);

    if (checked.complete) {
      dom.window.close();
      return checked;
    }
  }

  // 3. Readability.
  const readability = extractReadability(
    document,
    title
  );

  if (readability) {
    const checked = evaluateText(
      readability.text,
      readability.method,
      readability.confidence
    );

    candidates.push(checked);

    if (checked.complete) {
      dom.window.close();
      return checked;
    }
  }

  // 4. Se non è completo, conserva il miglior testo parziale.
  candidates.sort((a, b) => {
    if (a.complete !== b.complete) {
      return Number(b.complete) - Number(a.complete);
    }

    return b.length - a.length;
  });

  const result = candidates[0] || {
    text: "",
    complete: false,
    quality: "non_disponibile",
    length: 0,
    words: 0,
    paragraphs: 0,
    sentences: 0,
    suspiciousCount: 0,
    method: "nessuna_estrazione"
  };

  dom.window.close();

  return result;
}

// ============================================================
// METADATI ARTICOLO
// ============================================================

function getMeta(document, selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);

    if (!element) continue;

    const value =
      element.getAttribute("content") ||
      element.getAttribute("datetime") ||
      element.textContent ||
      "";

    const cleaned = cleanText(value);

    if (cleaned) return cleaned;
  }

  return "";
}

function getArticleTitle(document, fallback) {
  return (
    getMeta(document, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]'
    ]) ||
    cleanText(
      document.querySelector("h1")?.textContent || ""
    ) ||
    cleanText(document.title || "") ||
    fallback ||
    ""
  );
}

function getArticleDate(document, fallback) {
  const value = getMeta(document, [
    'meta[property="article:published_time"]',
    'meta[name="date"]',
    'meta[name="pubdate"]',
    'meta[itemprop="datePublished"]',
    "time[datetime]"
  ]);

  return parseDate(value || fallback);
}

function getArticleAuthor(document, fallback) {
  return (
    getMeta(document, [
      'meta[name="author"]',
      'meta[property="article:author"]',
      '[itemprop="author"]'
    ]) ||
    fallback ||
    ""
  );
}

function getArticleImage(document, fallback, baseUrl) {
  const image = getMeta(document, [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]'
  ]);

  return normalizeUrl(
    image || fallback,
    baseUrl
  );
}

// ============================================================
// RSS COME FONTE ALTERNATIVA
// ============================================================

function evaluateRssText(text) {
  if (!text || text.length < MIN_COMPLETE_LENGTH) {
    return null;
  }

  const result = evaluateText(
    text,
    "rss",
    "media"
  );

  // Un feed RSS può contenere soltanto un estratto.
  // Per dichiararlo completo servono requisiti più severi.

  if (
    result.text.length < 1800 ||
    result.words < 250 ||
    (
      result.paragraphs < 5 &&
      result.sentences < 10
    )
  ) {
    return {
      ...result,
      complete: false,
      quality: "parziale"
    };
  }

  return result;
}

// ============================================================
// ESTRAZIONE SINGOLO ARTICOLO
// ============================================================

function extractArticle(
  html,
  url,
  source,
  rssItem = null
) {
  const dom = new JSDOM(html, {
    url
  });

  const document = dom.window.document;

  const title = getArticleTitle(
    document,
    rssItem?.title || ""
  );

  const description = getMeta(document, [
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]'
  ]);

  const publishedAt = getArticleDate(
    document,
    rssItem?.publishedAt
  );

  const author = getArticleAuthor(
    document,
    rssItem?.author
  );

  const image = getArticleImage(
    document,
    rssItem?.image,
    url
  );

  dom.window.close();

  let finalText = extractMainText(
    html,
    url,
    title
  );

  // RSS usato anche quando la pagina si apre,
  // ma il testo estratto è incompleto.

  if (rssItem?.rssContent) {
    const rssExtracted = evaluateRssText(
      rssItem.rssContent
    );

    if (
      rssExtracted &&
      (
        (
          rssExtracted.complete &&
          !finalText.complete
        ) ||
        rssExtracted.length > finalText.length
      )
    ) {
      finalText = rssExtracted;
    }
  }

  const body = finalText.text || "";

  const summaryBase =
    body ||
    preserveArticleText(rssItem?.summary || "") ||
    description;

  const languageStatus = detectLanguage([
    title,
    description,
    body,
    rssItem?.summary || ""
  ].join(" "));

  return {
    title: cleanText(title),

    contenutoCompleto: body,

    summary: makeShortSummary(
      summaryBase,
      500
    ),

    excerpt: makeExcerpt(
      summaryBase,
      280
    ),

    publishedAt,

    author: cleanText(author),

    image,

    url: normalizeUrl(url, source.url),

    sourceId: source.id,

    source: source.name,

    lingua: languageStatus,

    testoCompletoDisponibile:
      finalText.complete === true,

    qualitaEstrazione: finalText.quality,

    metodoEstrazione: finalText.method,

    lunghezzaTesto: finalText.length,

    numeroParole: finalText.words,

    numeroParagrafi: finalText.paragraphs,

    motivoTestoCompleto:
      finalText.complete
        ? null
        : "Non è stato possibile verificare un corpo articolo sufficientemente completo."
  };
}

// ============================================================
// ARTICOLO RSS NON APRIBILE
// ============================================================

function articleFromRssOnly(item, source, error) {
  const rssText = preserveArticleText(
    item.rssContent || ""
  );

  const extracted = evaluateRssText(rssText);

  const complete = extracted?.complete === true;

  const text = extracted?.text || "";

  const summaryBase =
    text ||
    item.summary ||
    "";

  const languageStatus = detectLanguage([
    item.title,
    summaryBase
  ].join(" "));

  return {
    title: item.title,

    contenutoCompleto: text,

    summary: makeShortSummary(
      summaryBase,
      500
    ),

    excerpt: makeExcerpt(
      summaryBase,
      280
    ),

    publishedAt: item.publishedAt,

    author: item.author || "",

    image: item.image || null,

    url: item.url,

    sourceId: source.id,

    source: source.name,

    lingua: languageStatus,

    testoCompletoDisponibile: complete,

    qualitaEstrazione: complete
      ? "media"
      : "parziale",

    metodoEstrazione: complete
      ? "rss"
      : "rss_parziale",

    lunghezzaTesto: text.length,

    motivoTestoCompleto: complete
      ? null
      : "Pagina non raggiungibile e testo RSS insufficiente.",

    erroreDownload: String(
      error?.message || error || ""
    ).slice(0, 150)
  };
}

// ============================================================
// CONTROLLO FINALE NOTIZIA
// ============================================================

function isValidNews(article) {
  if (!article?.title || !article?.url) {
    return false;
  }

  if (
    !articleCandidate(
      article.url,
      SOURCES.find(
        source => source.id === article.sourceId
      ) || { domains: [] }
    )
  ) {
    return false;
  }

  if (
    article.lingua === "non_italiano"
  ) {
    return false;
  }

  const searchableText = [
    article.title,
    article.summary,
    article.excerpt,
    article.contenutoCompleto
  ].join(" ");

  if (!isFootball(searchableText)) {
    return false;
  }

  return true;
}

// ============================================================
// RACCOLTA DI UNA SINGOLA FONTE
// ============================================================

async function crawlSource(source) {
  const startedAt = Date.now();

  const status = {
    id: source.id,
    fonte: source.name,
    stato: "ok",
    articoliTrovati: 0,
    articoli: 0,
    articoliConTestoCompleto: 0,
    articoliSenzaTestoCompleto: 0,
    articoliNonItaliani: 0,
    metodi: [],
    errori: []
  };

  let homepage;

  try {
    homepage = await fetchText(source.url);
    status.metodi.push("homepage");
  } catch (error) {
    status.stato = "errore";

    status.errori.push(
      `Homepage: ${String(
        error.message || error
      ).slice(0, 150)}`
    );

    status.durataMs = Date.now() - startedAt;

    return {
      status,
      articles: []
    };
  }

  const candidates = new Map();

  // ----------------------------------------------------------
  // 1. RSS
  // ----------------------------------------------------------

  const feeds = discoverFeeds(
    homepage.text,
    homepage.finalUrl
  );

  for (const feedUrl of feeds) {
    const result = await readFeed(
      feedUrl,
      source
    );

    if (result.error) {
      status.errori.push(
        `RSS: ${result.error}`
      );
    }

    if (result.items.length) {
      status.metodi.push("rss");

      for (const item of result.items) {
        if (!withinWindow(item.publishedAt)) {
          continue;
        }

        const key = articleKey(item.url);

        if (key && !candidates.has(key)) {
          candidates.set(key, item);
        }
      }
    }
  }

  // ----------------------------------------------------------
  // 2. SITEMAP
  // ----------------------------------------------------------

  try {
    const sitemapArticles =
      await discoverSitemap(source);

    if (sitemapArticles.length) {
      status.metodi.push("sitemap");
    }

    for (const url of sitemapArticles) {
      const key = articleKey(url);

      if (!key || candidates.has(key)) {
        continue;
      }

      candidates.set(key, {
        title: "",
        summary: "",
        rssContent: "",
        publishedAt: null,
        url,
        author: "",
        image: null,
        sourceId: source.id,
        source: source.name
      });
    }
  } catch (error) {
    status.errori.push(
      `Sitemap: ${String(
        error.message || error
      ).slice(0, 150)}`
    );
  }

  // ----------------------------------------------------------
  // 3. LINK HOMEPAGE
  // ----------------------------------------------------------

  const homepageLinks = discoverLinks(
    homepage.text,
    homepage.finalUrl,
    source
  );

  if (homepageLinks.length) {
    status.metodi.push("link-homepage");
  }

  for (const item of homepageLinks) {
    const key = articleKey(item.url);

    if (!key || candidates.has(key)) {
      continue;
    }

    candidates.set(key, {
      title: item.title,
      summary: "",
      rssContent: "",
      publishedAt: null,
      url: item.url,
      author: "",
      image: null,
      sourceId: source.id,
      source: source.name
    });
  }

  status.articoliTrovati = candidates.size;

  // ----------------------------------------------------------
  // 4. ORDINAMENTO
  // ----------------------------------------------------------

  const ordered = [...candidates.values()]
    .sort((a, b) => {
      const dateA = a.publishedAt
        ? new Date(a.publishedAt).getTime()
        : 0;

      const dateB = b.publishedAt
        ? new Date(b.publishedAt).getTime()
        : 0;

      return dateB - dateA;
    });

  const selected = ordered.slice(
    0,
    MAX_ARTICLES_PER_SOURCE * 2
  );

  const articles = [];
  const seenUrls = new Set();

  // ----------------------------------------------------------
  // 5. APERTURA ARTICOLI
  // ----------------------------------------------------------

  for (const item of selected) {
    if (
      articles.length >= MAX_ARTICLES_PER_SOURCE
    ) {
      break;
    }

    const key = articleKey(item.url);

    if (!key || seenUrls.has(key)) {
      continue;
    }

    seenUrls.add(key);

    try {
      const page = await fetchText(item.url);

      if (
        page.contentType &&
        !/html|xhtml/i.test(page.contentType)
      ) {
        throw new Error(
          `Contenuto non HTML: ${page.contentType}`
        );
      }

      const article = extractArticle(
        page.text,
        page.finalUrl,
        source,
        item
      );

      article.url = normalizeUrl(
        article.url || item.url,
        source.url
      );

      article.title =
        article.title ||
        item.title ||
        "";

      article.publishedAt =
        article.publishedAt ||
        item.publishedAt ||
        null;

      article.author =
        article.author ||
        item.author ||
        "";

      article.image =
        article.image ||
        item.image ||
        null;

      if (
        !article.title ||
        !article.url ||
        !articleCandidate(article.url, source)
      ) {
        continue;
      }

      if (!withinWindow(article.publishedAt)) {
        continue;
      }

      if (article.lingua === "non_italiano") {
        status.articoliNonItaliani++;
        continue;
      }

      if (!isValidNews(article)) {
        continue;
      }

      articles.push(article);

      await sleep(120);

    } catch (error) {
      // Il ripiego RSS non inventa contenuti.
      if (item.title) {
        const fallback = articleFromRssOnly(
          item,
          source,
          error
        );

        if (
          fallback.lingua !== "non_italiano" &&
          isValidNews(fallback)
        ) {
          articles.push(fallback);
        } else if (
          fallback.lingua === "non_italiano"
        ) {
          status.articoliNonItaliani++;
        }
      }

      status.errori.push(
        `${getHostname(item.url)}: ${String(
          error.message || error
        ).slice(0, 120)}`
      );
    }
  }

  // ----------------------------------------------------------
  // 6. STATISTICHE
  // ----------------------------------------------------------

  status.articoli = articles.length;

  status.articoliConTestoCompleto =
    articles.filter(
      item => item.testoCompletoDisponibile === true
    ).length;

  status.articoliSenzaTestoCompleto =
    articles.length -
    status.articoliConTestoCompleto;

  if (!articles.length) {
    status.stato = status.errori.length
      ? "errore"
      : "vuoto";
  } else if (
    status.articoliSenzaTestoCompleto > 0 ||
    status.errori.length > 0
  ) {
    status.stato = "parziale";
  }

  status.durataMs = Date.now() - startedAt;

  return {
    status,
    articles
  };
}

// ============================================================
// FORMATO PUBBLICO DELLA NOTIZIA
// ============================================================

function formatPublicNews(item) {
  const id =
    item.idNotizia ||
    item.id ||
    stableNewsId(item);

  const testo =
    item.contenutoCompleto ||
    item.summary ||
    item.excerpt ||
    "";

  return {
    ...item,

    // Campi principali richiesti dal feed.
    id,
    titolo: item.title || "",
    testo,
    fonte: item.source || "",
    data: item.publishedAt || null,
    url: item.url || "",

    // Campi aggiuntivi utili.
    testoCompletoDisponibile:
      item.testoCompletoDisponibile === true,

    lingua: item.lingua || "non_verificabile"
  };
}

// ============================================================
// RACCOLTA GENERALE
// ============================================================

export async function collectNews() {
  const startedAt = new Date().toISOString();

  // Le sette fonti vengono elaborate in parallelo.

  const results = await Promise.all(
    SOURCES.map(async source => {
      try {
        return await crawlSource(source);
      } catch (error) {
        return {
          status: {
            id: source.id,
            fonte: source.name,
            stato: "errore",
            articoliTrovati: 0,
            articoli: 0,
            articoliConTestoCompleto: 0,
            articoliSenzaTestoCompleto: 0,
            articoliNonItaliani: 0,
            errori: [
              String(
                error.message || error
              ).slice(0, 180)
            ]
          },
          articles: []
        };
      }
    })
  );

  const sourceStatuses = results.map(
    result => result.status
  );

  // ----------------------------------------------------------
  // UNIONE ARTICOLI
  // ----------------------------------------------------------

  const collected = results
    .flatMap(result => result.articles)
    .filter(item =>
      item.title &&
      item.url
    )
    .map(item => ({
      ...item,
      idNotizia: stableNewsId(item)
    }));

  // ----------------------------------------------------------
  // MEMORIA STORICA
  // ----------------------------------------------------------

  let previous = [];

  try {
    previous = await loadRecent();

    if (!Array.isArray(previous)) {
      previous = [];
    }
  } catch {
    previous = [];
  }

  // ----------------------------------------------------------
  // DEDUPLICAZIONE
  // ----------------------------------------------------------

  const deduped = deduplicateNews(
    collected,
    previous
  );

  const uniqueNews = Array.isArray(deduped.news)
    ? deduped.news
    : [];

  const freshNews = Array.isArray(deduped.fresh)
    ? deduped.fresh
    : [];

  // ----------------------------------------------------------
  // AGGIORNAMENTO STORICO
  // ----------------------------------------------------------

  const historyMap = new Map();

  for (const item of previous) {
    const id =
      item.idNotizia ||
      item.id ||
      stableNewsId(item);

    if (id) {
      historyMap.set(id, item);
    }
  }

  for (const item of uniqueNews) {
    const record = makeHistoryRecord(item);

    const id =
      record.idNotizia ||
      record.id ||
      stableNewsId(item);

    if (id) {
      historyMap.set(id, {
        ...record,
        idNotizia: id
      });
    }
  }

  const history = [...historyMap.values()]
    .sort((a, b) => {
      const dateA = new Date(
        a.publishedAt ||
        a.dataPubblicazione ||
        a.data ||
        0
      ).getTime();

      const dateB = new Date(
        b.publishedAt ||
        b.dataPubblicazione ||
        b.data ||
        0
      ).getTime();

      return dateB - dateA;
    })
    .slice(0, 2500);

  // ----------------------------------------------------------
  // SALVATAGGIO REDIS
  // ----------------------------------------------------------

  let storageSaved = false;
  let storageError = null;

  try {
    const result = await saveRecent(history);

    storageSaved = result === true;
  } catch (error) {
    storageError = String(
      error.message || error
    ).slice(0, 160);
  }

  // ----------------------------------------------------------
  // ORDINAMENTO FINALE
  // ----------------------------------------------------------

  const sortedNews = uniqueNews.sort((a, b) => {
    const dateA = new Date(
      a.publishedAt ||
      a.dataPubblicazione ||
      0
    ).getTime();

    const dateB = new Date(
      b.publishedAt ||
      b.dataPubblicazione ||
      0
    ).getTime();

    return dateB - dateA;
  });

  const news = sortedNews.map(formatPublicNews);

  // ----------------------------------------------------------
  // STATISTICHE GENERALI
  // ----------------------------------------------------------

  const fullTextCount = news.filter(
    item => item.testoCompletoDisponibile === true
  ).length;

  const partialTextCount =
    news.length - fullTextCount;

  const sourceErrors = sourceStatuses.filter(
    item => item.stato === "errore"
  ).length;

  const partialSources = sourceStatuses.filter(
    item => item.stato === "parziale"
  ).length;

  const successfulSources = sourceStatuses.filter(
    item =>
      ["ok", "parziale", "vuoto"].includes(item.stato)
  ).length;

  const italianNews = news.filter(
    item => item.lingua !== "non_italiano"
  ).length;

  // ----------------------------------------------------------
  // RISPOSTA API
  // ----------------------------------------------------------

  return {
    success: successfulSources > 0,

    version: VERSION,

    generatedAt: new Date().toISOString(),

    startedAt,

    durataMs:
      Date.now() - new Date(startedAt).getTime(),

    finestraOre: HOURS_BACK,

    fontiConfigurate: SOURCES.length,

    fontiConErrore: sourceErrors,

    fontiParziali: partialSources,

    fontiElaborate: successfulSources,

    totalRaccolte: collected.length,

    totalNotizieUniche: news.length,

    nuoveRispettoAlleRaccoltePrecedenti:
      freshNews.length,

    doppioniRaggruppati:
      deduped.groupsMerged || 0,

    memoriaPersistenteAttiva:
      persistentStorageEnabled(),

    memoriaSalvata: storageSaved,

    erroreMemoria: storageError,

    totaleNotizieItaliane: italianNews,

    totaleConTestoCompleto: fullTextCount,

    totaleSenzaTestoCompleto: partialTextCount,

    fonti: sourceStatuses,

    news
  };
}
