export const SOURCES = [
  {
    id: "gazzetta",
    name: "La Gazzetta dello Sport",
    url: "https://www.gazzetta.it/Calcio/",
    domains: ["gazzetta.it"]
  },
  {
    id: "pianeta-serie-b",
    name: "Pianeta Serie B",
    url: "https://www.pianetaserieb.it/news",
    domains: ["pianetaserieb.it"]
  },
  {
    id: "lega-serie-a",
    name: "Lega Serie A",
    url: "https://www.legaseriea.it/serie-a/news",
    domains: ["legaseriea.it"]
  },
  {
    id: "di-marzio",
    name: "Gianluca Di Marzio",
    url: "https://m.gianlucadimarzio.com/",
    domains: ["gianlucadimarzio.com"]
  },
  {
    id: "tuttomercatoweb",
    name: "Tuttomercatoweb",
    url: "https://m.tuttomercatoweb.com/",
    domains: ["tuttomercatoweb.com"]
  },
  {
    id: "fantacalcio",
    name: "Fantacalcio",
    url: "https://www.fantacalcio.it/ultime-notizie",
    domains: ["fantacalcio.it"]
  },
  {
    id: "onefootball",
    name: "OneFootball",
    url: "https://onefootball.com/it/home",
    domains: ["onefootball.com"]
  }
];

export function sourceFromUrl(input) {
  try {
    const host = new URL(input).hostname.replace(/^www\./, "").replace(/^m\./, "");
    for (const source of SOURCES) {
      if (source.domains.some(domain => host === domain || host.endsWith(`.${domain}`))) {
        return { id: source.id, name: source.name, domain: host };
      }
    }
    return { id: host, name: host, domain: host };
  } catch {
    return { id: "unknown", name: "Fonte non identificata", domain: null };
  }
}
