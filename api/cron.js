import { collectNews } from "../lib/collector.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Metodo non consentito."
    });
  }

  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization || "";

  if (secret && authorization !== `Bearer ${secret}`) {
    return res.status(401).json({
      success: false,
      error: "Non autorizzato."
    });
  }

  try {
    const data = await collectNews();

    return res.status(200).json({
      success: true,
      message: "Raccolta completata.",
      totalNotizieUniche: data.totalNotizieUniche,
      doppioniRaggruppati: data.doppioniRaggruppati,
      memoriaPersistenteAttiva: data.memoriaPersistenteAttiva,
      generatedAt: data.generatedAt,
      fonti: data.fonti
    });
  } catch (error) {
    console.error("Errore cron:", error);

    return res.status(500).json({
      success: false,
      error: String(error.message || error)
    });
  }
}
