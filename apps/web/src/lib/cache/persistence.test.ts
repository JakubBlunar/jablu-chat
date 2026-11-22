import { startCachePersistence, stopCachePersistence } from './persistence'
import { initCacheDb, writeStructure } from './db'
import { putPermissions } from './structureCache'

jest.mock('@/hooks/usePwaInstall', () => ({ getIsStandalone: () => false }))
jest.mock('./db', () => ({ initCacheDb: jest.fn(), writeStructure: jest.fn() }))

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
