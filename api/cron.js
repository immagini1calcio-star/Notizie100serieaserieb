import { collectNews } from "../lib/collector.js";
import { sendToGoogleSheets } from "../lib/sender.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Metodo non consentito. Usa POST."
    });
  }

  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization || "";

  if (!secret || authorization !== `Bearer ${secret}`) {
    return res.status(401).json({
      success: false,
      error: "Non autorizzato"
    });
  }

  try {
    const data = await collectNews();
    const sheetsResult = await sendToGoogleSheets(data);

    return res.status(200).json({
      success: true,
      raccolte: data.total,
      invio_google_sheets: sheetsResult,
      fonti: data.sources
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: String(error.message || error)
    });
  }
}
