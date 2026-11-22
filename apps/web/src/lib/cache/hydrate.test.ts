import { makeMessage } from '@/test/factories'
import { readMessages, readStructure } from './db'
import { hydrateContextFromDisk, hydrateServerListFromDisk } from './hydrate'
import { clearCache, peekContext, putContext } from './messageCache'
import { clearStructureCache, getServerList, putServerList } from './structureCache'

jest.mock('./db', () => ({ readMessages: jest.fn(), readStructure: jest.fn() }))

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
