import type { PersistStorage, StorageValue } from 'zustand/middleware'

/** Keep serialization and localStorage off the typing path, with a bounded flush window. */
export function coalescedJsonStorage<T>(onError: (error: unknown) => void,
  equal: (a: StorageValue<T>, b: StorageValue<T>) => boolean, delay = 250
): PersistStorage<T> & { flush: () => boolean } {
  let pending: { name: string; value: StorageValue<T> } | undefined
  let saved: StorageValue<T> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    clearTimeout(timer)
    timer = undefined
    if (!pending) return true
    const snapshot = pending
    try {
      localStorage.setItem(snapshot.name, JSON.stringify(snapshot.value))
      saved = snapshot.value
      pending = undefined
      return true
    } catch (error) { onError(error); return false }
  }
  return {
    flush,
    getItem(name) {
      const raw = localStorage.getItem(name)
      return raw ? JSON.parse(raw) as StorageValue<T> : null
    },
    setItem(name, value) {
      if ((pending && equal(pending.value, value)) || (!pending && saved && equal(saved, value))) return
      pending = { name, value }
      timer ??= setTimeout(flush, delay)
    },
    removeItem(name) {
      clearTimeout(timer)
      timer = undefined
      pending = undefined
      saved = undefined
      localStorage.removeItem(name)
    }
  }
}
