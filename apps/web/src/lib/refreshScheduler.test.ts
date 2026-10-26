import { createRefreshScheduler } from './refreshScheduler'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

it('coalesces a burst, never overlaps, and keeps a trailing refresh', async () => {
  let finish!: () => void
  const refresh = jest.fn().mockImplementationOnce(() => new Promise<void>(r => { finish = r })).mockResolvedValue(undefined)
  const scheduler = createRefreshScheduler(refresh, 1500)
  for (let i = 0; i < 100; i++) scheduler.request()
  await tick()
  expect(refresh).toHaveBeenCalledTimes(1)
  await jest.advanceTimersByTimeAsync(3000)
  expect(refresh).toHaveBeenCalledTimes(1)
  finish()
  await tick()
  expect(refresh).toHaveBeenCalledTimes(2)
  scheduler.cancel()
})

it('rate-limits completed refreshes and cancels pending session work', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined)
  const scheduler = createRefreshScheduler(refresh, 1500)
  scheduler.request()
  await tick()
  scheduler.request()
  await jest.advanceTimersByTimeAsync(1499)
  expect(refresh).toHaveBeenCalledTimes(1)
  await jest.advanceTimersByTimeAsync(1)
  expect(refresh).toHaveBeenCalledTimes(2)
  scheduler.request()
  scheduler.cancel()
  await jest.advanceTimersByTimeAsync(3000)
  expect(refresh).toHaveBeenCalledTimes(2)
})

it('does not start a queued refresh after session cancellation', async () => {
  const refresh = jest.fn()
  const scheduler = createRefreshScheduler(refresh, 1500)
  scheduler.request()
  scheduler.cancel()
  await tick()
  expect(refresh).not.toHaveBeenCalled()
})
