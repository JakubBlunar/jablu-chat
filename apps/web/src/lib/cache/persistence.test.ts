import { startCachePersistence, stopCachePersistence } from './persistence'
import { initCacheDb, writeStructure } from './db'
import { putPermissions } from './structureCache'

jest.mock('@/hooks/usePwaInstall', () => ({ getIsStandalone: () => false }))
jest.mock('./db', () => ({ retireCacheSession: jest.fn(), initCacheDb: jest.fn(), writeStructure: jest.fn() }))

it('records changes during database initialization and flushes only after ownership is established', async () => {
  jest.useFakeTimers()
  try {
    let open!: () => void
    jest.mocked(initCacheDb).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          open = resolve
        })
    )
    const started = startCachePersistence('reader')
    putPermissions('server', { channel: '1' })
    await jest.runAllTimersAsync()
    expect(writeStructure).not.toHaveBeenCalled()
    open()
    await started
    await jest.runAllTimersAsync()
    expect(writeStructure).toHaveBeenCalledWith('permissions:server', { channel: '1' })
  } finally {
    stopCachePersistence()
    jest.useRealTimers()
  }
})

it('abandons the remainder of a delayed flush across a session change', async () => {
  jest.useFakeTimers()
  let release!: () => void
  try {
    await startCachePersistence('first')
    jest.mocked(writeStructure).mockClear().mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    putPermissions('first', { one: '1' })
    putPermissions('second', { two: '2' })
    await jest.runAllTimersAsync()
    stopCachePersistence()
    await startCachePersistence('first')
    putPermissions('active', { three: '3' })
    release()
    await jest.runAllTimersAsync()
    expect(jest.mocked(writeStructure).mock.calls.map(call => call[0])).toEqual(['permissions:first', 'permissions:active'])
  } finally {
    stopCachePersistence()
    jest.useRealTimers()
  }
})
