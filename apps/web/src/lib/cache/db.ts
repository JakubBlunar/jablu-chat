/**
 * Disk half of the client cache.
 *
 * Everything here is best-effort: a failure to open, read or write must never
 * surface to the user, because the network path still works. Callers get
 * `null` and fall back to fetching.
 */

const DB_NAME = 'jablu-cache'
const DB_VERSION = 1

/**
 * Bump when the cached shape changes in a way older entries cannot satisfy,
 * for example when the message wire format gains a required field. Everything
 * on disk is dropped on a mismatch.
 */
const SCHEMA_VERSION = '1'

const STORE_MESSAGES = 'messages'
const STORE_STRUCTURE = 'structure'
const STORE_META = 'meta'

/** Entries older than this are ignored on read and pruned on open. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Disk holds more than memory so a relaunch can still hit for older channels. */
const MAX_MESSAGE_RECORDS = 100

export type StoredMessages = {
  key: string
  messages: unknown[]
  hasMore: boolean
  hasNewer: boolean
  updatedAt: number
}

export type StoredStructure = {
  key: string
  value: unknown
  updatedAt: number
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function openDb(): Promise<IDBDatabase | null> {
  if (!idbAvailable()) return Promise.resolve(null)
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        db.createObjectStore(STORE_MESSAGES, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(STORE_STRUCTURE)) {
        db.createObjectStore(STORE_STRUCTURE, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }

    req.onsuccess = () => {
      const db = req.result
      // Another tab upgrading the schema would block us indefinitely.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })

  return dbPromise
}

/** Runs a transaction and lets failures through, so callers can react to them. */
async function runStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T
): Promise<T | null> {
  const db = await openDb()
  if (!db) return null

  const tx = db.transaction(storeName, mode)
  const result = await fn(tx.objectStore(storeName))
  if (mode === 'readwrite') {
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }
  return result
}

/** The same, for the majority of callers for whom a failure is simply a miss. */
async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T
): Promise<T | null> {
  try {
    return await runStore(storeName, mode, fn)
  } catch {
    return null
  }
}

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)
}

function fresh(updatedAt: number): boolean {
  return Date.now() - updatedAt < TTL_MS
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Bind the cache to a user and schema. Anything belonging to a different user
 * or an older schema is dropped, so a cache can never leak across accounts.
 */
export async function initCacheDb(userId: string | null): Promise<void> {
  const db = await openDb()
  if (!db) return

  const meta = await withStore(STORE_META, 'readonly', (store) =>
    request(store.get('owner') as IDBRequest<{ key: string; userId: string | null; schema: string } | undefined>)
  )

  if (meta && meta.userId === userId && meta.schema === SCHEMA_VERSION) {
    await pruneExpired()
    return
  }

  await clearCacheDb()
  await withStore(STORE_META, 'readwrite', (store) => {
    store.put({ key: 'owner', userId, schema: SCHEMA_VERSION })
  })
}

export async function clearCacheDb(): Promise<void> {
  const db = await openDb()
  if (!db) return
  for (const name of [STORE_MESSAGES, STORE_STRUCTURE, STORE_META]) {
    await withStore(name, 'readwrite', (store) => {
      store.clear()
    })
  }
}

async function pruneExpired(): Promise<void> {
  const cutoff = Date.now() - TTL_MS
  for (const name of [STORE_MESSAGES, STORE_STRUCTURE]) {
    await withStore(name, 'readwrite', async (store) => {
      const all = await request(store.getAll() as IDBRequest<Array<{ key: string; updatedAt: number }>>)
      for (const record of all) {
        if (record.updatedAt < cutoff) store.delete(record.key)
      }
    })
  }
}

/** Drop the oldest half of cached messages, used when the quota is hit. */
async function evictOldestMessages(fraction = 0.5): Promise<void> {
  await withStore(STORE_MESSAGES, 'readwrite', async (store) => {
    const all = await request(store.getAll() as IDBRequest<StoredMessages[]>)
    const doomed = all
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, Math.max(1, Math.floor(all.length * fraction)))
    for (const record of doomed) store.delete(record.key)
  })
}

async function enforceMessageCap(): Promise<void> {
  await withStore(STORE_MESSAGES, 'readwrite', async (store) => {
    const count = await request(store.count())
    if (count <= MAX_MESSAGE_RECORDS) return
    const all = await request(store.getAll() as IDBRequest<StoredMessages[]>)
    const doomed = all
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, all.length - MAX_MESSAGE_RECORDS)
    for (const record of doomed) store.delete(record.key)
  })
}

// ── Messages ─────────────────────────────────────────────────────────────────

export async function readMessages(key: string): Promise<StoredMessages | null> {
  const record = await withStore(STORE_MESSAGES, 'readonly', (store) =>
    request(store.get(key) as IDBRequest<StoredMessages | undefined>)
  )
  if (!record || !fresh(record.updatedAt)) return null
  return record
}

export async function writeMessages(record: StoredMessages): Promise<void> {
  const put = () =>
    runStore(STORE_MESSAGES, 'readwrite', (store) => {
      store.put(record)
    })

  try {
    await put()
  } catch (err) {
    if (!isQuotaError(err)) return
    await evictOldestMessages()
    try {
      await put()
    } catch {
      // Still no room; the memory cache carries on without disk backing.
      return
    }
  }
  await enforceMessageCap()
}

export async function deleteMessages(key: string): Promise<void> {
  await withStore(STORE_MESSAGES, 'readwrite', (store) => {
    store.delete(key)
  })
}

// ── Structure ────────────────────────────────────────────────────────────────

export async function readStructure<T>(key: string): Promise<T | null> {
  const record = await withStore(STORE_STRUCTURE, 'readonly', (store) =>
    request(store.get(key) as IDBRequest<StoredStructure | undefined>)
  )
  if (!record || !fresh(record.updatedAt)) return null
  return record.value as T
}

export async function writeStructure(key: string, value: unknown, updatedAt = Date.now()): Promise<void> {
  try {
    await runStore(STORE_STRUCTURE, 'readwrite', (store) => {
      store.put({ key, value, updatedAt })
    })
  } catch (err) {
    // Messages are the bulk of the cache, so they are what gets sacrificed to
    // make room for the far smaller structure records.
    if (isQuotaError(err)) await evictOldestMessages()
  }
}

export async function deleteStructure(key: string): Promise<void> {
  await withStore(STORE_STRUCTURE, 'readwrite', (store) => {
    store.delete(key)
  })
}

/** Test hook: forces the next call to reopen the database. */
export function resetDbForTests(): void {
  dbPromise = null
}
