
export const SOURCES = [
  {
    name: "La Gazzetta dello Sport",
    url: "https://www.gazzetta.it/dynamic-feed/rss/section/Calcio.xml"
  },
  {
    name: "Pianeta Serie B",
    url: process.env.FEED_PIANETA_SERIE_B || ""
  },
  {
    name: "Lega Serie A",
    url: process.env.FEED_LEGA_SERIE_A || ""
  },
  {
    name: "Fantacalcio",
    url: process.env.FEED_FANTACALCIO || ""
  },
  {
    name: "Fabrizio Romano",
    url: process.env.FEED_FABRIZIO_ROMANO || ""
  },
  {
    name: "Gianluca Di Marzio",
    url: process.env.FEED_GIANLUCA_DI_MARZIO || ""
  },
  {
    name: "OneFootball",
    url: process.env.FEED_ONEFOOTBALL || ""
  }
];
