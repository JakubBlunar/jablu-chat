import Database from 'better-sqlite3'
import { config } from './config.js'

let _db: Database.Database | null = null

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(config.dbPath)
    _db.pragma('journal_mode = WAL')

    _db.exec(`
      CREATE TABLE IF NOT EXISTS posted_deals (
        deal_id    TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        posted_at  TEXT NOT NULL DEFAULT (datetime('now')),
        title_key  TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (deal_id, channel_id)
      )
    `)

    _db.exec(`
      CREATE TABLE IF NOT EXISTS bot_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    const cols = _db.prepare("PRAGMA table_info('posted_deals')").all() as { name: string }[]
    if (!cols.some((c) => c.name === 'channel_id')) {
      _db.exec("ALTER TABLE posted_deals ADD COLUMN channel_id TEXT NOT NULL DEFAULT 'legacy'")
    }
    if (!cols.some((c) => c.name === 'title_key')) {
      _db.exec("ALTER TABLE posted_deals ADD COLUMN title_key TEXT NOT NULL DEFAULT ''")
    }
  }
  return _db
}

export function titleKey(title: string, source: string): string {
  return source.toLowerCase() + ':' + title.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function wasPosted(dealId: string, channelId: string, tKey?: string): boolean {
  if (tKey) {
    const row = getDb()
      .prepare('SELECT 1 FROM posted_deals WHERE channel_id = ? AND (deal_id = ? OR title_key = ?)')
      .get(channelId, dealId, tKey)
    return !!row
  }
  return !!getDb().prepare('SELECT 1 FROM posted_deals WHERE deal_id = ? AND channel_id = ?').get(dealId, channelId)
}

export function markPosted(dealId: string, channelId: string, tKey: string): void {
  getDb()
    .prepare('INSERT OR IGNORE INTO posted_deals (deal_id, channel_id, title_key) VALUES (?, ?, ?)')
    .run(dealId, channelId, tKey)
}

export function cleanOldEntries(daysToKeep = 90): void {
  getDb().prepare("DELETE FROM posted_deals WHERE posted_at < datetime('now', ?)").run(`-${daysToKeep} days`)
}

export function getLastPollAt(): Date | null {
  const row = getDb().prepare("SELECT value FROM bot_meta WHERE key = 'last_poll_at'").get() as { value: string } | undefined
  return row ? new Date(row.value) : null
}

export function setLastPollAt(): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO bot_meta (key, value) VALUES ('last_poll_at', ?)")
    .run(new Date().toISOString())
}
