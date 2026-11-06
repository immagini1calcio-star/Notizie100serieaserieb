# Football News Collector 3.0

Raccoglitore di notizie calcistiche da sette fonti.
Legge feed pubblici individuati automaticamente, sitemap e link delle pagine pubbliche.
Deduplica le notizie per URL, titolo e similarità testuale.

## Fonti configurate

- La Gazzetta dello Sport
- Pianeta Serie B
- Lega Serie A
- Gianluca Di Marzio
- Tuttomercatoweb
- Fantacalcio
- OneFootball

## Endpoint

- `GET /api` — esegue una raccolta e restituisce JSON.
- `GET /api/cron` — esegue una raccolta automatica/manuale; se `CRON_SECRET` è configurato richiede `Authorization: Bearer <CRON_SECRET>`.

## Variabili Vercel

Obbligatorie: nessuna.

Facoltative:

- `HOURS_BACK=36` — finestra temporale degli articoli.
- `MAX_ARTICLES_PER_SOURCE=8` — massimo articoli analizzati per fonte (massimo consentito 15).
- `CRON_SECRET` — protegge l'endpoint `/api/cron`.
- `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` — attivano la memoria persistente dei doppioni tra esecuzioni.

Senza Upstash, la deduplicazione funziona nella singola raccolta ma non può ricordare con certezza gli articoli delle esecuzioni precedenti.

## Limiti

I siti possono modificare HTML, bloccare richieste automatizzate o non esporre tutti gli articoli nelle pagine pubbliche. In questi casi la fonte può restituire zero articoli o uno stato parziale. Il codice non aggira paywall, login o sistemi anti-bot.

Il sistema non archivia integralmente articoli protetti da copyright: restituisce titolo, data, autore quando disponibile, link, estratto/descrizione e un breve testo descrittivo ricavato dai contenuti pubblicamente accessibili.

## Test

Apri `https://TUO-DOMINIO.vercel.app/api`.

Nel JSON controlla:

- `fonti`
- `totalRaccolte`
- `totalNotizieUniche`
- `doppioniRaggruppati`
