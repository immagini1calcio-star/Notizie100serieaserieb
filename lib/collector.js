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

const parser = new Parser({
  timeout: 12000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; FootballNewsCollector/3.0; +https://vercel.com)",
    "Accept":
      "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*"
  }
});

const MAX_ARTICLES_PER_SOURCE = Math.min(
  Math.max(Number(process.env.MAX_ARTICLES_PER_SOURCE || 8), 1),
  15
);

const HOURS_BACK = Math.min(
  Math.max(Number(process.env.HOURS_BACK || 36), 1),
  168
);

const FETCH_TIMEOUT = 12000;

const FOOTBALL_WORDS = [
  "calcio",
  "serie a",
  "serie b",
  "coppa italia",
  "champions",
  "europa league",
  "conference league",
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
  "mercato",
  "allenatore",
  "calciatore",
  "infortunio",
  "trasferimento",
  "fantacalcio"
];

function isFootball(text) {
  const value = String(text || "").toLowerCase();
  return FOOTBALL_WORDS.some(word => value.includes(word));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "it-IT,it;q=0.9,en;q=0.7"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return {
    text: await response.text(),
    contentType: response.headers.get("content-type") || "",
    finalUrl: response.url || url
  };
}

function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

function withinWindow(date) {
  if (!date) return true;

  return (
    Date.now() - new Date(date).getTime() <=
    HOURS_BACK * 3600000
  );
}

function articleCandidate(url, source) {
  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    const host = parsed.hostname
      .replace(/^www\./, "")
      .replace(/^m\./, "");

    if (
      !source.domains.some(
        domain => host === domain || host.endsWith(`.${domain}`)
      )
    ) {
      return false;
    }

    if (
      /\.(jpg|jpeg|png|gif|webp|svg|pdf|mp4|mp3|css|js)(\?|$)/i.test(
        parsed.pathname
      )
    ) {
      return false;
    }

    if (
      /\/(tag|categoria|category|author|privacy|cookie|login|account|video)\/?$/i.test(
        parsed.pathname
      )
    ) {
      return false;
    }

    const segments = parsed.pathname
      .split("/")
      .filter(Boolean);

    const lastSegment = (segments.at(-1) || "").toLowerCase();

    const excludedPages = [
      "home",
      "news",
      "calcio",
      "serie-a",
      "serie-b",
      "partite",
      "team",
      "squadre",
      "galleries",
      "gallery",
      "palmares",
      "classifica",
      "competizioni"
    ];

    if (excludedPages.includes(lastSegment)) {
      return false;
    }

    // Evita alcune pagine generiche di OneFootball.
    if (
      /\/it\/(competizione|squadra|partite)(\/|$)/i.test(
        parsed.pathname
      )
    ) {
      return false;
    }

    return segments.length >= 1;
  } catch {
    return false;
  }
}

function discoverLinks(html, baseUrl, source) {
  const dom = new JSDOM(html, { url: baseUrl });
  const links = new Set();

  for (const anchor of dom.window.document.querySelectorAll("a[href]")) {
    const url = cleanUrl(
      anchor.getAttribute("href"),
      baseUrl
    );

    if (url && articleCandidate(url, source)) {
      links.add(url);
    }
  }

  dom.window.close();

  return [...links].slice(0, MAX_ARTICLES_PER_SOURCE * 4);
}

function discoverFeeds(html, baseUrl) {
  const dom = new JSDOM(html, { url: baseUrl });

  const feeds = [
    ...dom.window.document.querySelectorAll(
      'link[rel~="alternate"][href]'
    )
  ]
    .filter(element =>
      /rss|atom|xml/i.test(
        `${element.type || ""} ${element.href || ""}`
      )
    )
    .map(element =>
      cleanUrl(element.getAttribute("href"), baseUrl)
    )
    .filter(Boolean)
    .slice(0, 4);

  dom.window.close();

  return feeds;
}

function rssItems(feed, source) {
  return (feed.items || [])
    .map(item => {
      const url = cleanUrl(
        item.link || item.guid,
        source.url
      );

      const rssBody =
        item["content:encoded"] ||
        item.content ||
        item["content:encodedSnippet"] ||
        "";

      return {
        title: cleanText(item.title || ""),

        summary: cleanText(
          item.contentSnippet ||
          item.summary ||
          rssBody ||
          ""
        ),

        // Conserviamo anche l'eventuale corpo presente nel feed.
        rssContent: cleanText(rssBody),

        publishedAt: parseDate(
          item.isoDate ||
          item.pubDate ||
          item.published ||
          item.updated
        ),

        url,

        author: cleanText(
          item.creator ||
          item.author ||
          ""
        ),

        image: item.enclosure?.url || null,

        sourceId: source.id,
        source: source.name
      };
    })
    .filter(item => item.title && item.url);
}

async function readFeed(url, source) {
  try {
    const feed = await parser.parseURL(url);

    return {
      items: rssItems(feed, source),
      error: null
    };
  } catch (error) {
    return {
      items: [],
      error: String(error.message || error).slice(0, 180)
    };
  }
}

/*
 * Estrae il corpo della singola pagina.
 *
 * Prima usa Readability.
 * Se Readability non trova abbastanza testo, prova alcuni
 * contenitori tipici degli articoli giornalistici.
 */
function extractMainText(doc) {
  let articleText = "";

  try {
    const parsed = new Readability(
      doc.cloneNode(true)
    ).parse();

    articleText = parsed?.textContent || "";
  } catch {}

  articleText = cleanText(articleText);

  // Se Readability ha trovato un testo consistente, lo usiamo.
  if (articleText.length >= 500) {
    return articleText;
  }

  // Secondo tentativo: contenitori tipici degli articoli.
  const selectors = [
    '[itemprop="articleBody"]',
    "article",
    '[class*="article-body"]',
    '[class*="article__body"]',
    '[class*="article-content"]',
    '[class*="article__content"]',
    '[class*="post-content"]',
    '[class*="entry-content"]',
    '[class*="story-body"]',
    '[class*="content-body"]',
    '[class*="news-body"]',
    '[class*="text-article"]',
    "main"
  ];

  for (const selector of selectors) {
    const elements = doc.querySelectorAll(selector);

    for (const element of elements) {
      const clone = element.cloneNode(true);

      clone
        .querySelectorAll(
          "script,style,noscript,nav,header,footer,aside,form,button,iframe"
        )
        .forEach(node => node.remove());

      const text = cleanText(
        clone.textContent || ""
      );

      if (text.length > articleText.length) {
        articleText = text;
      }

      if (articleText.length >= 500) {
        return articleText;
      }
    }
  }

  return articleText;
}

function extractArticle(html, url, source, rssItem = null) {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  const title =
    doc.querySelector('meta[property="og:title"]')?.content ||
    doc.querySelector('meta[name="twitter:title"]')?.content ||
    doc.querySelector("h1")?.textContent ||
    doc.title ||
    rssItem?.title ||
    "";

  const description =
    doc.querySelector('meta[property="og:description"]')?.content ||
    doc.querySelector('meta[name="description"]')?.content ||
    "";

  const published =
    doc.querySelector('meta[property="article:published_time"]')?.content ||
    doc.querySelector('meta[name="date"]')?.content ||
    doc.querySelector("time[datetime]")?.getAttribute("datetime") ||
    null;

  const author =
    doc.querySelector('meta[name="author"]')?.content ||
    doc.querySelector('meta[property="article:author"]')?.content ||
    "";

  const image =
    doc.querySelector('meta[property="og:image"]')?.content ||
    doc.querySelector('meta[name="twitter:image"]')?.content ||
    null;

  // Estrazione del corpo dalla pagina dell'articolo.
  let articleText = extractMainText(doc);

  dom.window.close();

  const rssText = cleanText(rssItem?.rssContent || "");
  const descriptionText = cleanText(description);

  // Se il sito non rende disponibile il testo nella pagina,
  // proviamo a recuperare il contenuto presente nel feed RSS.
  if (articleText.length < 500 && rssText.length > articleText.length) {
    articleText = rssText;
  }

  const fullTextAvailable = articleText.length >= 500;

  const fullText = fullTextAvailable
    ? articleText
    : "";

  const summaryBase =
    fullText ||
    rssText ||
    descriptionText;

  return {
    title: cleanText(title || rssItem?.title || ""),

    // Corpo completo estratto dalla pagina o dal feed.
    contenutoCompleto: fullText,

    // Riassunto breve separato dal testo integrale.
    summary: makeShortSummary(summaryBase),

    // Estratto breve per anteprime e visualizzazioni.
    excerpt: makeExcerpt(
      descriptionText ||
      summaryBase
    ),

    publishedAt:
      parseDate(published) ||
      rssItem?.publishedAt ||
      null,

    author:
      cleanText(author) ||
      rssItem?.author ||
      "",

    image:
      cleanUrl(image, url) ||
      rssItem?.image ||
      null,

    url,

    sourceId: source.id,
    source: source.name,

    testoCompletoDisponibile: fullTextAvailable,

    motivoTestoCompleto: fullTextAvailable
      ? null
      : "Il sito non ha reso disponibile una quantità sufficiente di testo estraibile."
  };
}

async function crawlSource(source) {
  const status = {
    id: source.id,
    fonte: source.name,
    stato: "ok",
    articoli: 0,
    articoliConTestoCompleto: 0,
    metodo: [],
    errori: []
  };

  let homepage;

  try {
    homepage = await fetchText(source.url);
    status.metodo.push("pagina");
  } catch (error) {
    status.stato = "errore";

    status.errori.push(
      String(error.message || error).slice(0, 180)
    );

    return {
      status,
      articles: []
    };
  }

  const candidates = new Map();

  // 1. Scoperta dei feed RSS.
  const feedUrls = discoverFeeds(
    homepage.text,
    homepage.finalUrl
  );

  for (const feedUrl of feedUrls) {
    const result = await readFeed(feedUrl, source);

    if (result.items.length) {
      status.metodo.push("rss-autodiscovery");

      for (const item of result.items) {
        if (
          item.url &&
          articleCandidate(item.url, source) &&
          withinWindow(item.publishedAt)
        ) {
          candidates.set(item.url, item);
        }
      }
    } else if (result.error) {
      status.errori.push(`RSS: ${result.error}`);
    }
  }

  // 2. Scoperta tramite sitemap.
  const sitemapUrls = [
    new URL("/sitemap.xml", source.url).toString(),
    new URL("/sitemap_index.xml", source.url).toString()
  ];

  for (const sitemapUrl of sitemapUrls) {
    try {
      const sitemap = await fetchText(sitemapUrl);

      if (!/<urlset|<sitemapindex/i.test(sitemap.text)) {
        continue;
      }

      const locs = [
        ...sitemap.text.matchAll(
          /<loc>\s*([\s\S]*?)\s*<\/loc>/gi
        )
      ]
        .map(match => cleanText(match[1]))
        .filter(url => articleCandidate(url, source));

      for (const url of locs.slice(
        0,
        MAX_ARTICLES_PER_SOURCE * 3
      )) {
        if (!candidates.has(url)) {
          candidates.set(url, null);
        }
      }

      status.metodo.push("sitemap");

      if (locs.length) break;
    } catch {}
  }

  // 3. Scoperta dei link nella homepage.
  for (const url of discoverLinks(
    homepage.text,
    homepage.finalUrl,
    source
  )) {
    if (!candidates.has(url)) {
      candidates.set(url, null);
    }
  }

  status.metodo.push("link-interni");

  const urls = [
    ...candidates.keys()
  ].slice(0, MAX_ARTICLES_PER_SOURCE * 2);

  const articles = [];

  // 4. APERTURA DI OGNI SINGOLO ARTICOLO.
  // Anche le notizie trovate tramite RSS vengono aperte.
  for (const url of urls) {
    const existing = candidates.get(url);

    try {
      const page = await fetchText(url);

      if (
        !/html/i.test(page.contentType) &&
        !/<html|<article/i.test(page.text.slice(0, 1000))
      ) {
        continue;
      }

      const article = extractArticle(
        page.text,
        page.finalUrl,
        source,
        existing
      );

      // Recuperiamo dall'RSS le informazioni mancanti.
      article.title =
        article.title ||
        existing?.title ||
        "";

      article.publishedAt =
        article.publishedAt ||
        existing?.publishedAt ||
        null;

      article.author =
        article.author ||
        existing?.author ||
        "";

      article.image =
        article.image ||
        existing?.image ||
        null;

      if (
        !article.contenutoCompleto &&
        existing?.rssContent &&
        cleanText(existing.rssContent).length >= 500
      ) {
        article.contenutoCompleto = cleanText(
          existing.rssContent
        );

        article.testoCompletoDisponibile = true;

        article.motivoTestoCompleto = null;

        article.summary = makeShortSummary(
          article.contenutoCompleto
        );
      }

      article.summary =
        article.summary ||
        existing?.summary ||
        "";

      article.excerpt =
        article.excerpt ||
        existing?.summary ||
        "";

      if (!article.title || !article.url) {
        continue;
      }

      if (!articleCandidate(article.url, source)) {
        continue;
      }

      if (!withinWindow(article.publishedAt)) {
        continue;
      }

      if (
        !isFootball(
          [
            article.title,
            article.summary,
            article.excerpt,
            article.contenutoCompleto
          ].join(" ")
        )
      ) {
        continue;
      }

      articles.push(article);

      if (article.testoCompletoDisponibile) {
        status.articoliConTestoCompleto++;
      }

      if (articles.length >= MAX_ARTICLES_PER_SOURCE) {
        break;
      }

    } catch (error) {
      // Se la pagina non si apre, conserviamo i dati RSS,
      // ma non dichiariamo di avere il testo integrale.
      if (existing?.title) {
        const rssText = cleanText(
          existing.rssContent || ""
        );

        const hasRssFullText = rssText.length >= 500;

        articles.push({
          title: existing.title,

          contenutoCompleto: hasRssFullText
            ? rssText
            : "",

          summary: hasRssFullText
            ? makeShortSummary(rssText)
            : existing.summary,

          excerpt: makeExcerpt(
            existing.summary || rssText
          ),

          publishedAt: existing.publishedAt,
          author: existing.author,
          image: existing.image,
          url,

          sourceId: source.id,
          source: source.name,

          testoCompletoDisponibile: hasRssFullText,

          motivoTestoCompleto: hasRssFullText
            ? null
            : "Impossibile aprire la pagina dell'articolo e il feed non contiene il testo completo."
        });

        if (hasRssFullText) {
          status.articoliConTestoCompleto++;
        }
      }

      status.errori.push(
        `${new URL(url).hostname}: ${String(
          error.message || error
        ).slice(0, 100)}`
      );
    }
  }

  status.articoli = articles.length;

  if (!articles.length && status.errori.length) {
    status.stato = "parziale";
  }

  if (
    articles.length &&
    status.articoliConTestoCompleto < articles.length
  ) {
    status.stato = "parziale";
  }

  return {
    status,
    articles
  };
}

export async function collectNews() {
  const startedAt = new Date().toISOString();

  const results = await Promise.all(
    SOURCES.map(crawlSource)
  );

  const sourceStatuses = results.map(
    result => result.status
  );

  const collected = results
    .flatMap(result => result.articles)
    .filter(item => item.title && item.url)
    .map(item => ({
      ...item,
      idNotizia: stableNewsId(item)
    }));

  const previous = await loadRecent().catch(
    () => []
  );

  const deduped = deduplicateNews(
    collected,
    previous
  );

  const history = [
    ...deduped.news.map(makeHistoryRecord),
    ...previous
  ];

  const uniqueHistory = [
    ...new Map(
      history.map(item => [
        item.idNotizia,
        item
      ])
    ).values()
  ].slice(0, 2500);

  let persistent = false;

  try {
    persistent = await saveRecent(uniqueHistory);
  } catch (error) {
    sourceStatuses.push({
      id: "storage",
      fonte: "Memoria doppioni",
      stato: "errore",
      articoli: 0,
      errori: [
        String(error.message || error).slice(0, 160)
      ]
    });
  }

  const news = deduped.news.sort(
    (a, b) =>
      new Date(b.publishedAt || 0) -
      new Date(a.publishedAt || 0)
  );

  return {
    success: true,
    version: "3.1.0",
    generatedAt: new Date().toISOString(),
    startedAt,

    totalRaccolte: collected.length,
    totalNotizieUniche: news.length,
    nuoveRispettoAlleRaccoltePrecedenti:
      deduped.fresh.length,

    doppioniRaggruppati: deduped.groupsMerged,

    memoriaPersistenteAttiva:
      persistent || persistentStorageEnabled(),

    finestraOre: HOURS_BACK,

    totaleConTestoCompleto: news.filter(
      item => item.testoCompletoDisponibile
    ).length,

    totaleSenzaTestoCompleto: news.filter(
      item => !item.testoCompletoDisponibile
    ).length,

    fonti: sourceStatuses,
    news
  };
    }
