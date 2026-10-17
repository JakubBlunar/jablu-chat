import { useCallback } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { composerTransaction } from '@/lib/composerDb'
import { useAuthStore } from './auth.store'
import { showToast } from './toast.store'
import i18next from 'i18next'

export type ComposerMode = 'channel' | 'dm'
export type DraftReply = { id: string; content: string | null; authorName: string }
type Draft = {
  outboxId?: string
  text: string
  reply: DraftReply | null
  bot: { botAppId: string; commandName: string } | null
  fileCount: number
}
const EMPTY_DRAFT: Draft = { text: '', reply: null, bot: null, fileCount: 0 }
export const EMPTY_DRAFT_FILES: File[] = []

export function composerKey(userId: string, mode: ComposerMode, contextId: string, threadParentId?: string | null) {
  return JSON.stringify([userId, mode, contextId, threadParentId ?? null])
}

type DraftState = {
  drafts: Record<string, Draft>
  files: Record<string, File[]>
  error: boolean
  update: (key: string, patch: Partial<Draft>) => void
  setFiles: (key: string, files: File[]) => Promise<void>
  loadFiles: (key: string) => Promise<void>
}

export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      drafts: {},
      files: {},
      error: false,
      update: (key, patch) => {
        set((state) => {
          const draft = { ...(state.drafts[key] ?? EMPTY_DRAFT), ...patch }
          const drafts = { ...state.drafts }
          if (!draft.text && !draft.reply && !draft.fileCount) delete drafts[key]
          else drafts[key] = draft
          return { drafts, error: false }
        })
      },
      setFiles: async (key, files) => {
        set((state) => ({ files: { ...state.files, [key]: files } }))
        get().update(key, { fileCount: files.length })
        try {
          await composerTransaction<void>('files', 'readwrite', (store, done) => {
            if (files.length) store.put({ key, files })
            else store.delete(key)
            done()
          })
        } catch (error) {
          console.error('Failed to persist draft attachments', error)
          set({ error: true })
          throw error
        }
      },
      loadFiles: async (key) => {
        if (get().files[key]) return
        try {
          const files = await composerTransaction<File[]>('files', 'readonly', (store, done) => {
            const request = store.get(key) as IDBRequest<{ files: File[] } | undefined>
            request.onsuccess = () => done(request.result?.files ?? [])
          })
          if (!get().files[key]) set((state) => ({ files: { ...state.files, [key]: files } }))
        } catch (error) {
          console.error('Failed to restore draft attachments', error)
          set({ error: true })
        }
      }
    }),
    {
      name: 'jablu-drafts',
      storage: createJSONStorage(() => ({
        getItem: (name) => localStorage.getItem(name),
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value)
          } catch (error) {
            console.error('Failed to persist composer draft', error)
            showToast(i18next.t('chat:draft'), i18next.t('chat:draftSaveFailed'))
          }
        },
        removeItem: (name) => localStorage.removeItem(name)
      })),
      partialize: (state) => ({ drafts: state.drafts }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error('Failed to restore composer drafts', error)
          showToast(i18next.t('chat:draft'), i18next.t('chat:draftSaveFailed'))
        }
      }
    }
  )
)

export function useHasDraft(mode: ComposerMode, contextId: string, threadParentId?: string) {
  const userId = useAuthStore((s) => s.user?.id)
  const prefix = JSON.stringify([userId, mode, contextId]).slice(0, -1) + ','
  return useDraftStore((state) => {
    if (!userId) return false
    const entries = threadParentId
      ? [state.drafts[composerKey(userId, mode, contextId, threadParentId)]]
      : Object.entries(state.drafts)
          .filter(([key]) => key.startsWith(prefix))
          .map(([, draft]) => draft)
    return entries.some((draft) => !!(draft?.text || draft?.reply || draft?.fileCount))
  })
}

export function useDraftReply(mode: ComposerMode, contextId: string | null, threadParentId?: string | null) {
  const userId = useAuthStore((s) => s.user?.id)
  const key = userId && contextId ? composerKey(userId, mode, contextId, threadParentId) : null
  const reply = useDraftStore((s) => (key ? (s.drafts[key]?.reply ?? null) : null))
  const setReply = useCallback(
    (value: DraftReply | null) => {
      if (key) useDraftStore.getState().update(key, { reply: value })
    },
    [key]
  )
  return [reply, setReply] as const
}
