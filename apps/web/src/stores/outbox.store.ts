import { create } from 'zustand'
import { composerTransaction } from '@/lib/composerDb'
import { composerKey, useDraftStore, type ComposerMode, type DraftReply } from './draft.store'

export class OutboxActionError extends Error {}

export type OutboxMessage = {
  id: string
  userId: string
  mode: ComposerMode
  contextId: string
  threadParentId?: string
  content: string
  replyToId?: string
  reply?: DraftReply
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
  progress: Record<string, { fileIndex: number; loaded: number; total: number }>
  refresh: (userId: string) => Promise<void>
  enqueue: (
    message: Pick<
      OutboxMessage,
      | 'userId'
      | 'mode'
      | 'contextId'
      | 'content'
      | 'files'
      | 'threadParentId'
      | 'replyToId'
      | 'reply'
      | 'targetBotAppId'
    > & { clientMessageId?: string }
  ) => Promise<void>
  retry: (id: string) => Promise<void>
  discard: (id: string) => Promise<void>
  restore: (id: string) => Promise<void>
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
  progress: {},
  refresh: async (userId) => {
    const items = await composerTransaction<OutboxMessage[]>('outbox', 'readonly', (store, done) => {
      const request = store.index('userId').getAll(userId) as IDBRequest<OutboxMessage[]>
      request.onsuccess = () => done(request.result.sort((a, b) => a.createdAt - b.createdAt))
    })
    if (get().userId === userId) set({ items, error: null })
  },
  enqueue: async (message) => {
    const { clientMessageId, ...payload } = message
    const item: OutboxMessage = {
      ...payload,
      id: clientMessageId ?? crypto.randomUUID(),
      createdAt: Date.now(),
      attachmentIds: [],
      status: 'queued',
      attempts: 0,
      nextAttemptAt: 0,
      leaseUntil: 0
    }
    const saved = await composerTransaction<boolean>('outbox', 'readwrite', (store, done) => {
      if (!clientMessageId) {
        store.add(item)
        done(true)
        return
      }
      const request = store.get(clientMessageId) as IDBRequest<OutboxMessage | undefined>
      request.onsuccess = () => {
        const current = request.result
        if (current && (current.userId !== item.userId || current.status !== 'failed')) {
          done(false)
          return
        }
        store.put(item)
        done(true)
      }
    })
    if (!saved) throw new OutboxActionError('outboxChanged')
    if (get().userId === item.userId) set((s) => ({ items: [...s.items.filter((old) => old.id !== item.id), item] }))
    changed()
  },
  restore: async (id) => {
    const item = await composerTransaction<OutboxMessage | undefined>('outbox', 'readonly', (store, done) => {
      const request = store.get(id) as IDBRequest<OutboxMessage | undefined>
      request.onsuccess = () => done(request.result)
    })
    if (!item || item.userId !== get().userId || item.status !== 'failed') throw new OutboxActionError('outboxChanged')
    const key = composerKey(item.userId, item.mode, item.contextId, item.threadParentId)
    await useDraftStore.getState().loadFiles(key)
    if (!useDraftStore.getState().files[key]) throw new OutboxActionError('outboxStorageFailed')
    const draft = useDraftStore.getState().drafts[key]
    if (draft?.text || draft?.reply || draft?.fileCount || useDraftStore.getState().files[key].length)
      throw new OutboxActionError('outboxDraftOccupied')
    useDraftStore.getState().update(key, {
      text: item.content,
      fileCount: item.files.length,
      reply: item.reply ?? (item.replyToId ? { id: item.replyToId, content: null, authorName: '' } : null),
      bot: item.targetBotAppId
        ? { botAppId: item.targetBotAppId, commandName: item.content.slice(1).split(/\s/)[0] }
        : null,
      outboxId: item.id
    })
    await useDraftStore.getState().setFiles(key, item.files)
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
