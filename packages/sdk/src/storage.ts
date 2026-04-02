import Database from 'better-sqlite3'

export class BotStorage {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)')
      .run(key, JSON.stringify(value))
  }

  get<T = unknown>(key: string): T | null {
    const row = this.db
      .prepare('SELECT value FROM kv_store WHERE key = ?')
      .get(key) as { value: string } | undefined
    if (!row) return null
    return JSON.parse(row.value)
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM kv_store WHERE key = ?').run(key)
  }

  list(prefix: string): Array<{ key: string; value: unknown }> {
    const escaped = prefix.replace(/[%_]/g, '\\$&')
    const pattern = escaped.replace('*', '%')
    const rows = this.db
      .prepare("SELECT key, value FROM kv_store WHERE key LIKE ? ESCAPE '\\'")
      .all(pattern) as Array<{ key: string; value: string }>
    return rows.map((r) => ({ key: r.key, value: JSON.parse(r.value) }))
  }

  has(key: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM kv_store WHERE key = ?')
      .get(key)
    return !!row
  }

  close(): void {
    this.db.close()
  }
}
