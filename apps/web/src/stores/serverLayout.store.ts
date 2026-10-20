import { isServerLayout, type ServerLayoutEntry } from '@chat/shared'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { api } from '@/lib/api'
import i18n from 'i18next'
import { showToast } from './toast.store'

type LayoutState = {
  ownerKey: string | null
  entries: ServerLayoutEntry[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  isSaving: boolean
  load: (userId: string) => Promise<void>
  save: (entries: ServerLayoutEntry[]) => Promise<void>
  reset: () => void
}

let revision = 0

export function serverLayoutOwner(userId: string): string {
  return `${api.baseUrl}:${userId}`
}

function cacheError(error: unknown) {
  console.error('Could not access server layout cache', error)
  showToast(i18n.t('nav:organizeServers'), i18n.t('nav:layoutCacheError'))
}

export const useServerLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      ownerKey: null,
      entries: [],
      status: 'idle',
      isSaving: false,
      load: async (userId) => {
        const ownerKey = serverLayoutOwner(userId)
        if (get().ownerKey !== ownerKey) {
          revision++
          set({ ownerKey, entries: [], status: 'idle', isSaving: false })
        }
        if (get().status === 'loading' || get().status === 'ready') return
        const request = revision
        set({ status: 'loading' })
        try {
          const entries = await api.get<unknown>('/api/users/@me/server-layout')
          if (!isServerLayout(entries)) throw new Error('Invalid server layout response')
          if (request !== revision) return
          set({ entries, status: 'ready' })
        } catch (error) {
          console.error('Could not load server layout', error)
          if (request === revision) set({ status: 'error' })
        }
      },
      save: async (entries) => {
        if (get().status !== 'ready' || get().isSaving) throw new Error('Server layout is not ready to save')
        if (!isServerLayout(entries)) throw new Error('Invalid server layout')
        const previous = get().entries
        const request = revision
        set({ entries, isSaving: true })
        try {
          const saved = await api.put<unknown>('/api/users/@me/server-layout', { entries })
          if (!isServerLayout(saved)) throw new Error('Invalid server layout response')
          if (request === revision) set({ entries: saved, isSaving: false })
        } catch (error) {
          if (request === revision) set({ entries: previous, isSaving: false })
          throw error
        }
      },
      reset: () => {
        revision++
        set({ ownerKey: null, entries: [], status: 'idle', isSaving: false })
      }
    }),
    {
      name: 'jablu-server-layout',
      storage: createJSONStorage(() => ({
        getItem: (key) => {
          try {
            return localStorage.getItem(key)
          } catch (error) {
            cacheError(error)
            return null
          }
        },
        setItem: (key, value) => {
          try {
            localStorage.setItem(key, value)
          } catch (error) {
            cacheError(error)
          }
        },
        removeItem: (key) => {
          try {
            localStorage.removeItem(key)
          } catch (error) {
            cacheError(error)
          }
        }
      })),
      partialize: (s) => ({ ownerKey: s.ownerKey, entries: s.entries }),
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== 'object') return current
        const data = persisted as Record<string, unknown>
        if (typeof data.ownerKey !== 'string' || !isServerLayout(data.entries)) return current
        return { ...current, ownerKey: data.ownerKey, entries: data.entries }
      }
    }
  )
)
