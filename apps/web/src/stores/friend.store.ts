import type { Friend, FriendRequest } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'
import { useMemberStore } from './member.store'

interface FriendState {
  friends: Friend[]
  pending: FriendRequest[]
  isLoading: boolean

  fetchFriends: () => Promise<void>
  fetchPending: () => Promise<void>
  sendRequest: (userId: string) => Promise<string>
  acceptRequest: (friendshipId: string) => Promise<void>
  declineRequest: (friendshipId: string) => Promise<void>
  cancelRequest: (friendshipId: string) => Promise<void>
  removeFriend: (friendshipId: string) => Promise<void>

  addFriend: (friend: Friend) => void
  addPendingRequest: (req: FriendRequest) => void
  removePending: (friendshipId: string) => void
  removeFriendByFriendshipId: (friendshipId: string) => void
  updateFriendStatus: (userId: string, status: Friend['status']) => void
}

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  pending: [],
  isLoading: false,

  fetchFriends: async () => {
    set({ isLoading: true })
    try {
      const friends = await api.getFriends()
      const { onlineUserIds, realtimeStatuses } = useMemberStore.getState()
      const patched = friends.map((f) => {
        if (!onlineUserIds.has(f.id)) return f.status === 'offline' ? f : { ...f, status: 'offline' as const }
        const rt = realtimeStatuses.get(f.id)
        const status =
          rt === 'offline' ? ('offline' as const) : rt === 'idle' || rt === 'dnd' ? rt : ('online' as const)
        return f.status === status ? f : { ...f, status: status as Friend['status'] }
      })
      set({ friends: patched })
    } finally {
      set({ isLoading: false })
    }
  },

  fetchPending: async () => {
    try {
      const pending = await api.getPendingFriendRequests()
      set({ pending })
    } catch {
      /* ignore */
    }
  },

  sendRequest: async (userId: string) => {
    const res = await api.sendFriendRequest(userId)
    await get().fetchPending()
    return res.friendshipId
  },

  acceptRequest: async (friendshipId: string) => {
    set((s) => ({ pending: s.pending.filter((p) => p.friendshipId !== friendshipId) }))
    await api.acceptFriendRequest(friendshipId)
    await get().fetchFriends()
  },

  declineRequest: async (friendshipId: string) => {
    set((s) => ({ pending: s.pending.filter((p) => p.friendshipId !== friendshipId) }))
    await api.declineFriendRequest(friendshipId)
  },

  cancelRequest: async (friendshipId: string) => {
    set((s) => ({ pending: s.pending.filter((p) => p.friendshipId !== friendshipId) }))
    await api.cancelFriendRequest(friendshipId)
  },

  removeFriend: async (friendshipId: string) => {
    set((s) => ({ friends: s.friends.filter((f) => f.friendshipId !== friendshipId) }))
    await api.removeFriend(friendshipId)
  },

  addFriend: (friend: Friend) => {
    set((s) => {
      if (s.friends.some((f) => f.id === friend.id)) return s
      return { friends: [friend, ...s.friends] }
    })
  },

  addPendingRequest: (req: FriendRequest) => {
    set((s) => {
      if (s.pending.some((p) => p.friendshipId === req.friendshipId)) return s
      return { pending: [req, ...s.pending] }
    })
  },

  removePending: (friendshipId: string) => {
    set((s) => ({ pending: s.pending.filter((p) => p.friendshipId !== friendshipId) }))
  },

  removeFriendByFriendshipId: (friendshipId: string) => {
    set((s) => ({ friends: s.friends.filter((f) => f.friendshipId !== friendshipId) }))
  },

  updateFriendStatus: (userId: string, status: Friend['status']) => {
    set((s) => {
      const idx = s.friends.findIndex((f) => f.id === userId)
      if (idx === -1) return s
      const updated = [...s.friends]
      updated[idx] = { ...updated[idx], status }
      return { friends: updated }
    })
  }
}))
