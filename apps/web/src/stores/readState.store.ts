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
}

type ReadStateState = {
  channels: Map<string, ChannelUnread>
  dms: Map<string, ChannelUnread>
  channelToServer: Map<string, string>
  fetchAll: () => Promise<void>
  ackServer: (serverId: string) => void
  ackChannel: (channelId: string) => void
  ackDm: (conversationId: string) => void
  incrementChannel: (channelId: string, isMention: boolean, serverId?: string) => void
  incrementDm: (conversationId: string) => void
  getServerUnread: (
    serverId: string,
    getEffective: (channelId: string, serverId?: string) => NotifLevel
  ) => { unread: boolean; mentions: number }
}

export const useReadStateStore = create<ReadStateState>()((set, get) => ({
  channels: new Map(),
  dms: new Map(),
  channelToServer: new Map(),

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
          lastReadAt: rs.lastReadAt
        })
        if (rs.serverId) {
          channelToServer.set(rs.channelId, rs.serverId)
        }
      }
      for (const rs of data.dms) {
        dms.set(rs.conversationId, {
          unreadCount: rs.unreadCount ?? 0,
          mentionCount: rs.mentionCount,
          lastReadAt: rs.lastReadAt
        })
      }
      const viewMode = useServerStore.getState().viewMode
      const activeChannelId = useChannelStore.getState().currentChannelId
      const activeConvId = useDmStore.getState().currentConversationId
      const zero = { unreadCount: 0, mentionCount: 0, lastReadAt: new Date().toISOString() }

      if (viewMode === 'server' && activeChannelId && channels.has(activeChannelId)) {
        channels.set(activeChannelId, zero)
        api.ackChannel(activeChannelId).catch(() => {})
      }
      if (viewMode === 'dm' && activeConvId && dms.has(activeConvId)) {
        dms.set(activeConvId, zero)
        api.ackDm(activeConvId).catch(() => {})
      }

      set({ channels, dms, channelToServer })
    } catch {
      // ignore
    }
  },

  ackServer: (serverId) => {
    const { channels, channelToServer } = get()
    const updated = new Map(channels)
    for (const [chId, sid] of channelToServer) {
      if (sid !== serverId) continue
      updated.set(chId, { unreadCount: 0, mentionCount: 0, lastReadAt: new Date().toISOString() })
    }
    set({ channels: updated })
    api.ackServer(serverId).catch(() => {})
  },

  ackChannel: (channelId) => {
    const channels = new Map(get().channels)
    channels.set(channelId, {
      unreadCount: 0,
      mentionCount: 0,
      lastReadAt: new Date().toISOString()
    })
    set({ channels })
    api.ackChannel(channelId).catch(() => {})
  },

  ackDm: (conversationId) => {
    const dms = new Map(get().dms)
    dms.set(conversationId, {
      unreadCount: 0,
      mentionCount: 0,
      lastReadAt: new Date().toISOString()
    })
    set({ dms })
    api.ackDm(conversationId).catch(() => {})
  },

  incrementChannel: (channelId, isMention, serverId?) => {
    const channels = new Map(get().channels)
    const current = channels.get(channelId) ?? {
      unreadCount: 0,
      mentionCount: 0,
      lastReadAt: new Date(0).toISOString()
    }
    channels.set(channelId, {
      ...current,
      unreadCount: current.unreadCount + 1,
      mentionCount: isMention ? current.mentionCount + 1 : current.mentionCount
    })
    const update: Partial<ReadStateState> = { channels }
    if (serverId && !get().channelToServer.has(channelId)) {
      const channelToServer = new Map(get().channelToServer)
      channelToServer.set(channelId, serverId)
      update.channelToServer = channelToServer
    }
    set(update)
  },

  incrementDm: (conversationId) => {
    const dms = new Map(get().dms)
    const current = dms.get(conversationId) ?? {
      unreadCount: 0,
      mentionCount: 0,
      lastReadAt: new Date(0).toISOString()
    }
    dms.set(conversationId, {
      ...current,
      unreadCount: current.unreadCount + 1,
      mentionCount: current.mentionCount + 1
    })
    set({ dms })
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
