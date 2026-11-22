import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { makeMessage } from '@/test/factories'
import { initCacheDb, resetDbForTests } from './db'
import { cacheRemoveMessage, cacheUpdateMessage } from './contextMutations'
import { clearCache, evictContext, peekContext, putContext } from './messageCache'
import { hydrateContextFromDisk, isHydrating } from './hydrate'
import { startMessageMirror, pendingDiskWrite } from './messageDiskMirror'

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  resetDbForTests()
  clearCache(false)
  await initCacheDb('reader')
})

it('retains disk-only pages, patches them in event order, and honors the separate disk cap', async () => {
  const mirror = startMessageMirror(() => {}, isHydrating)
  const base = Date.now() - 1000
  const row = makeMessage({ id: 'keep', channelId: '0' })
  function put(i: number) {
    putContext('ch:' + i, {
      updatedAt: base + i,
      messages: [row, makeMessage({ id: 'remove' })],
      hasNewer: false,
      hasMore: false
    })
  }
  try {
    for (let i = 0; i < 31; i++) put(i)
    expect(peekContext('ch:0')).toBeNull()
    cacheUpdateMessage({ ...row, content: 'edited on another device' })
    cacheRemoveMessage('ch:0', 'remove')
    expect(await hydrateContextFromDisk('ch:0')).toBe(true)
    expect(peekContext('ch:0')?.messages).toEqual([{ ...row, content: 'edited on another device' }])
    for (let i = 31; i <= 100; i++) put(i)
    await Promise.all(Array.from({ length: 101 }, (_, i) => pendingDiskWrite('ch:' + i)))
    clearCache(false)
    expect(await hydrateContextFromDisk('ch:1')).toBe(false)
    expect(await hydrateContextFromDisk('ch:0')).toBe(true)
    expect(await hydrateContextFromDisk('ch:100')).toBe(true)
    evictContext('ch:2')
    expect(await hydrateContextFromDisk('ch:2')).toBe(false)
  } finally {
    mirror.stop()
  }
})
