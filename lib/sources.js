const env = (name) => (process.env[name] || "").trim();

export const SOURCES = [
  {
    name: "La Gazzetta dello Sport",
    feed: env("FEED_GAZZETTA") ||
      "https://www.gazzetta.it/dynamic-feed/rss/section/Calcio.xml",
    domains: ["https://www.gazzetta.it/Calcio/"]
  },
  {
    name: "Pianeta Serie B",
    feed: env("FEED_PIANETA_SERIE_B"),
    domains: ["https://www.pianetaserieb.it/news"]
  },
  {
    name: "Lega Serie A",
    feed: env("FEED_LEGA_SERIE_A"),
    domains: ["https://www.legaseriea.it/serie-a/news"]
  },
  {
    name: "Fantacalcio",
    feed: env("FEED_FANTACALCIO"),
    domains: ["https://www.fantacalcio.it/ultime-notizie"]
  },
  {
    name: "Tuttomercatoweb",
    feed: env("FEED_TUTTOMERCATOWEB"),
    domains: ["https://m.tuttomercatoweb.com/"]
  },
  {
    name: "Gianluca Di Marzio",
    feed: env("FEED_GIANLUCA_DI_MARZIO"),
    domains: ["https://m.gianlucadimarzio.com/"]
  },
  {
    name: "OneFootball",
    feed: env("FEED_ONEFOOTBALL"),
    domains: ["https://onefootball.com/it/home"]
  }
];
