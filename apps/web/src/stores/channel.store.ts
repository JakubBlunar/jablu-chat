import type { Channel, ChannelCategory } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'
import { getChannels, putChannels } from '@/lib/cache/structureCache'

type ChannelState = {
  channels: Channel[]
  categories: ChannelCategory[]
  currentChannelId: string | null
  isLoading: boolean
  loadedServerId: string | null
  fetchChannels: (serverId: string) => Promise<void>
  hydrateFromCache: (serverId: string) => boolean
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

  /**
   * Show a previously loaded server's sidebar immediately. Callers are
   * expected to follow up with `fetchChannels` to revalidate.
   */
  hydrateFromCache: (serverId) => {
    const entry = getChannels(serverId)
    if (!entry) return false
    set({
      channels: entry.channels,
      categories: entry.categories,
      isLoading: false,
      loadedServerId: serverId
    })
    return true
  },

  fetchChannels: async (serverId) => {
    const prev = get().loadedServerId
    if (prev !== serverId) {
      // Blanking the list is only right when there is nothing to show; a
      // cache hit has already put this server's channels on screen.
      const cached = getChannels(serverId)
      set({
        channels: cached?.channels ?? [],
        categories: cached?.categories ?? [],
        isLoading: true,
        loadedServerId: serverId
      })
    } else {
      set({ isLoading: true })
    }
    try {
      const [channels, categories] = await Promise.all([
        api.get<Channel[]>(`/api/servers/${serverId}/channels`),
        api.get<ChannelCategory[]>(`/api/servers/${serverId}/categories`)
      ])
      putChannels(serverId, channels, categories)
      // A slower response for a server the user already navigated away from
      // must not overwrite what is on screen; it is still worth caching.
      if (get().loadedServerId !== serverId) return
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

/**
 * Mirror the loaded server's sidebar into the cache. Doing it here rather than
 * in each action means socket-driven creates, renames and reorders are cached
 * too, so returning to a server never shows a stale channel list.
 */
useChannelStore.subscribe((state, prev) => {
  if (!state.loadedServerId || state.isLoading) return
  if (state.channels === prev.channels && state.categories === prev.categories) return
  putChannels(state.loadedServerId, state.channels, state.categories)
})
