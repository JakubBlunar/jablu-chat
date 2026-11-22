import type { Message } from '@chat/shared'
import { deleteMessages, mutateMessages, writeMessages } from './db'
import { onCacheChange, onDiskContextMutation, trimToPage, type CachedContext } from './messageCache'

type Mirror = { flush: (key: string) => void; pending: Map<string, Promise<void>> }
let active: Mirror | null = null

/** Finish earlier changes to this page before attempting an offline read. */
export function pendingDiskWrite(key: string) {
  active?.flush(key)
  return active?.pending.get(key)
}

export function startMessageMirror(schedule: () => void, hydrating: () => boolean) {
  const snapshots = new Map<string, CachedContext | null>()
  const pending = new Map<string, Promise<void>>()

  function enqueue(key: string, operation: () => Promise<void>) {
    const previous = pending.get(key)
    const next = (previous ?? Promise.resolve())
      .then(async () => {
        if (active === mirror) await operation()
      })
      .catch(() => {})
    pending.set(key, next)
    void next.then(() => {
      if (pending.get(key) === next) pending.delete(key)
    })
  }

  function flush(key: string) {
    if (!snapshots.has(key)) return
    const entry = snapshots.get(key)
    snapshots.delete(key)
    enqueue(key, () =>
      entry
        ? writeMessages({
            key,
            messages: entry.messages,
            hasMore: entry.hasMore,
            hasNewer: entry.hasNewer,
            updatedAt: entry.updatedAt
          })
        : deleteMessages(key)
    )
  }

  const mirror = { flush, pending }
  active = mirror
  const offChanges = onCacheChange((key, entry) => {
    if (hydrating()) return
    snapshots.set(key, entry)
    if (entry) schedule()
    else flush(key)
  })
  const offMutations = onDiskContextMutation((key, mutate) => {
    flush(key)
    enqueue(key, () =>
      mutateMessages(key, (record) => {
        const entry = { ...record, stale: true, messages: record.messages as Message[] }
        const next = mutate(entry)
        if (!next || next === entry) return null
        const messages = trimToPage(next.messages)
        return {
          key,
          messages,
          hasMore: next.hasMore || messages.length < next.messages.length,
          hasNewer: next.hasNewer,
          updatedAt: Date.now()
        }
      })
    )
  })

  return {
    flushAll() {
      for (const key of snapshots.keys()) flush(key)
    },
    stop() {
      active = null
      offChanges()
      offMutations()
      snapshots.clear()
    }
  }
}
