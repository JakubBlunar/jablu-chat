import { useFriendStore } from './friend.store'

jest.mock('@/lib/api', () => ({
  api: {
    getFriends: jest.fn(),
    getPendingFriendRequests: jest.fn(),
    sendFriendRequest: jest.fn(),
    acceptFriendRequest: jest.fn(),
    declineFriendRequest: jest.fn(),
    cancelFriendRequest: jest.fn(),
    removeFriend: jest.fn()
  }
}))

jest.mock('./member.store', () => ({
  useMemberStore: {
    getState: () => ({
      onlineUserIds: new Set(['u-online']),
      realtimeStatuses: new Map([['u-online', 'dnd']])
    })
  }
}))

import { api } from '@/lib/api'

function resetStore() {
  useFriendStore.setState({ friends: [], pending: [], isLoading: false })
}

beforeEach(() => {
  resetStore()
  jest.clearAllMocks()
})

const makeFriend = (overrides: Record<string, unknown> = {}) => ({
  id: 'u-1',
  username: 'alice',
  displayName: null,
  avatarUrl: null,
  friendshipId: 'fs-1',
  status: 'online' as const,
  ...overrides
})

describe('friend.store', () => {
  describe('fetchFriends', () => {
    it('patches status from member store online/realtime data', async () => {
      jest.mocked(api.getFriends).mockResolvedValueOnce([
        makeFriend({ id: 'u-online', status: 'online' }),
        makeFriend({ id: 'u-offline', friendshipId: 'fs-2', status: 'online' })
      ])

      await useFriendStore.getState().fetchFriends()

      const friends = useFriendStore.getState().friends
      expect(friends.find((f) => f.id === 'u-online')!.status).toBe('dnd')
      expect(friends.find((f) => f.id === 'u-offline')!.status).toBe('offline')
    })

    it('sets isLoading during fetch', async () => {
      jest.mocked(api.getFriends).mockResolvedValueOnce([])
      const promise = useFriendStore.getState().fetchFriends()
      expect(useFriendStore.getState().isLoading).toBe(true)
      await promise
      expect(useFriendStore.getState().isLoading).toBe(false)
    })
  })

  describe('addFriend', () => {
    it('prepends a new friend', () => {
      useFriendStore.setState({ friends: [makeFriend({ id: 'u-1' })] })
      useFriendStore.getState().addFriend(makeFriend({ id: 'u-2', friendshipId: 'fs-2' }) as any)
      expect(useFriendStore.getState().friends).toHaveLength(2)
      expect(useFriendStore.getState().friends[0].id).toBe('u-2')
    })

    it('deduplicates by id', () => {
      useFriendStore.setState({ friends: [makeFriend({ id: 'u-1' })] })
      useFriendStore.getState().addFriend(makeFriend({ id: 'u-1' }) as any)
      expect(useFriendStore.getState().friends).toHaveLength(1)
    })
  })

  describe('removeFriend', () => {
    it('optimistically removes and calls API', async () => {
      jest.mocked(api.removeFriend).mockResolvedValueOnce(undefined)
      useFriendStore.setState({ friends: [makeFriend({ friendshipId: 'fs-1' })] })

      await useFriendStore.getState().removeFriend('fs-1')
      expect(useFriendStore.getState().friends).toHaveLength(0)
      expect(api.removeFriend).toHaveBeenCalledWith('fs-1')
    })
  })

  describe('addPendingRequest', () => {
    it('prepends and deduplicates', () => {
      const req = { friendshipId: 'fs-1', userId: 'u-1', username: 'alice' } as any
      useFriendStore.getState().addPendingRequest(req)
      expect(useFriendStore.getState().pending).toHaveLength(1)

      useFriendStore.getState().addPendingRequest(req)
      expect(useFriendStore.getState().pending).toHaveLength(1)
    })
  })

  describe('acceptRequest', () => {
    it('removes from pending and re-fetches friends', async () => {
      jest.mocked(api.acceptFriendRequest).mockResolvedValueOnce(undefined)
      jest.mocked(api.getFriends).mockResolvedValueOnce([])
      useFriendStore.setState({ pending: [{ friendshipId: 'fs-1' } as any] })

      await useFriendStore.getState().acceptRequest('fs-1')
      expect(useFriendStore.getState().pending).toHaveLength(0)
      expect(api.acceptFriendRequest).toHaveBeenCalledWith('fs-1')
    })
  })

  describe('updateFriendStatus', () => {
    it('updates matching friend status', () => {
      useFriendStore.setState({ friends: [makeFriend({ id: 'u-1', status: 'online' })] })
      useFriendStore.getState().updateFriendStatus('u-1', 'idle')
      expect(useFriendStore.getState().friends[0].status).toBe('idle')
    })

    it('no-ops for unknown user', () => {
      useFriendStore.setState({ friends: [makeFriend()] })
      useFriendStore.getState().updateFriendStatus('unknown', 'idle')
      expect(useFriendStore.getState().friends[0].status).toBe('online')
    })
  })
})
