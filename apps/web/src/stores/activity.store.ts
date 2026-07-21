import type { ActivitySettings, RegisteredGame, UserActivity } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'

type ActivityState = {
  /** Other users' current shared activities, keyed by userId (display). */
  activities: Map<string, UserActivity>
  /** Own sharing settings (desktop). Null until loaded. */
  settings: ActivitySettings | null
  /** Own registered games (desktop). */
  games: RegisteredGame[]
  /** Server ids where the user has hidden their activity sharing. */
  hiddenServerIds: string[]

  // Display
  setUserActivity: (userId: string, activity: UserActivity | null) => void
  initActivities: (record: Record<string, UserActivity>) => void
  getActivity: (userId: string) => UserActivity | undefined

  // Own settings / games
  fetchSettings: () => Promise<void>
  updateSettings: (patch: Partial<ActivitySettings>) => Promise<void>
  fetchGames: () => Promise<void>
  setGameHidden: (id: string, hidden: boolean) => Promise<void>
  removeGame: (id: string) => Promise<void>
  upsertGameLocal: (game: RegisteredGame) => void

  // Per-server sharing
  fetchServerPrefs: () => Promise<void>
  setServerHidden: (serverId: string, hidden: boolean) => Promise<void>
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  activities: new Map(),
  settings: null,
  games: [],
  hiddenServerIds: [],

  setUserActivity: (userId, activity) =>
    set((s) => {
      const next = new Map(s.activities)
      if (activity) next.set(userId, activity)
      else next.delete(userId)
      return { activities: next }
    }),

  initActivities: (record) =>
    set((s) => {
      const next = new Map(s.activities)
      for (const [uid, act] of Object.entries(record)) next.set(uid, act)
      return { activities: next }
    }),

  getActivity: (userId) => get().activities.get(userId),

  fetchSettings: async () => {
    const settings = await api.getActivitySettings()
    set({ settings })
  },

  updateSettings: async (patch) => {
    // Optimistic update so toggles feel instant.
    const prev = get().settings
    if (prev) set({ settings: { ...prev, ...patch } })
    try {
      const settings = await api.updateActivitySettings(patch)
      set({ settings })
    } catch (err) {
      if (prev) set({ settings: prev })
      throw err
    }
  },

  fetchGames: async () => {
    const games = await api.getRegisteredGames()
    set({ games })
  },

  setGameHidden: async (id, hidden) => {
    const updated = await api.updateRegisteredGame(id, { hidden })
    set((s) => ({ games: s.games.map((g) => (g.id === id ? updated : g)) }))
  },

  removeGame: async (id) => {
    await api.deleteRegisteredGame(id)
    set((s) => ({ games: s.games.filter((g) => g.id !== id) }))
  },

  upsertGameLocal: (game) =>
    set((s) => {
      const idx = s.games.findIndex((g) => g.id === game.id || g.name === game.name)
      if (idx === -1) return { games: [game, ...s.games] }
      const next = [...s.games]
      next[idx] = game
      return { games: next }
    }),

  fetchServerPrefs: async () => {
    const { hiddenServerIds } = await api.getActivityServerPrefs()
    set({ hiddenServerIds })
  },

  setServerHidden: async (serverId, hidden) => {
    // Optimistic update so the toggle feels instant.
    const prev = get().hiddenServerIds
    const next = hidden
      ? [...new Set([...prev, serverId])]
      : prev.filter((id) => id !== serverId)
    set({ hiddenServerIds: next })
    try {
      await api.setActivityServerHidden(serverId, hidden)
    } catch (err) {
      set({ hiddenServerIds: prev })
      throw err
    }
  }
}))
