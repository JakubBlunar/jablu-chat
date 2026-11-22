import { makeMessage } from '@/test/factories'
import { cacheSession, readMessages, readStructure } from './db'
import { hydrateContextFromDisk, hydrateServerStructureFromDisk, hydrateServerListFromDisk } from './hydrate'
import { clearCache, peekContext, putContext } from './messageCache'
import { clearStructureCache, evictServer, getPermissions, getServerList, putServerList } from './structureCache'

jest.mock('./db', () => ({ cacheSession: jest.fn(), readMessages: jest.fn(), readStructure: jest.fn() }))

beforeEach(() => {
  clearCache(false)
  clearStructureCache(false)
})

it('keeps a fresh message page that arrives while the disk read is pending', async () => {
  const page = { messages: [makeMessage({ id: 'disk' })], hasMore: false, hasNewer: false }
  jest.mocked(readMessages).mockResolvedValue({ ...page, key: 'ch:a', updatedAt: 1 })
  const reading = hydrateContextFromDisk('ch:a')
  putContext('ch:a', { ...page, messages: [makeMessage({ id: 'live' })] })
  expect(await reading).toBe(true)
  expect(peekContext('ch:a')).toMatchObject({ messages: [{ id: 'live' }], stale: false })
})

it('keeps an authoritative empty server list when an older read completes', async () => {
  jest.mocked(readStructure).mockResolvedValue([{ id: 'old' }])
  const reading = hydrateServerListFromDisk()
  putServerList([])
  await reading
  expect(getServerList()?.servers).toEqual([])
})

it('discards a pending history read across sign-out and immediate reauthentication', async () => {
  jest.mocked(cacheSession).mockReturnValueOnce(Promise.resolve(null))
  const key = 'ch:old'
  jest
    .mocked(readMessages)
    .mockResolvedValue({ key, messages: [makeMessage()], hasMore: false, hasNewer: false, updatedAt: 1 })
  const reading = hydrateContextFromDisk(key)
  expect(await reading).toBe(false)
  expect(peekContext(key)).toBeNull()
})

it('discards permission data read just before a server was evicted', async () => {
  jest.mocked(readStructure).mockImplementation(async (key) => (key.startsWith('channels:') ? null : { hidden: '1' }))
  const reading = hydrateServerStructureFromDisk('revoked')
  evictServer('revoked')
  await reading
  expect(getPermissions('revoked')).toBeNull()
})
