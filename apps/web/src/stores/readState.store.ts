import { create } from 'zustand'
import { api } from '@/lib/api'
import { computeChannelBadge, type NotifLevel } from '@/lib/unread'
import { useChannelStore } from './channel.store'
import { useDmStore } from './dm.store'
import { useServerStore } from './server.store'

type ChannelUnread = {
  unreadCount: number
  mentionCount: number
  lastReadAt: string
  firstUnreadMessageId: string | null
}

/**
 * Snapshot of a channel/DM's unread state captured at the moment the user
 * opened it. Survives the immediate ackChannel/ackDm call so that the inline
 * "New Messages" divider and the top "X new messages since…" pill stay
 * visible while the user is in the channel. Cleared on context leave or when
 * the user explicitly clicks "Mark as Read".
 */
export type ChannelViewSnapshot = {
  unreadCount: number
  firstUnreadMessageId: string | null
  lastReadAt: string
}

type ReadStateState = {
  channels: Map<string, ChannelUnread>
  dms: Map<string, ChannelUnread>
  channelToServer: Map<string, string>
  channelViewSnapshots: Map<string, ChannelViewSnapshot>
  dmViewSnapshots: Map<string, ChannelViewSnapshot>
  fetchAll: () => Promise<void>
  ackServer: (serverId: string) => void
  ackChannel: (channelId: string) => void
  ackDm: (conversationId: string) => void
  incrementChannel: (channelId: string, isMention: boolean, serverId?: string, messageId?: string) => void
  incrementDm: (conversationId: string, messageId?: string) => void
  captureChannelView: (channelId: string) => void
  captureDmView: (conversationId: string) => void
  clearChannelView: (channelId: string) => void
  clearDmView: (conversationId: string) => void
  getServerUnread: (
    serverId: string,
    getEffective: (channelId: string, serverId?: string) => NotifLevel
  ) => { unread: boolean; mentions: number }
}

export const useReadStateStore = create<ReadStateState>()((set, get) => ({
  channels: new Map(),
  dms: new Map(),
  channelToServer: new Map(),
  channelViewSnapshots: new Map(),
  dmViewSnapshots: new Map(),

  fetchAll: async () => {
    try {
      const data = await api.getReadStates()
      const channels = new Map<string, ChannelUnread>()
      const dms = new Map<string, ChannelUnread>()
      const channelToServer = new Map<string, string>()
      for (const rs of data.channels) {
        channels.set(rs.channelId, {
          unreadCount: rs.unreadCount ?? 0,
          mentionCount: rs.mentionCount,
          lastReadAt: rs.lastReadAt,
          firstUnreadMessageId: rs.firstUnreadMessageId ?? null
        })
        if (rs.serverId) {
          channelToServer.set(rs.channelId, rs.serverId)
        }
      }
      for (const rs of data.dms) {
        dms.set(rs.conversationId, {
          unreadCount: rs.unreadCount ?? 0,
          mentionCount: rs.mentionCount,
          lastReadAt: rs.lastReadAt,
          firstUnreadMessageId: rs.firstUnreadMessageId ?? null
        })
      }
      const viewMode = useServerStore.getState().viewMode
      const activeChannelId = useChannelStore.getState().currentChannelId
      const activeConvId = useDmStore.getState().currentConversationId
      const channelViewSnapshots = new Map(get().channelViewSnapshots)
      const dmViewSnapshots = new Map(get().dmViewSnapshots)
      const zero = {
        unreadCount: 0,
        mentionCount: 0,
        lastReadAt: new Date().toISOString(),
        firstUnreadMessageId: null
      }

      if (viewMode === 'server' && activeChannelId && channels.has(activeChannelId)) {
        // Capture snapshot before zeroing so the divider/pill have something to render.
        if (!channelViewSnapshots.has(activeChannelId)) {
          const live = channels.get(activeChannelId)!
          channelViewSnapshots.set(activeChannelId, {
            unreadCount: live.unreadCount,
            firstUnreadMessageId: live.firstUnreadMessageId,
            lastReadAt: live.lastReadAt
          })
        }
        channels.set(activeChannelId, zero)
        api.ackChannel(activeChannelId).catch(() => {})
      }
      if (viewMode === 'dm' && activeConvId && dms.has(activeConvId)) {
        if (!dmViewSnapshots.has(activeConvId)) {
          const live = dms.get(activeConvId)!
          dmViewSnapshots.set(activeConvId, {
            unreadCount: live.unreadCount,
            firstUnreadMessageId: live.firstUnreadMessageId,
            lastReadAt: live.lastReadAt
          })
        }
        dms.set(activeConvId, zero)
        api.ackDm(activeConvId).catch(() => {})
      }

      set({ channels, dms, channelToServer, channelViewSnapshots, dmViewSnapshots })
    } catch {
      // ignore
    }
  },

  ackServer: (serverId) => {
    const { channels, channelToServer } = get()
    const updated = new Map(channels)
    for (const [chId, sid] of channelToServer) {
      if (sid !== serverId) continue
      updated.set(chId, {
        unreadCount: 0,
        mentionCount: 0,
        lastReadAt: new Date().toISOString(),
        firstUnreadMessageId: null
      })
    }
    set({ channels: updated })
    api.ackServer(serverId).catch(() => {})
  },

  ackChannel: (channelId) => {
    const channels = new Map(get().channels)
    channels.set(channelId, {
      unreadCount: 0,
      mentionCount: 0,
      lastReadAt: new Date().toISOString(),
      firstUnreadMessageId: null
    })
    set({ channels })
    api.ackChannel(channelId).catch(() => {})
  },

  ackDm: (conversationId) => {
    const dms = new Map(get().dms)
    dms.set(conversationId, {
      unreadCount: 0,
      mentionCount: 0,
      lastReadAt: new Date().toISOString(),
      firstUnreadMessageId: null
    })
    set({ dms })
    api.ackDm(conversationId).catch(() => {})
  },

  incrementChannel: (channelId, isMention, serverId?, messageId?) => {
    const channels = new Map(get().channels)
    const current = channels.get(channelId) ?? {
      unreadCount: 0,
      mentionCount: 0,
      lastReadAt: new Date(0).toISOString(),
      firstUnreadMessageId: null
    }
    channels.set(channelId, {
      ...current,
      unreadCount: current.unreadCount + 1,
      mentionCount: isMention ? current.mentionCount + 1 : current.mentionCount,
      // Capture the oldest unread message id so the "New Messages" divider
      // works on the user's next visit. Only set on the 0 -> 1 transition.
      firstUnreadMessageId: current.firstUnreadMessageId ?? messageId ?? null
    })
    const update: Partial<ReadStateState> = { channels }
    if (serverId && !get().channelToServer.has(channelId)) {
      const channelToServer = new Map(get().channelToServer)
      channelToServer.set(channelId, serverId)
      update.channelToServer = channelToServer
    }
    set(update)
  },

  incrementDm: (conversationId, messageId?) => {
    const dms = new Map(get().dms)
    const current = dms.get(conversationId) ?? {
      unreadCount: 0,
      mentionCount: 0,
      lastReadAt: new Date(0).toISOString(),
      firstUnreadMessageId: null
    }
    dms.set(conversationId, {
      ...current,
      unreadCount: current.unreadCount + 1,
      mentionCount: current.mentionCount + 1,
      firstUnreadMessageId: current.firstUnreadMessageId ?? messageId ?? null
    })
    set({ dms })
  },

  captureChannelView: (channelId) => {
    const { channels, channelViewSnapshots } = get()
    if (channelViewSnapshots.has(channelId)) return
    const live = channels.get(channelId)
    if (!live || live.unreadCount === 0 || !live.firstUnreadMessageId) return
    const next = new Map(channelViewSnapshots)
    next.set(channelId, {
      unreadCount: live.unreadCount,
      firstUnreadMessageId: live.firstUnreadMessageId,
      lastReadAt: live.lastReadAt
    })
    set({ channelViewSnapshots: next })
  },

  captureDmView: (conversationId) => {
    const { dms, dmViewSnapshots } = get()
    if (dmViewSnapshots.has(conversationId)) return
    const live = dms.get(conversationId)
    if (!live || live.unreadCount === 0 || !live.firstUnreadMessageId) return
    const next = new Map(dmViewSnapshots)
    next.set(conversationId, {
      unreadCount: live.unreadCount,
      firstUnreadMessageId: live.firstUnreadMessageId,
      lastReadAt: live.lastReadAt
    })
    set({ dmViewSnapshots: next })
  },

  clearChannelView: (channelId) => {
    const { channelViewSnapshots } = get()
    if (!channelViewSnapshots.has(channelId)) return
    const next = new Map(channelViewSnapshots)
    next.delete(channelId)
    set({ channelViewSnapshots: next })
  },

  clearDmView: (conversationId) => {
    const { dmViewSnapshots } = get()
    if (!dmViewSnapshots.has(conversationId)) return
    const next = new Map(dmViewSnapshots)
    next.delete(conversationId)
    set({ dmViewSnapshots: next })
  },

  getServerUnread: (serverId, getEffective) => {
    const { channels, channelToServer } = get()
    let mentions = 0
    let unread = false
    for (const [channelId, sid] of channelToServer) {
      if (sid !== serverId) continue
      const rs = channels.get(channelId)
      if (!rs) continue
      const badge = computeChannelBadge(rs, getEffective(channelId, serverId), false)
      if (badge.hasIndicator) unread = true
      mentions += badge.mentionCount
    }
    return { unread, mentions }
  }
}))
