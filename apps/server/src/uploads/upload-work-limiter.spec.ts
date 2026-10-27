import { UploadWorkLimiter } from './upload-work-limiter'

it('bounds work and queued buffers, rejecting overload before work starts', async () => {
  const limiter = new UploadWorkLimiter(1, 1)
  const release = await limiter.acquire()
  const queued = limiter.acquire()
  await expect(limiter.run(async () => { throw new Error('must not execute') })).rejects.toThrow('busy')
  expect(limiter.state).toEqual({ active: 1, queued: 1 })
  release()
  const releaseNext = await queued
  release() // idempotent even after handing the slot to another request
  expect(limiter.state).toEqual({ active: 1, queued: 0 })
  releaseNext()
  expect(limiter.state).toEqual({ active: 0, queued: 0 })
})

it('removes cancelled waiters and releases capacity after failures', async () => {
  const limiter = new UploadWorkLimiter(1, 1)
  const release = await limiter.acquire()
  const abort = new AbortController()
  const queued = limiter.acquire(abort.signal)
  const rejected = expect(queued).rejects.toThrow()
  abort.abort()
  await rejected
  expect(limiter.state).toEqual({ active: 1, queued: 0 })
  release()
  await expect(limiter.run(async () => { throw Error('processing failure') })).rejects.toThrow('processing failure')
  expect(limiter.state).toEqual({ active: 0, queued: 0 })
})

it('expires queued admissions without starting their work', async () => {
  jest.useFakeTimers()
  try {
    const limiter = new UploadWorkLimiter(1, 1)
    const release = await limiter.acquire()
    const queued = expect(limiter.acquire()).rejects.toThrow('timed out')
    jest.advanceTimersByTime(10_000)
    await queued
    expect(limiter.state.queued).toBe(0)
    release()
  } finally { jest.useRealTimers() }
})
