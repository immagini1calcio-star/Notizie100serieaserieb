
import { collectNews } from "../lib/collector.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Metodo non consentito"
    });
  }

  if (
    process.env.API_SECRET &&
    req.headers.authorization !==
      `Bearer ${process.env.API_SECRET}`
  ) {
    return res.status(401).json({
      success: false,
      error: "Non autorizzato"
    });
  }

  try {
    const result = await collectNews();

    return res.status(200).json(result);

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
