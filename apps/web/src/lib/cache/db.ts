/**
 * Disk half of the client cache.
 *
 * Everything here is best-effort: a failure to open, read or write must never
 * surface to the user, because the network path still works. Callers get
 * `null` and fall back to fetching.
 */

const DB_NAME = 'jablu-cache'
const DB_VERSION = 2
const BY_UPDATED_AT = 'byUpdatedAt'

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
      for (const name of [STORE_MESSAGES, STORE_STRUCTURE]) {
        const store = db.objectStoreNames.contains(name)
          ? req.transaction!.objectStore(name)
          : db.createObjectStore(name, { keyPath: 'key' })
        if (!store.indexNames.contains(BY_UPDATED_AT)) store.createIndex(BY_UPDATED_AT, 'updatedAt')
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

type Owner = { key: 'owner'; userId: string; schema: string; token: string }
type Binding = Promise<Owner | null>
let binding: Binding | null = null
let retired: Binding | null = null

export function cacheSession() {
  return binding
}

export function retireCacheSession() {
  if (binding) retired = binding
  binding = null
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(tx.error)
  })
}

async function runStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
  session = binding
): Promise<T | null> {
  const owner = await session
  const db = await openDb()
  if (!db || !owner || binding !== session) return null
  // Validate inside the data transaction so an account switch in another tab
  // cannot land between the ownership check and the operation.
  const tx = db.transaction([...new Set([STORE_META, storeName])], mode)
  const current: Owner | undefined = await request(tx.objectStore(STORE_META).get('owner'))
  if (current?.token !== owner.token || binding !== session) return null
  const result = await fn(tx.objectStore(storeName))
  if (mode === 'readwrite') await transactionDone(tx)
  return binding === session ? result : null
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

export async function cacheOwnedBy(userId: string | null): Promise<boolean> {
  if (!userId) return false
  const owner = await withStore(STORE_META, 'readonly', (store) => request<Owner | undefined>(store.get('owner')))
  return owner?.userId === userId
}

const allStores = [STORE_META, STORE_MESSAGES, STORE_STRUCTURE]

export async function initCacheDb(userId: string | null): Promise<void> {
  retireCacheSession()
  if (!userId) return
  const session = bind().catch(() => null)
  binding = session
  async function bind(): Promise<Owner | null> {
    const db = await openDb()
    if (!db || session !== binding) return null
    const tx = db.transaction(allStores, 'readwrite')
    const meta = tx.objectStore(STORE_META)
    const previous: Owner | undefined = await request(meta.get('owner'))
    if (session !== binding) return null
    const matches = previous?.userId === userId && previous.schema === SCHEMA_VERSION
    if (!matches) {
      tx.objectStore(STORE_MESSAGES).clear()
      tx.objectStore(STORE_STRUCTURE).clear()
    }
    const owner: Owner = {
      key: 'owner',
      userId: userId!,
      schema: SCHEMA_VERSION,
      token: (matches && previous.token) || crypto.randomUUID()
    }
    meta.put(owner)
    const cutoff = IDBKeyRange.upperBound(Date.now() - TTL_MS)
    await Promise.all(
      [STORE_MESSAGES, STORE_STRUCTURE].map(async (name) => {
        const store = tx.objectStore(name)
        const keys = await request(store.index(BY_UPDATED_AT).getAllKeys(cutoff))
        for (const key of keys) store.delete(key)
      })
    )
    await transactionDone(tx)
    return owner
  }
  await session
}

export async function clearCacheDb(): Promise<void> {
  const session = binding ?? retired
  const owner = await session
  const db = await openDb()
  if (!owner || !db || (binding && binding !== session)) return
  try {
    const tx = db.transaction(allStores, 'readwrite')
    const current: Owner | undefined = await request(tx.objectStore(STORE_META).get('owner'))
    if (current?.token !== owner.token || (binding && binding !== session)) return
    for (const name of allStores) tx.objectStore(name).clear()
    await transactionDone(tx)
  } catch {
    /* Disk storage is best effort. */
  }
}

async function deleteOldest(store: IDBObjectStore, count: number): Promise<void> {
  if (count <= 0) return
  const keys = await request(store.index(BY_UPDATED_AT).getAllKeys(undefined, count))
  for (const key of keys) store.delete(key)
}

/** Drop the oldest half of cached messages, used when the quota is hit. */
async function evictOldestMessages(): Promise<void> {
  await withStore(STORE_MESSAGES, 'readwrite', async (store) => {
    const count = await request(store.count())
    await deleteOldest(store, Math.max(1, Math.floor(count / 2)))
  })
}

async function enforceMessageCap(): Promise<void> {
  await withStore(STORE_MESSAGES, 'readwrite', async (store) => {
    const count = await request(store.count())
    await deleteOldest(store, count - MAX_MESSAGE_RECORDS)
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
  const session = binding
  const put = () =>
    runStore(
      STORE_MESSAGES,
      'readwrite',
      (store) => {
        store.put(record)
      },
      session
    )

  try {
    await put()
  } catch (err) {
    if (binding !== session || !isQuotaError(err)) return
    await evictOldestMessages()
    try {
      await put()
    } catch {
      // Still no room; the memory cache carries on without disk backing.
      return
    }
  }
  if (binding === session) await enforceMessageCap()
}

export async function mutateMessages(key: string, mutate: (record: StoredMessages) => StoredMessages | null) {
  await withStore(STORE_MESSAGES, 'readwrite', async (store) => {
    const record: StoredMessages | undefined = await request(store.get(key))
    if (!record || !fresh(record.updatedAt)) return
    const next = mutate(record)
    if (next) store.put(next)
  })
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
  const session = binding
  try {
    await runStore(STORE_STRUCTURE, 'readwrite', (store) => {
      store.put({ key, value, updatedAt })
    })
  } catch (err) {
    // Messages are the bulk of the cache, so they are what gets sacrificed to
    // make room for the far smaller structure records.
    if (binding === session && isQuotaError(err)) await evictOldestMessages()
  }
}

export async function deleteStructure(key: string): Promise<void> {
  await withStore(STORE_STRUCTURE, 'readwrite', (store) => {
    store.delete(key)
  })
}

/** Test hook: forces the next call to reopen the database. */
export function resetDbForTests(): void {
  binding = retired = null
  dbPromise = null
}
