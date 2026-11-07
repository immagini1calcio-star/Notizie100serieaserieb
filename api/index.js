import { collectNews } from "../lib/collector.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      success: false,
      error: "Metodo non consentito. Usa GET."
    });
  }

  try {
    const data = await collectNews();

    return res.status(200).json({
      ...data,
      api: {
        name: "Football News Collector",
        version: "3.2.0",
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error(
      "[API] Errore raccolta notizie:",
      error
    );

    return res.status(500).json({
      success: false,
      error: String(error.message || error),
      api: {
        name: "Football News Collector",
        version: "3.2.0",
        generatedAt: new Date().toISOString()
      }
    });
  }
}
