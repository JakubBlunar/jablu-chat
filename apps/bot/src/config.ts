import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

export const config = {
  botToken: env('BOT_TOKEN'),
  serverUrl: env('SERVER_URL', 'http://localhost:3001'),

  pollCron: env('POLL_CRON', '0 * * * *'),

  get dbPath(): string {
    const p = env('DB_PATH', './data/bot.db')
    const dir = dirname(p)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return p
  }
} as const
