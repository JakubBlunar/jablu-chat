/** A visible resource has one owner: share same-key reads, supersede older targets. */
export function createActiveResourceRequest<T>() {
  let active: { key: string; controller: AbortController; promise: Promise<void> } | null = null
  return {
    run(key: string, load: (signal: AbortSignal) => Promise<T>, handlers: {
      start?: () => void
      commit: (value: T) => void
      fail?: (error: unknown) => void
      ignoreErrors?: boolean
    }, fresh = false): Promise<void> {
      // An invalidation for the previous view must not cancel a new navigation.
      if (fresh && active && active.key !== key) return Promise.resolve()
      if (!fresh && active?.key === key) return active.promise
      active?.controller.abort()
      const controller = new AbortController()
      const entry = { key, controller, promise: Promise.resolve() }
      entry.promise = Promise.resolve().then(async () => {
        controller.signal.throwIfAborted()
        const value = await load(controller.signal)
        if (active === entry && !controller.signal.aborted) handlers.commit(value)
      }).catch((error: unknown) => {
        if (active !== entry || controller.signal.aborted) return
        handlers.fail?.(error)
        if (!handlers.ignoreErrors) throw error
      }).finally(() => { if (active === entry) active = null })
      active = entry
      handlers.start?.()
      return entry.promise
    },
    cancel() { active?.controller.abort(); active = null }
  }
}
