import { createActiveResourceRequest } from './activeResourceRequest'

it('shares work and commits once across simultaneous consumers', async () => {
  const request = createActiveResourceRequest<number>()
  const load = jest.fn().mockResolvedValue(42)
  const commit = jest.fn()
  const first = request.run('a', load, { commit })
  expect(request.run('a', load, { commit })).toBe(first)
  await first
  expect(load).toHaveBeenCalledTimes(1)
  expect(commit).toHaveBeenCalledTimes(1)
})

it('cancels transport and cannot commit an old session response after reset', async () => {
  const request = createActiveResourceRequest<number>()
  let resolve!: (value: number) => void
  let signal!: AbortSignal
  const commit = jest.fn()
  const old = request.run('a', s => { signal = s; return new Promise(r => { resolve = r }) }, { commit })
  await Promise.resolve()
  request.cancel()
  expect(signal.aborted).toBe(true)
  const current = request.run('a', async () => 2, { commit })
  await current
  resolve(1)
  await old
  expect(commit.mock.calls).toEqual([[2]])
})

it('refreshes invalidated same-server work but never lets an old-view invalidation cancel a new navigation', async () => {
  const request = createActiveResourceRequest<number>()
  const pending: { signal: AbortSignal; resolve: (n: number) => void }[] = []
  const load = (signal: AbortSignal) => new Promise<number>(resolve => pending.push({ signal, resolve }))
  const commit = jest.fn()
  const old = request.run('a', load, { commit })
  await Promise.resolve()
  const refreshed = request.run('a', load, { commit }, true)
  await Promise.resolve()
  expect(pending[0].signal.aborted).toBe(true)
  const next = request.run('b', load, { commit })
  await Promise.resolve()
  await request.run('a', load, { commit }, true)
  expect(pending[2].signal.aborted).toBe(false)
  pending[0].resolve(1); pending[1].resolve(2); pending[2].resolve(3)
  await Promise.all([old, refreshed, next])
  expect(commit.mock.calls).toEqual([[3]])
})
