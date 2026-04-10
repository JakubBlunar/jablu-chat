import type { Channel, ChannelCategory } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'

type ChannelState = {
  channels: Channel[]
  categories: ChannelCategory[]
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
  setCategories: (categories: ChannelCategory[]) => void
  addCategory: (category: ChannelCategory) => void
  updateCategory: (category: ChannelCategory) => void
  removeCategory: (categoryId: string) => void
  applyCategoryReorder: (categoryIds: string[]) => void
}

function byPosition(a: { position: number }, b: { position: number }): number {
  return a.position - b.position
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  channels: [],
  categories: [],
  currentChannelId: null,
  isLoading: false,
  loadedServerId: null,

  fetchChannels: async (serverId) => {
    const prev = get().loadedServerId
    if (prev !== serverId) {
      set({ channels: [], categories: [], isLoading: true, loadedServerId: serverId })
    } else {
      set({ isLoading: true })
    }
    try {
      const [channels, categories] = await Promise.all([
        api.get<Channel[]>(`/api/servers/${serverId}/channels`),
        api.get<ChannelCategory[]>(`/api/servers/${serverId}/categories`)
      ])
      set({ channels, categories, isLoading: false, loadedServerId: serverId })
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
    })),

  setCategories: (categories) => set({ categories }),

  addCategory: (category) =>
    set((s) => {
      if (s.categories.some((c) => c.id === category.id)) return s
      return { categories: [...s.categories, category] }
    }),

  updateCategory: (category) =>
    set((s) => ({
      categories: s.categories.map((c) => (c.id === category.id ? { ...c, ...category } : c))
    })),

  removeCategory: (categoryId) =>
    set((s) => ({
      categories: s.categories.filter((c) => c.id !== categoryId),
      channels: s.channels.map((c) => (c.categoryId === categoryId ? { ...c, categoryId: null } : c))
    })),

  applyCategoryReorder: (categoryIds) =>
    set((state) => ({
      categories: state.categories.map((c) => {
        const idx = categoryIds.indexOf(c.id)
        return idx >= 0 ? { ...c, position: idx } : c
      })
    }))
}))
