import { normalizeTitle, cleanText } from "./cleaner.js";

const STOP = new Set([
  "della","dello","delle","degli","dell","del","dai","dalle","alla","alle","allo",
  "agli","nel","nella","nelle","nello","nei","sul","sulla","sulle","sullo","per",
  "con","che","come","dopo","prima","oggi","ieri","domani","ora","ufficiale",
  "calcio","serie","news","mercato","calciomercato","di","da","in","il","lo","la",
  "i","gli","le","un","uno","una","e","a","è","ha","si","non","al","ai","tra","fra",
  "the","and","for","with","from","after","before","official"
]);

function tokens(text) {
  return new Set(
    normalizeTitle(text).split(" ")
      .filter(word => word.length > 2 && !STOP.has(word))
  );
}

function similarity(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const word of A) if (B.has(word)) intersection++;
  return intersection / (A.size + B.size - intersection);
}

function sameCalendarDay(a, b) {
  const da = new Date(a || 0);
  const db = new Date(b || 0);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.toISOString().slice(0, 10) === db.toISOString().slice(0, 10);
}

function articleText(item) {
  return `${item.title || ""} ${item.summary || ""} ${item.excerpt || ""}`;
}

function isDuplicate(a, b) {
  if (a.url && b.url && a.url === b.url) return true;

  // Confrontiamo principalmente notizie pubblicate nello stesso giorno.
  if (!sameCalendarDay(a.publishedAt, b.publishedAt)) return false;

  const titleScore = similarity(a.title, b.title);
  const bodyScore = similarity(articleText(a), articleText(b));

  // Soglie conservative: meglio tenere due notizie distinte che unirle per errore.
  if (titleScore >= 0.62) return true;
  if (titleScore >= 0.42 && bodyScore >= 0.38) return true;
  if (bodyScore >= 0.68) return true;

  return false;
}

const SOURCE_PRIORITY = {
  "lega-serie-a": 10,
  "gazzetta": 9,
  "di-marzio": 8,
  "tuttomercatoweb": 7,
  "pianeta-serie-b": 7,
  "fantacalcio": 6,
  "onefootball": 5
};

function quality(item) {
  return (SOURCE_PRIORITY[item.sourceId] || 1) * 1000
    + Math.min((item.excerpt || "").length, 700)
    + (item.author ? 30 : 0)
    + (item.image ? 10 : 0);
}

export function deduplicateNews(input, previous = []) {
  const all = [...input].sort((a, b) => quality(b) - quality(a));
  const groups = [];

  for (const item of all) {
    let group = groups.find(g => g.items.some(existing => isDuplicate(existing, item)));
    if (!group) {
      group = { items: [], main: null };
      groups.push(group);
    }
    group.items.push(item);
    if (!group.main || quality(item) > quality(group.main)) group.main = item;
  }

  const output = groups.map(group => {
    const sources = [...new Map(group.items.map(item => [
      item.sourceId,
      { id: item.sourceId, name: item.source, url: item.url }
    ])).values()];

    return {
      ...group.main,
      idNotizia: group.main.idNotizia,
      fonti: sources,
      numeroFonti: sources.length,
      duplicato: false
    };
  });

  // Contrassegna come già viste le notizie già presenti nelle raccolte precedenti.
  const previousIndex = previous.filter(x => x && x.idNotizia);
  const fresh = [];
  for (const item of output) {
    const old = previousIndex.find(p =>
      p.idNotizia === item.idNotizia ||
      (p.publishedAt && isDuplicate(p, item))
    );
    if (!old) fresh.push(item);
  }

  return { news: output, fresh, groupsMerged: input.length - output.length };
}

export function stableNewsId(item) {
  const basis = normalizeTitle(item.title || item.url || "");
  let hash = 2166136261;
  for (const char of basis) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fn-${(hash >>> 0).toString(16)}`;
}

export function makeHistoryRecord(item) {
  return {
    idNotizia: item.idNotizia || stableNewsId(item),
    title: cleanText(item.title || ""),
    summary: cleanText(item.summary || ""),
    excerpt: cleanText(item.excerpt || ""),
    publishedAt: item.publishedAt || null,
    url: item.url || null,
    sourceId: item.sourceId || null
  };
  }
