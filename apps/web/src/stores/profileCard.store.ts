import type { FriendshipStatusResponse } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'

export type MutualServer = { id: string; name: string; iconUrl: string | null }
export type MutualFriend = {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  status: string
}

export type ProfileCardDetail = {
  mutualServers: MutualServer[]
  mutualFriends: MutualFriend[]
  friendshipStatus: FriendshipStatusResponse | null
  fetchedAt: number
}

/** How long a cached entry is served without a background refresh. */
const FRESH_MS = 60_000

type ProfileCardState = {
  cache: Map<string, ProfileCardDetail>
  inflight: Map<string, Promise<ProfileCardDetail>>
  /** Returns a cached detail immediately if present (may be stale). */
  peek: (userId: string) => ProfileCardDetail | undefined
  /**
   * Loads a user's profile-card detail with stale-while-revalidate semantics:
   * fresh cache is returned as-is, stale cache triggers a background refresh,
   * and concurrent callers share one in-flight request.
   */
  load: (userId: string, opts?: { isBot?: boolean; force?: boolean }) => Promise<ProfileCardDetail>
}

async function fetchDetail(userId: string, isBot: boolean): Promise<ProfileCardDetail> {
  const [servers, friends, friendship] = await Promise.all([
    api.getMutualServers(userId).then((r) => r.servers).catch(() => [] as MutualServer[]),
    isBot
      ? Promise.resolve([] as MutualFriend[])
      : api.getMutualFriends(userId).then((r) => r.friends).catch(() => [] as MutualFriend[]),
    isBot
      ? Promise.resolve(null)
      : api.getFriendshipStatus(userId).catch(() => null)
  ])
  return {
    mutualServers: servers,
    mutualFriends: friends,
    friendshipStatus: friendship,
    fetchedAt: Date.now()
  }
}

export const useProfileCardStore = create<ProfileCardState>((set, get) => ({
  cache: new Map(),
  inflight: new Map(),

  peek: (userId) => get().cache.get(userId),

  load: (userId, opts = {}) => {
    const { isBot = false, force = false } = opts
    const cached = get().cache.get(userId)
    const isFresh = cached && Date.now() - cached.fetchedAt < FRESH_MS

    if (cached && isFresh && !force) return Promise.resolve(cached)

    const existing = get().inflight.get(userId)
    if (existing && !force) return existing

    const promise = fetchDetail(userId, isBot)
      .then((detail) => {
        set((s) => {
          const cache = new Map(s.cache)
          cache.set(userId, detail)
          const inflight = new Map(s.inflight)
          inflight.delete(userId)
          return { cache, inflight }
        })
        return detail
      })
      .catch((err) => {
        set((s) => {
          const inflight = new Map(s.inflight)
          inflight.delete(userId)
          return { inflight }
        })
        throw err
      })

    set((s) => {
      const inflight = new Map(s.inflight)
      inflight.set(userId, promise)
      return { inflight }
    })

    // Stale cache: serve it immediately, let the refresh update in the background.
    if (cached && !force) return Promise.resolve(cached)
    return promise
  }
}))

/** Fire-and-forget prefetch, e.g. on row hover, to warm the cache. */
export function prefetchProfileCard(userId: string, isBot = false) {
  void useProfileCardStore.getState().load(userId, { isBot }).catch(() => {})
}
