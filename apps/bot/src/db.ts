import Database from 'better-sqlite3'
import { config } from './config.js'

let _db: Database.Database | null = null

function getDb(): Database.Database {
  if (!_db) {
    const dbPath = config.dbPath
    console.log(`[db] Opening database at: ${dbPath}`)
    _db = new Database(dbPath)
    _db.pragma('journal_mode = WAL')

    _db.exec(`
      CREATE TABLE IF NOT EXISTS bot_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    migratePostedDeals(_db)
  }
  return _db
}

function migratePostedDeals(db: Database.Database): void {
  const tableExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='posted_deals'").get()

  if (!tableExists) {
    db.exec(`
      CREATE TABLE posted_deals (
        deal_id    TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        posted_at  TEXT NOT NULL DEFAULT (datetime('now')),
        title_key  TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (deal_id, channel_id)
      )
    `)
    console.log('[db] Created posted_deals table')
    return
  }

  const pkCols = (db.prepare("PRAGMA table_info('posted_deals')").all() as { name: string; pk: number }[])
    .filter((c) => c.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((c) => c.name)

  const needsRecreate = pkCols.length !== 2 || pkCols[0] !== 'deal_id' || pkCols[1] !== 'channel_id'

  if (needsRecreate) {
    console.log(`[db] Stale PK detected (${pkCols.join(', ')}), recreating posted_deals table`)
    db.exec('DROP TABLE posted_deals')
    db.exec(`
      CREATE TABLE posted_deals (
        deal_id    TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        posted_at  TEXT NOT NULL DEFAULT (datetime('now')),
        title_key  TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (deal_id, channel_id)
      )
    `)
    return
  }

  const cols = db.prepare("PRAGMA table_info('posted_deals')").all() as { name: string }[]
  if (!cols.some((c) => c.name === 'title_key')) {
    db.exec("ALTER TABLE posted_deals ADD COLUMN title_key TEXT NOT NULL DEFAULT ''")
  }
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

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}
