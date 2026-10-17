import { create } from 'zustand'
import { composerTransaction } from '@/lib/composerDb'
import type { ComposerMode } from './draft.store'

export type OutboxMessage = {
  id: string
  userId: string
  mode: ComposerMode
  contextId: string
  threadParentId?: string
  content: string
  replyToId?: string
  targetBotAppId?: string
  files: File[]
  attachmentIds: string[]
  createdAt: number
  status: 'queued' | 'sending' | 'failed'
  error?: string
  attempts: number
  nextAttemptAt: number
  leaseUntil: number
  leaseOwner?: string
}
type OutboxState = {
  userId: string | null
  items: OutboxMessage[]
  error: string | null
  refresh: (userId: string) => Promise<void>
  enqueue: (
    message: Pick<
      OutboxMessage,
      'userId' | 'mode' | 'contextId' | 'content' | 'files' | 'threadParentId' | 'replyToId' | 'targetBotAppId'
    >
  ) => Promise<void>
  retry: (id: string) => Promise<void>
  discard: (id: string) => Promise<void>
}

function changed() {
  window.dispatchEvent(new Event('jablu-outbox-changed'))
}

export async function mutateOutbox<T>(
  id: string,
  mutate: (message: OutboxMessage | undefined) => { message: OutboxMessage | null; result: T }
): Promise<T> {
  return composerTransaction<T>('outbox', 'readwrite', (store, done) => {
    const request = store.get(id) as IDBRequest<OutboxMessage | undefined>
    request.onsuccess = () => {
      const { message, result } = mutate(request.result)
      if (message) store.put(message)
      else store.delete(id)
      done(result)
    }
  })
}

export const useOutboxStore = create<OutboxState>((set, get) => ({
  userId: null,
  items: [],
  error: null,
  refresh: async (userId) => {
    const items = await composerTransaction<OutboxMessage[]>('outbox', 'readonly', (store, done) => {
      const request = store.index('userId').getAll(userId) as IDBRequest<OutboxMessage[]>
      request.onsuccess = () => done(request.result.sort((a, b) => a.createdAt - b.createdAt))
    })
    if (get().userId === userId) set({ items, error: null })
  },
  enqueue: async (message) => {
    const item: OutboxMessage = {
      ...message,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      attachmentIds: [],
      status: 'queued',
      attempts: 0,
      nextAttemptAt: 0,
      leaseUntil: 0
    }
    await composerTransaction<void>('outbox', 'readwrite', (store, done) => {
      store.add(item)
      done()
    })
    if (get().userId === item.userId) set((s) => ({ items: [...s.items, item] }))
    changed()
  },
  retry: async (id) => {
    await mutateOutbox(id, (item) => ({
      message:
        item && item.userId === get().userId && item.status === 'failed'
          ? { ...item, status: 'queued', error: undefined, nextAttemptAt: 0, leaseUntil: 0 }
          : (item ?? null),
      result: undefined
    }))
    if (get().userId) await get().refresh(get().userId!)
    changed()
  },
  discard: async (id) => {
    await mutateOutbox(id, (item) => ({
      message: item && (item.userId !== get().userId || item.status === 'sending') ? item : null,
      result: undefined
    }))
    if (get().userId) await get().refresh(get().userId!)
    changed()
  }
}))
