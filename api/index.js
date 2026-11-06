import { collectNews } from "../lib/collector.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Metodo non consentito. Usa GET."
    });
  }

  try {
    const data = await collectNews();
    return res.status(200).json(data);
  } catch (error) {
    console.error("Errore raccolta notizie:", error);

    return res.status(500).json({
      success: false,
      error: String(error.message || error)
    });
  }
}
