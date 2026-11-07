import { collectNews } from "../lib/collector.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");

    return res.status(405).json({
      success: false,
      error: "Metodo non consentito."
    });
  }

  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization || "";

  // Il cron deve essere protetto da una chiave configurata.
  if (!secret) {
    return res.status(503).json({
      success: false,
      error: "CRON_SECRET non configurato su Vercel."
    });
  }

  if (authorization !== `Bearer ${secret}`) {
    return res.status(401).json({
      success: false,
      error: "Non autorizzato."
    });
  }

  try {
    const data = await collectNews();

    const news = Array.isArray(data.news)
      ? data.news
      : [];

    const fresh = Array.isArray(data.fresh)
      ? data.fresh
      : [];

    const fonti =
      data.fonti ||
      data.sources ||
      data.sourceStats ||
      [];

    return res.status(200).json({
      success: data.success !== false,

      message: "Raccolta completata.",

      version: data.version || "3.2.0",

      generatedAt: data.generatedAt || new Date().toISOString(),

      totalNotizieUniche:
        data.totalNotizieUniche ??
        news.length,

      nuoveNotizie: fresh.length,

      doppioniRaggruppati:
        data.doppioniRaggruppati ??
        data.groupsMerged ??
        0,

      memoriaPersistenteAttiva:
        data.memoriaPersistenteAttiva ??
        data.persistentStorageEnabled ??
        false,

      statistiche: data.stats || null,

      fonti,

      errori: data.errors || []
    });

  } catch (error) {
    console.error("[CRON] Errore raccolta:", error);

    return res.status(500).json({
      success: false,
      error: String(error.message || error),
      generatedAt: new Date().toISOString()
    });
  }
}
