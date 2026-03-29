import { create } from 'zustand'
import { api } from '@/lib/api'

export type NotifLevel = 'all' | 'mentions' | 'none'

type NotifPrefState = {
  prefs: Record<string, NotifLevel>
  serverPrefs: Record<string, NotifLevel>
  fetchAll: () => Promise<void>
  set: (channelId: string, level: NotifLevel) => void
  remove: (channelId: string) => void
  get: (channelId: string) => NotifLevel
  getServerLevel: (serverId: string) => NotifLevel
  setServer: (serverId: string, level: NotifLevel) => void
  removeServer: (serverId: string) => void
  getEffective: (channelId: string, serverId?: string) => NotifLevel
}

export const useNotifPrefStore = create<NotifPrefState>()((set, get) => ({
  prefs: {},
  serverPrefs: {},

  fetchAll: async () => {
    try {
      const data = await api.getAllNotifPrefs()
      set({
        prefs: data.prefs as Record<string, NotifLevel>,
        serverPrefs: (data.serverPrefs ?? {}) as Record<string, NotifLevel>
      })
    } catch {
      /* ignore – prefs default to "all" */
    }
  },

  set: (channelId, level) => {
    set((state) => ({ prefs: { ...state.prefs, [channelId]: level } }))
  },

  remove: (channelId) => {
    set((state) => {
      const next = { ...state.prefs }
      delete next[channelId]
      return { prefs: next }
    })
  },

  get: (channelId) => get().prefs[channelId] ?? 'all',

  getServerLevel: (serverId) => get().serverPrefs[serverId] ?? 'all',

  setServer: (serverId, level) => {
    set((state) => ({ serverPrefs: { ...state.serverPrefs, [serverId]: level } }))
  },

  removeServer: (serverId) => {
    set((state) => {
      const next = { ...state.serverPrefs }
      delete next[serverId]
      return { serverPrefs: next }
    })
  },

  getEffective: (channelId, serverId) => {
    const { prefs, serverPrefs } = get()
    const channelLevel = prefs[channelId]
    if (channelLevel) return channelLevel
    if (serverId) return serverPrefs[serverId] ?? 'all'
    return 'all'
  }
}))
