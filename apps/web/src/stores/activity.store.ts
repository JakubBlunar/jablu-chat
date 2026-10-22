import type { ActivitySettings, RegisteredGame, UserActivity } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'
import { useAuthStore } from './auth.store'

let sessionEpoch = 0
let settingsRequest = 0
let gamesRequest = 0
let serverPrefsRequest = 0
const session = () => {
  const epoch = sessionEpoch
  const uid = useAuthStore.getState().user?.id
  return () => epoch === sessionEpoch && uid === useAuthStore.getState().user?.id
}

type ActivityState = {
  /** Other users' current shared activities, keyed by userId (display). */
  activities: Map<string, UserActivity>
  /** Own sharing settings (desktop). Null until loaded. */
  settings: ActivitySettings | null
  settingsLoaded: boolean
  /** Own registered games (desktop). */
  games: RegisteredGame[]
  gamesLoaded: boolean
  /** Server ids where the user has hidden their activity sharing. */
  hiddenServerIds: string[]

  reset: () => void
  resetDisplay: () => void
  snapshotRevision: number
  activityRevisions: Map<string, number>

  // Display
  setUserActivity: (userId: string, activity: UserActivity | null, revision?: number) => void
  initActivities: (record: Record<string, UserActivity>, revision?: number) => void
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
  settingsLoaded: false,
  games: [],
  gamesLoaded: false,
  hiddenServerIds: [],

  snapshotRevision: -1,
  activityRevisions: new Map(),
  resetDisplay: () => set({ activities: new Map(), activityRevisions: new Map(), snapshotRevision: -1 }),
  reset: () => {
    sessionEpoch++
    settingsRequest++
    gamesRequest++
    serverPrefsRequest++
    set({
      activities: new Map(),
      activityRevisions: new Map(),
      snapshotRevision: -1,
      settings: null,
      settingsLoaded: false,
      games: [],
      gamesLoaded: false,
      hiddenServerIds: []
    })
  },

  setUserActivity: (userId, activity, revision) =>
    set((s) => {
      if (revision !== undefined && revision < Math.max(s.snapshotRevision, s.activityRevisions.get(userId) ?? -1))
        return s
      const next = new Map(s.activities)
      const revisions = new Map(s.activityRevisions)
      if (activity) next.set(userId, activity)
      else next.delete(userId)
      if (revision !== undefined) revisions.set(userId, revision)
      return { activities: next, activityRevisions: revisions }
    }),

  initActivities: (record, revision) =>
    set((s) => {
      if (revision !== undefined && revision < s.snapshotRevision) return s
      const next = new Map(Object.entries(record))
      const revisions = new Map<string, number>()
      if (revision !== undefined)
        for (const [uid, version] of s.activityRevisions) {
          if (version > revision) {
            revisions.set(uid, version)
            const current = s.activities.get(uid)
            if (current) next.set(uid, current)
            else next.delete(uid)
          }
        }
      return { activities: next, activityRevisions: revisions, snapshotRevision: revision ?? -1 }
    }),

  getActivity: (userId) => get().activities.get(userId),

  fetchSettings: async () => {
    const accountCurrent = session()
    const request = ++settingsRequest
    const current = () => accountCurrent() && request === settingsRequest
    const settings = await api.getActivitySettings()
    if (current()) set({ settings, settingsLoaded: true })
  },

  updateSettings: async (patch) => {
    const accountCurrent = session()
    const request = ++settingsRequest
    const current = () => accountCurrent() && request === settingsRequest
    // Optimistic update so toggles feel instant.
    const prev = get().settings
    if (prev) set({ settings: { ...prev, ...patch } })
    try {
      const settings = await api.updateActivitySettings(patch)
      if (current()) set({ settings, settingsLoaded: true })
    } catch (err) {
      if (current() && prev) set({ settings: prev })
      throw err
    }
  },

  fetchGames: async () => {
    const accountCurrent = session()
    const request = ++gamesRequest
    const current = () => accountCurrent() && request === gamesRequest
    const games = await api.getRegisteredGames()
    if (current()) set({ games, gamesLoaded: true })
  },

  setGameHidden: async (id, hidden) => {
    const accountCurrent = session()
    const request = ++gamesRequest
    const current = () => accountCurrent() && request === gamesRequest
    const previous = get().games
    set({ games: previous.map((g) => (g.id === id ? { ...g, hidden } : g)) })
    try {
      const updated = await api.updateRegisteredGame(id, { hidden })
      if (current()) set((s) => ({ games: s.games.map((g) => (g.id === id ? updated : g)) }))
    } catch (err) {
      if (current()) set({ games: previous })
      throw err
    }
  },

  removeGame: async (id) => {
    const accountCurrent = session()
    const request = ++gamesRequest
    const current = () => accountCurrent() && request === gamesRequest
    await api.deleteRegisteredGame(id)
    if (current()) set((s) => ({ games: s.games.filter((g) => g.id !== id) }))
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
    const accountCurrent = session()
    const request = ++serverPrefsRequest
    const current = () => accountCurrent() && request === serverPrefsRequest
    const { hiddenServerIds } = await api.getActivityServerPrefs()
    if (current()) set({ hiddenServerIds })
  },

  setServerHidden: async (serverId, hidden) => {
    const accountCurrent = session()
    const request = ++serverPrefsRequest
    const current = () => accountCurrent() && request === serverPrefsRequest
    // Optimistic update so the toggle feels instant.
    const prev = get().hiddenServerIds
    const next = hidden ? [...new Set([...prev, serverId])] : prev.filter((id) => id !== serverId)
    set({ hiddenServerIds: next })
    try {
      await api.setActivityServerHidden(serverId, hidden)
    } catch (err) {
      if (current()) set({ hiddenServerIds: prev })
      throw err
    }
  }
}))
