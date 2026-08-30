import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/** Cap on remembered servers. Oldest entries are dropped first. */
const MAX_SERVERS = 50

/**
 * Where the user last was. `channelId`/`conversationId` may be null when the
 * user was on a server with no readable channel, or on the friends list.
 */
export type NavLocation =
  | { kind: 'server'; serverId: string; channelId: string | null }
  | { kind: 'dm'; conversationId: string | null }

export type NavHistorySlice = {
  /**
   * Owner of the persisted entries. `jablu-nav-history` is a single
   * localStorage key shared by every account that signs in on this install, so
   * entries are only trusted while this matches the current user.
   */
  userId: string | null
  lastChannelByServer: Record<string, string>
  /** Server ids in least-to-most recently used order. */
  serverOrder: string[]
  /** Conversation id, or null for the friends list. */
  lastDmScreen: string | null
  lastLocation: NavLocation | null
}

type NavHistoryActions = {
  syncUser: (userId: string | null) => void
  recordChannel: (serverId: string, channelId: string) => void
  recordServerLocation: (serverId: string, channelId: string | null) => void
  recordDmScreen: (conversationId: string | null) => void
  getLastChannel: (serverId: string) => string | null
  forgetServer: (serverId: string) => void
  clear: () => void
}

export type NavHistoryState = NavHistorySlice & NavHistoryActions

const defaults: NavHistorySlice = {
  userId: null,
  lastChannelByServer: {},
  serverOrder: [],
  lastDmScreen: null,
  lastLocation: null
}

function coerceLocation(v: unknown): NavLocation | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (o.kind === 'server' && typeof o.serverId === 'string') {
    return {
      kind: 'server',
      serverId: o.serverId,
      channelId: typeof o.channelId === 'string' ? o.channelId : null
    }
  }
  if (o.kind === 'dm') {
    return { kind: 'dm', conversationId: typeof o.conversationId === 'string' ? o.conversationId : null }
  }
  return null
}

function coercePersisted(p: unknown): Partial<NavHistorySlice> {
  if (!p || typeof p !== 'object') return {}
  const o = p as Record<string, unknown>
  const out: Partial<NavHistorySlice> = {}

  if (typeof o.userId === 'string') out.userId = o.userId

  if (o.lastChannelByServer && typeof o.lastChannelByServer === 'object') {
    const src = o.lastChannelByServer as Record<string, unknown>
    const map: Record<string, string> = {}
    for (const [serverId, channelId] of Object.entries(src)) {
      if (typeof channelId === 'string') map[serverId] = channelId
    }
    out.lastChannelByServer = map
  }

  if (Array.isArray(o.serverOrder) && o.serverOrder.every((x) => typeof x === 'string')) {
    out.serverOrder = o.serverOrder as string[]
  }

  if (o.lastDmScreen === null || typeof o.lastDmScreen === 'string') out.lastDmScreen = o.lastDmScreen
  out.lastLocation = coerceLocation(o.lastLocation)

  return out
}

/** Move `serverId` to the most-recent end, dropping the oldest past the cap. */
function touch(order: string[], serverId: string): string[] {
  const next = order.filter((id) => id !== serverId)
  next.push(serverId)
  return next.length > MAX_SERVERS ? next.slice(next.length - MAX_SERVERS) : next
}

function pruneToOrder(map: Record<string, string>, order: string[]): Record<string, string> {
  const keep = new Set(order)
  const out: Record<string, string> = {}
  for (const [serverId, channelId] of Object.entries(map)) {
    if (keep.has(serverId)) out[serverId] = channelId
  }
  return out
}

export const useNavHistoryStore = create<NavHistoryState>()(
  persist(
    (set, get) => ({
      ...defaults,

      syncUser: (userId) => {
        if (get().userId === userId) return
        set({ ...defaults, userId })
      },

      recordChannel: (serverId, channelId) => {
        set((s) => {
          if (s.lastChannelByServer[serverId] === channelId) return s
          const serverOrder = touch(s.serverOrder, serverId)
          const lastChannelByServer = pruneToOrder(
            { ...s.lastChannelByServer, [serverId]: channelId },
            serverOrder
          )
          return { lastChannelByServer, serverOrder }
        })
      },

      recordServerLocation: (serverId, channelId) => {
        set((s) => ({
          lastLocation: {
            kind: 'server',
            serverId,
            // A null channel means the user is somewhere there is nothing to
            // come back to — a voice room, or a server with no readable
            // channel. Fall back to whatever they last read on that server so
            // a relaunch still lands on a conversation.
            channelId: channelId ?? s.lastChannelByServer[serverId] ?? null
          }
        }))
      },

      recordDmScreen: (conversationId) => {
        set({ lastDmScreen: conversationId, lastLocation: { kind: 'dm', conversationId } })
      },

      getLastChannel: (serverId) => get().lastChannelByServer[serverId] ?? null,

      forgetServer: (serverId) => {
        set((s) => {
          if (!(serverId in s.lastChannelByServer) && !s.serverOrder.includes(serverId)) return s
          const { [serverId]: _dropped, ...lastChannelByServer } = s.lastChannelByServer
          return { lastChannelByServer, serverOrder: s.serverOrder.filter((id) => id !== serverId) }
        })
      },

      clear: () => set({ ...defaults, userId: get().userId })
    }),
    {
      name: 'jablu-nav-history',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => ({
        ...current,
        ...coercePersisted(persisted)
      }),
      partialize: (s) => ({
        userId: s.userId,
        lastChannelByServer: s.lastChannelByServer,
        serverOrder: s.serverOrder,
        lastDmScreen: s.lastDmScreen,
        lastLocation: s.lastLocation
      })
    }
  )
)
