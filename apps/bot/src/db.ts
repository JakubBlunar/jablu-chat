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
        PRIMARY KEY (deal_id, channel_id)
      )
    `)

    const cols = _db.prepare("PRAGMA table_info('posted_deals')").all() as { name: string }[]
    if (!cols.some((c) => c.name === 'channel_id')) {
      _db.exec("ALTER TABLE posted_deals ADD COLUMN channel_id TEXT NOT NULL DEFAULT 'legacy'")
    }
  }
  return _db
}

export function wasPosted(dealId: string, channelId: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM posted_deals WHERE deal_id = ? AND channel_id = ?').get(dealId, channelId)
  return !!row
}

export function markPosted(dealId: string, channelId: string): void {
  getDb().prepare('INSERT OR IGNORE INTO posted_deals (deal_id, channel_id) VALUES (?, ?)').run(dealId, channelId)
}

export function cleanOldEntries(daysToKeep = 90): void {
  getDb().prepare("DELETE FROM posted_deals WHERE posted_at < datetime('now', ?)").run(`-${daysToKeep} days`)
}
