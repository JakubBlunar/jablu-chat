import type { Channel } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'

type ChannelState = {
  channels: Channel[]
  currentChannelId: string | null
  isLoading: boolean
  loadedServerId: string | null
  fetchChannels: (serverId: string) => Promise<void>
  setCurrentChannel: (id: string | null) => void
  getCurrentChannel: () => Channel | null
  textChannels: () => Channel[]
  voiceChannels: () => Channel[]
  addChannel: (channel: Channel) => void
  updateChannel: (channel: Channel) => void
  removeChannel: (channelId: string) => void
  adjustPinnedCount: (channelId: string, delta: number) => void
  applyReorder: (channelIds: string[]) => void
}

function byPosition(a: Channel, b: Channel): number {
  return a.position - b.position
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  channels: [],
  currentChannelId: null,
  isLoading: false,
  loadedServerId: null,

  fetchChannels: async (serverId) => {
    const prev = get().loadedServerId
    if (prev !== serverId) {
      set({ channels: [], isLoading: true, loadedServerId: serverId })
    } else {
      set({ isLoading: true })
    }
    try {
      const list = await api.get<Channel[]>(`/api/servers/${serverId}/channels`)
      set({ channels: list, isLoading: false, loadedServerId: serverId })
    } catch (e) {
      set({ isLoading: false })
      throw e
    }
  },

  setCurrentChannel: (id) => set({ currentChannelId: id }),

  getCurrentChannel: () => {
    const { channels, currentChannelId } = get()
    if (!currentChannelId) return null
    return channels.find((c) => c.id === currentChannelId) ?? null
  },

  textChannels: () =>
    get()
      .channels.filter((c) => c.type === 'text')
      .slice()
      .sort(byPosition),

  voiceChannels: () =>
    get()
      .channels.filter((c) => c.type === 'voice')
      .slice()
      .sort(byPosition),

  addChannel: (channel) =>
    set((s) => {
      if (s.channels.some((c) => c.id === channel.id)) return s
      return { channels: [...s.channels, channel] }
    }),

  updateChannel: (channel) =>
    set((s) => ({
      channels: s.channels.map((c) => (c.id === channel.id ? { ...c, ...channel } : c))
    })),

  removeChannel: (channelId) =>
    set((s) => ({
      channels: s.channels.filter((c) => c.id !== channelId),
      currentChannelId: s.currentChannelId === channelId ? null : s.currentChannelId
    })),

  adjustPinnedCount: (channelId, delta) =>
    set((state) => ({
      channels: state.channels.map((c) =>
        c.id === channelId ? { ...c, pinnedCount: Math.max(0, (c.pinnedCount ?? 0) + delta) } : c
      )
    })),

  applyReorder: (channelIds) =>
    set((state) => ({
      channels: state.channels.map((c) => {
        const idx = channelIds.indexOf(c.id)
        return idx >= 0 ? { ...c, position: idx } : c
      })
    }))
}))
