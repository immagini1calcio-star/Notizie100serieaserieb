
export async function sendToAppsScript(news) {
  const webhook = process.env.APPS_SCRIPT_WEBHOOK;

  if (!webhook) {
    return {
      sent: false,
      reason: "APPS_SCRIPT_WEBHOOK non configurato"
    };
  }

  const response = await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.APPS_SCRIPT_TOKEN
        ? { "X-API-KEY": process.env.APPS_SCRIPT_TOKEN }
        : {})
    },
    body: JSON.stringify(news),
    signal: AbortSignal.timeout(30000)
  });

  const result = await response.text();

  if (!response.ok) {
    throw new Error(
      `Apps Script HTTP ${response.status}: ${result}`
    );
  }

  return {
    sent: true,
    response: result
  };
}
