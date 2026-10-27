import { PreviewWorkQueue } from './preview-work-queue'

it('bounds total work, gives other owners capacity, and releases cancelled waiters', async () => {
  const queue = new PreviewWorkQueue()
  const releases: (() => void)[] = []
  const held = () => new Promise<void>((resolve) => releases.push(resolve))
  const first = Array.from({ length: 5 }, () => queue.run('one-user', held, new AbortController().signal))
  await Promise.resolve()
  expect(queue.state).toEqual({ active: 2, queued: 3 })
  const others = Array.from({ length: 2 }, () => queue.run('another-user', held, new AbortController().signal))
  await Promise.resolve()
  expect(queue.state.active).toBe(4)
  const abort = new AbortController()
  const waiting = queue.run('third-user', held, abort.signal)
  const cancelled = expect(waiting).rejects.toThrow()
  abort.abort()
  await cancelled
  while (queue.state.active || queue.state.queued) {
    releases.splice(0).forEach((release) => release())
    await new Promise((resolve) => setImmediate(resolve))
  }
  await Promise.all([...first, ...others])
  expect(queue.state).toEqual({ active: 0, queued: 0 })
})

it('expires and rejects excess queued requests without invoking them', async () => {
  jest.useFakeTimers()
  try {
    const queue = new PreviewWorkQueue()
    const releases: (() => void)[] = []
    const running = Array.from({ length: 2 }, () =>
      queue.run(
        'user',
        () =>
          new Promise<void>((resolve) => {
            releases.push(resolve)
          }),
        new AbortController().signal
      )
    )
    await Promise.resolve()
    const waiting = Array.from({ length: 8 }, () =>
      expect(
        queue.run(
          'user',
          async () => {
            throw Error('must not start')
          },
          new AbortController().signal
        )
      ).rejects.toThrow('deadline')
    )
    await expect(queue.run('user', async () => {}, new AbortController().signal)).rejects.toThrow('full')
    jest.advanceTimersByTime(5_000)
    await Promise.all(waiting)
    // Resolve both active jobs independently.
    releases.forEach((release) => release())
    await Promise.all(running)
  } finally {
    jest.useRealTimers()
  }
})
