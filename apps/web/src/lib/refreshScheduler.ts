/** One active refresh, with a rate-limited trailing pass for intervening events. */
export function createRefreshScheduler(refresh: () => void | Promise<void>, intervalMs: number) {
  let running = false
  let dirty = false
  let lastStart = -Infinity
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  function start() {
    timer = undefined
    if (running || !dirty) return
    const delay = intervalMs - (Date.now() - lastStart)
    if (delay > 0) {
      timer = setTimeout(start, delay)
      return
    }
    dirty = false
    running = true
    lastStart = Date.now()
    const current = generation
    void Promise.resolve().then(() => {
      if (generation === current) return refresh()
    }).catch(() => {}).finally(() => {
      if (generation !== current) return
      running = false
      if (dirty) start()
    })
  }
  return {
    request() {
      dirty = true
      if (!timer) start()
    },
    cancel() {
      generation++
      if (timer) clearTimeout(timer)
      timer = undefined
      running = false
      dirty = false
      lastStart = -Infinity
    }
  }
}
