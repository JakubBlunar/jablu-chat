import Database from 'better-sqlite3'
import { config } from './config.js'

let _db: Database.Database | null = null

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(config.dbPath)
    _db.pragma('journal_mode = WAL')
    _db.exec(`
      CREATE TABLE IF NOT EXISTS posted_deals (
        deal_id   TEXT    NOT NULL,
        webhook   TEXT    NOT NULL,
        posted_at TEXT    NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (deal_id, webhook)
      )
    `)
  }
  return _db
}

export function wasPosted(dealId: string, webhookUrl: string): boolean {
  const row = getDb().prepare('SELECT 1 FROM posted_deals WHERE deal_id = ? AND webhook = ?').get(dealId, webhookUrl)
  return !!row
}

export function markPosted(dealId: string, webhookUrl: string): void {
  getDb().prepare('INSERT OR IGNORE INTO posted_deals (deal_id, webhook) VALUES (?, ?)').run(dealId, webhookUrl)
}

export function cleanOldEntries(daysToKeep = 90): void {
  getDb().prepare("DELETE FROM posted_deals WHERE posted_at < datetime('now', ?)").run(`-${daysToKeep} days`)
}
