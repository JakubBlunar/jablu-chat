import { create } from 'zustand'
import { api } from '@/lib/api'
import { computeChannelBadge, type NotifLevel } from '@/lib/unread'

type ChannelUnread = {
  unreadCount: number
  mentionCount: number
  lastReadAt: string
  firstUnreadMessageId: string | null
}

/**
 * Keeps the first-unread marker stable while reading history. Cleared when
 * the reader reaches the latest messages, leaves, or explicitly marks read.
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
  ackServer: (serverId: string) => Promise<boolean>
  ackChannel: (channelId: string) => Promise<boolean>
  ackDm: (conversationId: string) => Promise<boolean>
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
      const channelViewSnapshots = new Map(get().channelViewSnapshots)
      const dmViewSnapshots = new Map(get().dmViewSnapshots)
      for (const id of channelViewSnapshots.keys()) {
        if (channels.get(id)?.unreadCount === 0) channelViewSnapshots.delete(id)
      }
      for (const id of dmViewSnapshots.keys()) {
        if (dms.get(id)?.unreadCount === 0) dmViewSnapshots.delete(id)
      }
      set({ channels, dms, channelToServer, channelViewSnapshots, dmViewSnapshots })
    } catch (error) {
      console.error('Failed to refresh unread state', error)
    }
  },

  ackServer: async (serverId) => {
    const previous = get().channels
    try {
      await api.ackServer(serverId)
    } catch (error) {
      console.error('Failed to mark server as read', error)
      return false
    }
    const { channels, channelToServer } = get()
    const updated = new Map(channels)
    const channelViewSnapshots = new Map(get().channelViewSnapshots)
    for (const [chId, sid] of channelToServer) {
      if (sid !== serverId || channels.get(chId) !== previous.get(chId)) continue
      updated.set(chId, {
        unreadCount: 0,
        mentionCount: 0,
        lastReadAt: new Date().toISOString(),
        firstUnreadMessageId: null
      })
      channelViewSnapshots.delete(chId)
    }
    set({ channels: updated, channelViewSnapshots })
    return true
  },

  ackChannel: async (channelId) => {
    const previous = get().channels.get(channelId)
    try {
      await api.ackChannel(channelId)
    } catch (error) {
      console.error('Failed to mark channel as read', error)
      return false
    }
    if (get().channels.get(channelId) !== previous) return false
    if (previous?.unreadCount === 0 && previous.mentionCount === 0) {
      if (get().channelViewSnapshots.has(channelId)) get().clearChannelView(channelId)
      return true
    }
    const channels = new Map(get().channels)
    channels.set(channelId, {
      unreadCount: 0,
      mentionCount: 0,
      lastReadAt: new Date().toISOString(),
      firstUnreadMessageId: null
    })
    const channelViewSnapshots = new Map(get().channelViewSnapshots)
    channelViewSnapshots.delete(channelId)
    set({ channels, channelViewSnapshots })
    return true
  },

  ackDm: async (conversationId) => {
    const previous = get().dms.get(conversationId)
    try {
      await api.ackDm(conversationId)
    } catch (error) {
      console.error('Failed to mark DM as read', error)
      return false
    }
    if (get().dms.get(conversationId) !== previous) return false
    if (previous?.unreadCount === 0 && previous.mentionCount === 0) {
      if (get().dmViewSnapshots.has(conversationId)) get().clearDmView(conversationId)
      return true
    }
    const dms = new Map(get().dms)
    dms.set(conversationId, {
      unreadCount: 0,
      mentionCount: 0,
      lastReadAt: new Date().toISOString(),
      firstUnreadMessageId: null
    })
    const dmViewSnapshots = new Map(get().dmViewSnapshots)
    dmViewSnapshots.delete(conversationId)
    set({ dms, dmViewSnapshots })
    return true
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
      const badge = computeChannelBadge(rs, getEffective(channelId, serverId))
      if (badge.hasIndicator) unread = true
      mentions += badge.mentionCount
    }
    return { unread, mentions }
  }
}))
