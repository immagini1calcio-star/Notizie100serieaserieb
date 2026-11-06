
import { collectNews } from "../lib/collector.js";
import { sendToAppsScript } from "../lib/sender.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Utilizzare POST"
    });
  }

  const secret = process.env.CRON_SECRET;

  if (
    !secret ||
    req.headers.authorization !== `Bearer ${secret}`
  ) {
    return res.status(401).json({
      success: false,
      error: "Autorizzazione non valida"
    });
  }

  try {
    const result = await collectNews();

    const delivery = await sendToAppsScript(result.news);

    return res.status(200).json({
      success: true,
      raccolte: result.total,
      invio: delivery,
      fonti: result.sources,
      generatedAt: result.generatedAt
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
