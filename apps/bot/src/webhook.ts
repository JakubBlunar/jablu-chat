import { config } from "./config.js";

export async function postToWebhook(
  webhookUrl: string,
  content: string,
): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        username: config.botName,
        avatarUrl: config.botAvatarUrl,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[webhook] POST failed ${res.status}: ${text.slice(0, 200)}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[webhook] Network error:", err);
    return false;
  }
}
