import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

const RELOAD_FLAG_KEY = 'jablu:chunk-reloaded-at'
const RELOAD_COOLDOWN_MS = 5 * 60 * 1000

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false
  const message = err instanceof Error ? err.message : String(err)
  const name = err instanceof Error ? err.name : ''
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  )
}

function recentlyReloaded(): boolean {
  try {
    const raw = sessionStorage.getItem(RELOAD_FLAG_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return false
    return Date.now() - ts < RELOAD_COOLDOWN_MS
  } catch {
    return false
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  options: { retryDelayMs?: number } = {}
): LazyExoticComponent<T> {
  const retryDelayMs = options.retryDelayMs ?? 600
  return lazy<T>(async () => {
    try {
      return await factory()
    } catch (err) {
      if (!isChunkLoadError(err)) throw err
      await delay(retryDelayMs)
      try {
        return await factory()
      } catch (err2) {
        if (isChunkLoadError(err2) && !recentlyReloaded()) {
          markReloaded()
          window.location.reload()
          return await new Promise<never>(() => {})
        }
        throw err2
      }
    }
  })
}
