// ============================================================
// 100% SERIE A & SERIE B
// FOOTBALL NEWS COLLECTOR v3.2.0
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

const VERSION = "3.2.0";

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

const parser = new Parser({
  timeout: FETCH_TIMEOUT,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; FootballNewsCollector/3.2; +https://vercel.com)",
    "Accept":
      "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*",
    "Accept-Language": "it-IT,it;q=0.9,en;q=0.7"
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
  "italia",
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
  "primavera"
];

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
  if (!value) return true;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return true;
  }

  const difference = Date.now() - date.getTime();

  // Non accetta notizie troppo vecchie.
  // Non esclude date future per eventuali errori di fuso orario.
  return difference <= HOURS_BACK * 3600000;
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

function isFootball(text) {
  const value = cleanText(text).toLowerCase();

  return FOOTBALL_WORDS.some(word =>
    value.includes(word)
  );
}

function articleKey(url) {
  return normalizeUrl(url)?.toLowerCase() || "";
}

// ============================================================
// CONTROLLO URL ARTICOLI
// ============================================================

function articleCandidate(value, source, baseUrl = source.url) {
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
    /\.(jpg|jpeg|png|gif|webp|svg|pdf|mp4|mp3|css|js|woff|woff2)(\?|$)/i.test(
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
    "/live/"
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

  const last = (segments.at(-1) || "").toLowerCase();

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
    "ultime-notizie"
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

    if (url) {
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

        const rssContent = cleanText(
          item["content:encoded"] ||
          item.content ||
          item.contentSnippet ||
          item.summary ||
          item.description ||
          ""
        );

        return {
          title: cleanText(item.title || ""),

          summary: cleanText(
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
// SCOPERTA SITEMAP
// ============================================================

async function discoverSitemap(source) {
  const urls = [
    absoluteUrl("/sitemap.xml", source.url),
    absoluteUrl("/sitemap_index.xml", source.url),
    absoluteUrl("/sitemap-news.xml", source.url),
    absoluteUrl("/news-sitemap.xml", source.url)
  ].filter(Boolean);

  const found = new Set();

  for (const sitemapUrl of urls) {
    try {
      const response = await fetchText(sitemapUrl);

      if (
        !/<urlset|<sitemapindex|<url>/i.test(
          response.text
        )
      ) {
        continue;
      }

      const matches = [
        ...response.text.matchAll(
          /<loc>\s*([\s\S]*?)\s*<\/loc>/gi
        )
      ];

      for (const match of matches) {
        const url = normalizeUrl(
          cleanText(match[1]),
          sitemapUrl
        );

        if (
          url &&
          articleCandidate(url, source)
        ) {
          found.add(url);
        }
      }

      if (found.size) {
        break;
      }
    } catch {
      // Prova il successivo sitemap.
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
// JSON-LD: DATI STRUTTURATI DEGLI ARTICOLI
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
    const body = cleanText(
      article.articleBody || ""
    );

    if (body.length >= MIN_COMPLETE_LENGTH) {
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
// ESTRAZIONE DA CONTENITORI ARTICOLO
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
    .map(node => cleanText(node.textContent || ""))
    .filter(text => text.length >= 35);

  if (paragraphs.length) {
    return paragraphs.join("\n\n");
  }

  return cleanText(clone.textContent || "");
}

function hasGoodArticleStructure(element, text, title) {
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

      return {
        text,
        method: `selector:${selector}`,
        confidence:
          strongSelector && paragraphs >= 3
            ? "alta"
            : "media"
      };
    }
  }

  return null;
}

// ============================================================
// READABILITY COME METODO ALTERNATIVO
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

    const text = cleanText(parsed.textContent);

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
  const cleaned = cleanText(text).slice(
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
    paragraphs.length >= 3;

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
    paragraphs.length >= 5 &&
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

  // 1. Dati strutturati.
  const structured = extractStructuredBody(document);

  if (structured) {
    const checked = evaluateText(
      structured.text,
      structured.method,
      structured.confidence
    );

    if (checked.complete) {
      dom.window.close();
      return checked;
    }
  }

  // 2. Contenitore specifico dell'articolo.
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

    if (checked.complete) {
      dom.window.close();
      return checked;
    }
  }

  // 4. Testo parziale: mai dichiarato completo.
  const partial =
    specific?.text ||
    structured?.text ||
    readability?.text ||
    "";

  const result = partial
    ? evaluateText(
        partial,
        "estrazione_parziale",
        "bassa"
      )
    : {
        text: "",
        complete: false,
        quality: "non_disponibile",
        length: 0,
        words: 0,
        paragraphs: 0,
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

  // Il feed RSS può contenere soltanto un estratto.
  // Per questo richiediamo una soglia più alta.
  if (
    result.text.length < 1800 ||
    result.words < 250 ||
    result.paragraphs < 5
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

function extractArticle(html, url, source, rssItem = null) {
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

  // Estrae il testo della pagina senza usare main o body
  // come ripiego generico.
  const extracted = extractMainText(
    html,
    url,
    title
  );

  let finalText = extracted;

  // Il feed viene usato soltanto se contiene
  // un testo sufficientemente articolato.
  if (!finalText.complete && rssItem?.rssContent) {
    const rssExtracted = evaluateRssText(
      cleanText(rssItem.rssContent)
    );

    if (
      rssExtracted &&
      (
        rssExtracted.complete ||
        rssExtracted.length > finalText.length
      )
    ) {
      finalText = rssExtracted;
    }
  }

  const body = finalText.text || "";

  const summaryBase =
    body ||
    cleanText(rssItem?.summary || "") ||
    description;

  const complete = finalText.complete === true;

  return {
    title: cleanText(title),

    contenutoCompleto: body,

    summary: makeShortSummary(summaryBase, 500),

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

    testoCompletoDisponibile: complete,

    qualitaEstrazione: finalText.quality,

    metodoEstrazione: finalText.method,

    lunghezzaTesto: finalText.length,

    numeroParole: finalText.words,

    numeroParagrafi: finalText.paragraphs,

    motivoTestoCompleto: complete
      ? null
      : "Non è stato possibile verificare un corpo articolo sufficientemente completo."
  };
}

// ============================================================
// NORMALIZZAZIONE ARTICOLO RSS NON APRIBILE
// ============================================================

function articleFromRssOnly(item, source, error) {
  const rssText = cleanText(
    item.rssContent || ""
  );

  const extracted = evaluateRssText(rssText);

  const complete = extracted?.complete === true;

  const text = extracted?.text || "";

  const summaryBase =
    text ||
    item.summary ||
    "";

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

    testoCompletoDisponibile: complete,

    qualitaEstrazione: complete
      ? "media"
      : "non_disponibile",

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
  // 5. APERTURA DI OGNI SINGOLO ARTICOLO
  // ----------------------------------------------------------

  for (const item of selected) {
    if (articles.length >= MAX_ARTICLES_PER_SOURCE) {
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

      // Verifica finale URL e titolo.
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

      // Tutte le fonti sono calcistiche, ma controlliamo
      // comunque che la notizia sia effettivamente di calcio.
      const searchableText = [
        article.title,
        article.summary,
        article.excerpt,
        article.contenutoCompleto
      ].join(" ");

      if (!isFootball(searchableText)) {
        continue;
      }

      articles.push(article);

      await sleep(120);

    } catch (error) {
      // Se l'articolo non si apre, non inventiamo il testo.
      // Conserviamo soltanto le informazioni RSS disponibili.
      if (item.title) {
        const fallback = articleFromRssOnly(
          item,
          source,
          error
        );

        if (
          isFootball(
            [
              fallback.title,
              fallback.summary,
              fallback.contenutoCompleto
            ].join(" ")
          )
        ) {
          articles.push(fallback);
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
  // 6. STATISTICHE FONTE
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

  try {
    const result = await saveRecent(history);

    storageSaved = result !== false;
  } catch (error) {
    sourceStatuses.push({
      id: "storage",
      fonte: "Memoria doppioni",
      stato: "errore",
      articoli: 0,
      errori: [
        String(
          error.message || error
        ).slice(0, 160)
      ]
    });
  }

  // ----------------------------------------------------------
  // ORDINAMENTO FINALE
  // ----------------------------------------------------------

  const news = uniqueNews.sort((a, b) => {
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

  // ----------------------------------------------------------
  // RISPOSTA API
  // ----------------------------------------------------------

  return {
    success: news.length > 0,

    version: VERSION,

    generatedAt: new Date().toISOString(),

    startedAt,

    durataMs:
      Date.now() - new Date(startedAt).getTime(),

    finestraOre: HOURS_BACK,

    fontiConfigurate: SOURCES.length,

    fontiConErrore: sourceErrors,

    fontiParziali: partialSources,

    totalRaccolte: collected.length,

    totalNotizieUniche: news.length,

    nuoveRispettoAlleRaccoltePrecedenti:
      freshNews.length,

    doppioniRaggruppati:
      deduped.groupsMerged || 0,

    memoriaPersistenteAttiva:
      persistentStorageEnabled(),

    memoriaSalvata: storageSaved,

    totaleConTestoCompleto: fullTextCount,

    totaleSenzaTestoCompleto: partialTextCount,

    fonti: sourceStatuses,

    news
  };
      }
