import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import {
  cacheOwnedBy,
  clearCacheDb,
  deleteMessages,
  deleteStructure,
  initCacheDb,
  readMessages,
  readStructure,
  resetDbForTests,
  writeMessages,
  writeStructure
} from './db'

const DAY_MS = 24 * 60 * 60 * 1000

function record(key: string, updatedAt = Date.now()) {
  return {
    key,
    messages: [{ id: `${key}-1`, content: 'hello' }],
    hasMore: false,
    hasNewer: false,
    updatedAt
  }
}

beforeEach(() => {
  // A fresh factory is the only reliable way to drop a fake-indexeddb schema.
  globalThis.indexedDB = new IDBFactory()
  resetDbForTests()
})

describe('cache database', () => {
  it('round-trips a message record', async () => {
    await initCacheDb('user-1')
    await writeMessages(record('ch:a'))

    const read = await readMessages('ch:a')
    expect(read?.messages).toHaveLength(1)
    expect(read?.hasMore).toBe(false)
  })

  it('returns null for a key that was never written', async () => {
    await initCacheDb('user-1')
    expect(await readMessages('ch:missing')).toBeNull()
  })

  it('round-trips a structure record', async () => {
    await initCacheDb('user-1')
    await writeStructure('channels:srv-a', { channels: [{ id: 'ch-a' }], categories: [] })

    const read = await readStructure<{ channels: Array<{ id: string }> }>('channels:srv-a')
    expect(read?.channels[0].id).toBe('ch-a')
  })

  it('ignores an entry past the TTL', async () => {
    await initCacheDb('user-1')
    await writeMessages(record('ch:old', Date.now() - 8 * DAY_MS))
    await writeStructure('servers', [{ id: 'srv-a' }], Date.now() - 8 * DAY_MS)

    expect(await readMessages('ch:old')).toBeNull()
    expect(await readStructure('servers')).toBeNull()
  })

  it('keeps an entry just inside the TTL', async () => {
    await initCacheDb('user-1')
    await writeMessages(record('ch:recent', Date.now() - 6 * DAY_MS))

    expect(await readMessages('ch:recent')).not.toBeNull()
  })

  it('prunes expired entries when it is opened', async () => {
    await initCacheDb('user-1')
    await writeMessages(record('ch:old', Date.now() - 8 * DAY_MS))
    await writeMessages(record('ch:new'))

    resetDbForTests()
    await initCacheDb('user-1')

    expect(await readMessages('ch:old')).toBeNull()
    expect(await readMessages('ch:new')).not.toBeNull()
  })

  it('wipes everything when a different user signs in', async () => {
    await initCacheDb('user-1')
    await writeMessages(record('ch:a'))

    resetDbForTests()
    await initCacheDb('user-2')

    expect(await readMessages('ch:a')).toBeNull()
  })

  it('keeps entries when the same user opens it again', async () => {
    await initCacheDb('user-1')
    await writeMessages(record('ch:a'))

    resetDbForTests()
    await initCacheDb('user-1')

    expect(await readMessages('ch:a')).not.toBeNull()
  })

  it('deletes on request', async () => {
    await initCacheDb('user-1')
    await writeMessages(record('ch:a'))
    await writeStructure('servers', [])

    await deleteMessages('ch:a')
    await deleteStructure('servers')

    expect(await readMessages('ch:a')).toBeNull()
    expect(await readStructure('servers')).toBeNull()
  })

  it('clearCacheDb empties both stores', async () => {
    await initCacheDb('user-1')
    await writeMessages(record('ch:a'))
    await writeStructure('servers', [{ id: 'srv-a' }])

    await clearCacheDb()

    expect(await readMessages('ch:a')).toBeNull()
    expect(await readStructure('servers')).toBeNull()
  })

  it('caps the number of message records, dropping the oldest', async () => {
    await initCacheDb('user-1')
    const base = Date.now() - 60_000
    for (let i = 0; i < 110; i++) {
      await writeMessages(record(`ch:${i}`, base + i))
    }

    expect(await readMessages('ch:0')).toBeNull()
    expect(await readMessages('ch:5')).toBeNull()
    expect(await readMessages('ch:109')).not.toBeNull()
  })

  it('drops the oldest half and retries when the quota is exceeded', async () => {
    await initCacheDb('user-1')
    const base = Date.now() - 60_000
    for (let i = 0; i < 10; i++) await writeMessages(record(`ch:${i}`, base + i))

    const realPut = IDBObjectStore.prototype.put
    let failed = false
    jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (!failed) {
        failed = true
        throw new DOMException('quota', 'QuotaExceededError')
      }
      return realPut.apply(this, args as Parameters<typeof realPut>)
    })

    await writeMessages(record('ch:new'))
    jest.restoreAllMocks()

    expect(await readMessages('ch:new')).not.toBeNull()
    expect(await readMessages('ch:0')).toBeNull()
    expect(await readMessages('ch:9')).not.toBeNull()
  })

  it('degrades to no-ops when IndexedDB is unavailable', async () => {
    const original = globalThis.indexedDB
    // @ts-expect-error deliberately removing the API to model a hostile runtime
    delete globalThis.indexedDB
    resetDbForTests()

    await expect(initCacheDb('user-1')).resolves.toBeUndefined()
    await expect(writeMessages(record('ch:a'))).resolves.toBeUndefined()
    await expect(readMessages('ch:a')).resolves.toBeNull()

    globalThis.indexedDB = original
  })
})

it('confirms the owner before restoring a signed-in offline route',async()=>{
  expect(await cacheOwnedBy('new')).toBe(false)
  await initCacheDb('first')
  expect(await cacheOwnedBy('first')).toBe(true)
  expect(await cacheOwnedBy('second')).toBe(false)
  await initCacheDb('second')
  expect(await cacheOwnedBy('first')).toBe(false)
})

it('upgrades a populated version-one cache and prunes by timestamp without loading message bodies', async () => {
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('jablu-cache', 1)
    open.onerror = () => reject(open.error)
    open.onupgradeneeded = () => {
      const db = open.result
      const messages = db.createObjectStore('messages', { keyPath: 'key' })
      messages.put(record('ch:recent'))
      messages.put(record('ch:expired', Date.now() - 8 * DAY_MS))
      db.createObjectStore('structure', { keyPath: 'key' }).put({ key: 'servers', value: ['s'], updatedAt: Date.now() })
      db.createObjectStore('meta', { keyPath: 'key' }).put({ key: 'owner', userId: 'reader', schema: '1' })
    }
    open.onsuccess = () => { open.result.close(); resolve() }
  })
  const fullReads = jest.spyOn(IDBObjectStore.prototype, 'getAll')
  try {
    await initCacheDb('reader')
    expect(await readMessages('ch:expired')).toBeNull()
    expect((await readMessages('ch:recent'))?.messages).toHaveLength(1)
    expect(await readStructure('servers')).toEqual(['s'])
    expect(fullReads).not.toHaveBeenCalled()
  } finally {
    fullReads.mockRestore()
  }
})
