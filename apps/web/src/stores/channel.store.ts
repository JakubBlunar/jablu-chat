import type { Channel, ChannelCategory } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'
import { evictServer, getChannels, putChannels } from '@/lib/cache/structureCache'
import { createActiveResourceRequest } from '@/lib/activeResourceRequest'

const channelRequests = createActiveResourceRequest<{ channels: Channel[]; categories: ChannelCategory[] }>()

type ChannelState = {
  channels: Channel[]
  categories: ChannelCategory[]
  currentChannelId: string | null
  isLoading: boolean
  loadedServerId: string | null
  requestedServerId: string | null
  clear: () => void
  fetchChannels: (serverId: string, fresh?: boolean) => Promise<void>
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
  requestedServerId: null,
  clear: () => {
    channelRequests.cancel()
    set({ channels: [], categories: [], currentChannelId: null, isLoading: false, loadedServerId: null, requestedServerId: null })
  },

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

  fetchChannels: (serverId, fresh = false) => {
    if (fresh) evictServer(serverId)
    return channelRequests.run(serverId, async (signal) => {
      const [channels, categories] = await Promise.all([
        api.get<Channel[]>(`/api/servers/${serverId}/channels`, { signal }),
        api.get<ChannelCategory[]>(`/api/servers/${serverId}/categories`, { signal })
      ])
      return { channels, categories }
  }, {
    start: () => {
      const cached = getChannels(serverId)
      set({ ...(get().loadedServerId !== serverId || fresh ? { channels: cached?.channels ?? [], categories: cached?.categories ?? [] } : {}),
        isLoading: true, loadedServerId: serverId, requestedServerId: serverId })
    },
    commit: ({ channels, categories }) => {
      putChannels(serverId, channels, categories)
      set({ channels, categories, isLoading: false, loadedServerId: serverId })
    },
    fail: (error) => {
      if ([401, 403, 404].includes((error as { status?: number })?.status ?? 0)) {
        evictServer(serverId)
        set({ channels: [], categories: [] })
      }
      set({ isLoading: false })
    }
    }, fresh)
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
