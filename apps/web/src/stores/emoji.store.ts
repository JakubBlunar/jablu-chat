import { create } from 'zustand'
import { api } from '@/lib/api'
import type { CustomEmoji } from '@/lib/api/types'

export const EMPTY_EMOJIS: CustomEmoji[] = []

const nameMapCache = new WeakMap<CustomEmoji[], Map<string, CustomEmoji>>()

export function buildNameMap(emojis: CustomEmoji[]): Map<string, CustomEmoji> {
  const cached = nameMapCache.get(emojis)
  if (cached) return cached
  const map = new Map<string, CustomEmoji>()
  for (const e of emojis) {
    map.set(e.name.toLowerCase(), e)
  }
  nameMapCache.set(emojis, map)
  return map
}

interface EmojiState {
  byServer: Record<string, CustomEmoji[]>
  fetch: (serverId: string) => Promise<void>
  getForServer: (serverId: string) => CustomEmoji[]
  findByName: (serverId: string, name: string) => CustomEmoji | undefined
  getNameMap: (serverId: string) => Map<string, CustomEmoji>
}

export const useEmojiStore = create<EmojiState>((set, get) => ({
  byServer: {},

  fetch: async (serverId: string) => {
    try {
      const emojis = await api.getEmojis(serverId)
      set((s) => ({ byServer: { ...s.byServer, [serverId]: emojis } }))
    } catch {
      // ignore fetch failures
    }
  },

  getForServer: (serverId: string) => {
    return get().byServer[serverId] ?? EMPTY_EMOJIS
  },

  findByName: (serverId: string, name: string) => {
    const emojis = get().byServer[serverId]
    if (!emojis) return undefined
    const lower = name.toLowerCase()
    return emojis.find((e) => e.name.toLowerCase() === lower)
  },

  getNameMap: (serverId: string) => {
    const emojis = get().byServer[serverId] ?? EMPTY_EMOJIS
    return buildNameMap(emojis)
  }
}))
