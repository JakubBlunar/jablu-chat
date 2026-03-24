import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  webhookUrls: env("WEBHOOK_URLS")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean),

  botName: env("BOT_NAME", "FreeGameBot"),
  botAvatarUrl: process.env["BOT_AVATAR_URL"]?.trim() || undefined,

  pollCron: env("POLL_CRON", "*/30 * * * *"),

  get dbPath(): string {
    const p = env("DB_PATH", "./data/bot.db");
    const dir = dirname(p);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return p;
  },
} as const;
