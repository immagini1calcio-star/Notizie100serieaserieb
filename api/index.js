import { collectNews } from "../lib/collector.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Metodo non consentito. Usa GET."
    });
  }

  const secret = process.env.API_SECRET;

  if (secret) {
    const authorization = req.headers.authorization || "";

    if (authorization !== `Bearer ${secret}`) {
      return res.status(401).json({
        success: false,
        error: "Non autorizzato"
      });
    }
  }

  try {
    const data = await collectNews();

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: String(error.message || error)
    });
  }
}
