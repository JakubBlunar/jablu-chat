import { create } from 'zustand'
import { api } from '@/lib/api'

interface GifState {
  enabled: boolean
  fetched: boolean
  fetch: () => Promise<void>
}

export const useGifStore = create<GifState>((set, get) => ({
  enabled: false,
  fetched: false,

  fetch: async () => {
    if (get().fetched) return
    try {
      const { enabled } = await api.getGifEnabled()
      set({ enabled, fetched: true })
    } catch {
      set({ fetched: true })
    }
  },
}))
