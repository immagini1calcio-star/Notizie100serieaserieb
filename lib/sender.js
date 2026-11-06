export async function sendToGoogleSheets(data) {
  const webhook = process.env.APPS_SCRIPT_WEBHOOK;
  const token = process.env.APPS_SCRIPT_TOKEN;

  if (!webhook) {
    throw new Error("Variabile APPS_SCRIPT_WEBHOOK non configurata");
  }

  const response = await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-API-KEY": token } : {})
    },
    body: JSON.stringify(data)
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Errore Google Apps Script: ${response.status} ${responseText}`
    );
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return { response: responseText };
  }
}
