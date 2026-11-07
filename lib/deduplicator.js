import { normalizeTitle, cleanText } from "./cleaner.js";

const STOP = new Set([
  "della", "dello", "delle", "degli", "dell", "del",
  "dai", "dalle", "alla", "alle", "allo", "agli",
  "nel", "nella", "nelle", "nello", "nei",
  "sul", "sulla", "sulle", "sullo",
  "per", "con", "che", "come", "dopo", "prima",
  "oggi", "ieri", "domani", "ora", "ufficiale",
  "calcio", "serie", "news", "mercato", "calciomercato",
  "di", "da", "in", "il", "lo", "la", "i", "gli",
  "le", "un", "uno", "una", "e", "a", "è", "ha",
  "si", "non", "al", "ai", "tra", "fra",
  "the", "and", "for", "with", "from",
  "after", "before", "official"
]);

const SOURCE_PRIORITY = {
  "lega-serie-a": 10,
  "gazzetta": 9,
  "di-marzio": 8,
  "tuttomercatoweb": 7,
  "pianeta-serie-b": 7,
  "fantacalcio": 6,
  "onefootball": 5
};

const MAX_HISTORY = 2500;
const MAX_BODY_LENGTH = 2500;
const MAX_DATE_DISTANCE = 36 * 60 * 60 * 1000;

function tokens(text) {
  return new Set(
    normalizeTitle(text)
      .split(" ")
      .filter(word =>
        word.length > 2 &&
        !STOP.has(word)
      )
  );
}

function similarity(a, b) {
  const A = tokens(a);
  const B = tokens(b);

  if (!A.size || !B.size) return 0;

  let intersection = 0;

  for (const word of A) {
    if (B.has(word)) intersection++;
  }

  const union = A.size + B.size - intersection;

  return union ? intersection / union : 0;
}

function getDate(item) {
  const value =
    item?.publishedAt ||
    item?.data ||
    item?.date ||
    null;

  if (!value) return null;

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp)
    ? timestamp
    : null;
}

function datesCompatible(a, b) {
  const dateA = getDate(a);
  const dateB = getDate(b);

  // Se entrambe le date sono disponibili,
  // devono essere sufficientemente vicine.
  if (dateA !== null && dateB !== null) {
    return Math.abs(dateA - dateB) <= MAX_DATE_DISTANCE;
  }

  // Se manca una data, richiediamo un titolo
  // praticamente identico.
  return null;
}

function articleText(item) {
  return [
    item.title || "",
    item.summary || "",
    item.excerpt || "",
    item.testo || "",
    item.contenutoCompleto || ""
  ]
    .join(" ")
    .slice(0, MAX_BODY_LENGTH);
}

function isDuplicate(a, b) {
  if (!a || !b) return false;

  // URL identico: stesso articolo.
  if (
    a.url &&
    b.url &&
    a.url === b.url
  ) {
    return true;
  }

  const dateCheck = datesCompatible(a, b);

  const titleScore = similarity(
    a.title || "",
    b.title || ""
  );

  // Senza date affidabili, evitiamo unioni aggressive.
  if (dateCheck === null) {
    return titleScore >= 0.90;
  }

  if (!dateCheck) return false;

  const bodyScore = similarity(
    articleText(a),
    articleText(b)
  );

  // Titoli praticamente identici.
  if (titleScore >= 0.82) {
    return true;
  }

  // Titoli simili e contenuti coerenti.
  if (
    titleScore >= 0.50 &&
    bodyScore >= 0.42
  ) {
    return true;
  }

  // Titoli riscritti, ma con forte corrispondenza
  // sia nel titolo sia nel contenuto.
  if (
    titleScore >= 0.35 &&
    bodyScore >= 0.65
  ) {
    return true;
  }

  return false;
}

function quality(item) {
  const priority =
    SOURCE_PRIORITY[item.sourceId] || 1;

  const textLength = Math.max(
    (item.summary || "").length,
    (item.excerpt || "").length
  );

  const completeTextBonus =
    item.testoCompletoDisponibile === true
      ? 100
      : 0;

  return (
    priority * 1000 +
    Math.min(textLength, 700) +
    completeTextBonus +
    (item.author ? 30 : 0) +
    (item.image ? 10 : 0)
  );
}

function getSourceInfo(item) {
  return {
    id: item.sourceId || "sconosciuta",
    name: item.source || item.sourceId || "Fonte sconosciuta",
    url: item.url || null
  };
}

function mergeSources(items) {
  const sources = new Map();

  for (const item of items) {
    const source = getSourceInfo(item);

    const existing = sources.get(source.id);

    if (!existing || (!existing.url && source.url)) {
      sources.set(source.id, source);
    }
  }

  return [...sources.values()];
}

function buildGroups(input) {
  const groups = [];

  const sorted = [...input].sort(
    (a, b) => quality(b) - quality(a)
  );

  for (const item of sorted) {
    let group = groups.find(g =>
      g.items.some(existing =>
        isDuplicate(existing, item)
      )
    );

    if (!group) {
      group = {
        items: [],
        main: null
      };

      groups.push(group);
    }

    group.items.push(item);

    if (
      !group.main ||
      quality(item) > quality(group.main)
    ) {
      group.main = item;
    }
  }

  return groups;
}

function previousMatch(item, previous) {
  for (const old of previous) {
    if (!old) continue;

    // Identificativo stabile.
    if (
      item.idNotizia &&
      old.idNotizia &&
      item.idNotizia === old.idNotizia
    ) {
      return true;
    }

    // URL identico.
    if (
      item.url &&
      old.url &&
      item.url === old.url
    ) {
      return true;
    }

    // Stessa notizia rilevata in una raccolta precedente.
    if (isDuplicate(old, item)) {
      return true;
    }
  }

  return false;
}

export function deduplicateNews(input, previous = []) {
  const safeInput = Array.isArray(input)
    ? input.filter(item =>
        item &&
        typeof item === "object" &&
        item.title
      )
    : [];

  const safePrevious = Array.isArray(previous)
    ? previous
        .filter(item =>
          item &&
          typeof item === "object"
        )
        .slice(0, MAX_HISTORY)
    : [];

  const groups = buildGroups(safeInput);

  const output = groups.map(group => {
    const main = group.main;

    const sources = mergeSources(group.items);

    return {
      ...main,

      idNotizia:
        main.idNotizia ||
        stableNewsId(main),

      fonti: sources,
      numeroFonti: sources.length,
      duplicato: false
    };
  });

  const fresh = output.filter(item =>
    !previousMatch(item, safePrevious)
  );

  return {
    news: output,
    fresh,
    groupsMerged: Math.max(
      0,
      safeInput.length - output.length
    )
  };
}

export function stableNewsId(item) {
  const basis = normalizeTitle(
    item.title || item.url || ""
  );

  let hash = 2166136261;

  for (const char of basis) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return `fn-${(hash >>> 0).toString(16)}`;
}

export function makeHistoryRecord(item) {
  return {
    idNotizia:
      item.idNotizia ||
      stableNewsId(item),

    title: cleanText(item.title || ""),

    summary: cleanText(item.summary || ""),

    excerpt: cleanText(item.excerpt || ""),

    publishedAt: item.publishedAt || null,

    url: item.url || null,

    sourceId: item.sourceId || null
  };
}
