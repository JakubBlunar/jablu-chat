import { createPresenceHandlers } from './presenceHandlers'
import { useAuthStore } from '@/stores/auth.store'
import { useFriendStore } from '@/stores/friend.store'
import { useMemberStore } from '@/stores/member.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useServerStore } from '@/stores/server.store'

function resetStores() {
  useAuthStore.setState({ user: { id: 'me', status: 'online' }, setUser: jest.fn() } as any)
  useMemberStore.setState({
    setUserOnline: jest.fn(),
    setUserOffline: jest.fn(),
    setUserStatus: jest.fn(),
    setUserCustomStatus: jest.fn(),
    initOnlineUsers: jest.fn(),
    mergeFriendsPresence: jest.fn(),
    addMember: jest.fn(),
  } as any)
  useFriendStore.setState({
    friends: [],
    updateFriendStatus: jest.fn(),
  } as any)
  useReadStateStore.setState({ fetchAll: jest.fn() } as any)
  useNotifPrefStore.setState({ fetchAll: jest.fn() } as any)
  useServerStore.setState({ currentServerId: 's1' } as any)
}

let handlers: ReturnType<typeof createPresenceHandlers>

beforeEach(() => {
  resetStores()
  jest.clearAllMocks()
  jest.useFakeTimers()
  handlers = createPresenceHandlers()
})

afterEach(() => {
  handlers.cleanup()
  jest.useRealTimers()
})

describe('onUserOnline', () => {
  it('sets user online in member and friend stores', () => {
    handlers.onUserOnline({ userId: 'u1' })

    expect(useMemberStore.getState().setUserOnline).toHaveBeenCalledWith('u1')
    expect(useMemberStore.getState().setUserStatus).toHaveBeenCalledWith('u1', 'online')
    expect(useFriendStore.getState().updateFriendStatus).toHaveBeenCalledWith('u1', 'online')
  })

  it('cancels pending offline timer', () => {
    handlers.onUserOffline({ userId: 'u1' })
    handlers.onUserOnline({ userId: 'u1' })

    jest.advanceTimersByTime(6000)

    expect(useMemberStore.getState().setUserOffline).not.toHaveBeenCalled()
  })

  it('mirrors status to auth store for current user', () => {
    handlers.onUserOnline({ userId: 'me' })

    expect(useAuthStore.getState().setUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'me', status: 'online' })
    )
  })
})

describe('onUserOffline', () => {
  it('debounces offline by 5 seconds', () => {
    handlers.onUserOffline({ userId: 'u1' })

    expect(useMemberStore.getState().setUserOffline).not.toHaveBeenCalled()

    jest.advanceTimersByTime(5000)

    expect(useMemberStore.getState().setUserOffline).toHaveBeenCalledWith('u1')
    expect(useFriendStore.getState().updateFriendStatus).toHaveBeenCalledWith('u1', 'offline')
  })

  it('resets timer on repeated offline events', () => {
    handlers.onUserOffline({ userId: 'u1' })

    jest.advanceTimersByTime(3000)
    handlers.onUserOffline({ userId: 'u1' })

    jest.advanceTimersByTime(3000)
    expect(useMemberStore.getState().setUserOffline).not.toHaveBeenCalled()

    jest.advanceTimersByTime(2000)
    expect(useMemberStore.getState().setUserOffline).toHaveBeenCalledTimes(1)
  })
})

describe('onUserStatus', () => {
  it('updates status in member and friend stores', () => {
    handlers.onUserStatus({ userId: 'u1', status: 'dnd' })

    expect(useMemberStore.getState().setUserStatus).toHaveBeenCalledWith('u1', 'dnd')
    expect(useFriendStore.getState().updateFriendStatus).toHaveBeenCalledWith('u1', 'dnd')
  })

  it('mirrors to auth store for current user', () => {
    handlers.onUserStatus({ userId: 'me', status: 'idle' })

    expect(useAuthStore.getState().setUser).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'idle' })
    )
  })

  it('does not update auth store for other users', () => {
    handlers.onUserStatus({ userId: 'other', status: 'dnd' })

    expect(useAuthStore.getState().setUser).not.toHaveBeenCalled()
  })
})

describe('onUserCustomStatus', () => {
  it('updates custom status in member store', () => {
    handlers.onUserCustomStatus({ userId: 'u1', customStatus: 'Working' })

    expect(useMemberStore.getState().setUserCustomStatus).toHaveBeenCalledWith('u1', 'Working')
  })

  it('mirrors to auth store for current user', () => {
    handlers.onUserCustomStatus({ userId: 'me', customStatus: 'AFK' })

    expect(useAuthStore.getState().setUser).toHaveBeenCalledWith(
      expect.objectContaining({ customStatus: 'AFK' })
    )
  })
})

describe('onPresenceInit', () => {
  it('initializes online users and fetches read states and prefs', () => {
    handlers.onPresenceInit({ onlineUserIds: ['u1', 'u2'] })

    expect(useMemberStore.getState().initOnlineUsers).toHaveBeenCalledWith(['u1', 'u2'])
    expect(useReadStateStore.getState().fetchAll).toHaveBeenCalled()
    expect(useNotifPrefStore.getState().fetchAll).toHaveBeenCalled()
  })
})

describe('onFriendsPresence', () => {
  it('merges friends presence into member store', () => {
    handlers.onFriendsPresence({ onlineFriendIds: ['f1'], friendStatuses: { f1: 'idle' } })

    expect(useMemberStore.getState().mergeFriendsPresence).toHaveBeenCalledWith(
      ['f1'],
      { f1: 'idle' }
    )
  })

  it('marks offline friends as offline', () => {
    useFriendStore.setState({
      friends: [{ id: 'f1' }, { id: 'f2' }] as any,
      updateFriendStatus: jest.fn(),
    } as any)

    handlers.onFriendsPresence({ onlineFriendIds: ['f1'] })

    const updateFn = useFriendStore.getState().updateFriendStatus as jest.Mock
    expect(updateFn).toHaveBeenCalledWith('f1', 'online')
    expect(updateFn).toHaveBeenCalledWith('f2', 'offline')
  })
})

describe('onMemberJoined', () => {
  it('adds member when server matches', () => {
    const member = { userId: 'u2', user: { isBot: false } } as any
    handlers.onMemberJoined({ serverId: 's1', member })

    expect(useMemberStore.getState().addMember).toHaveBeenCalledWith(member)
    expect(useMemberStore.getState().setUserOnline).toHaveBeenCalledWith('u2')
  })

  it('does not add member for different server', () => {
    const member = { userId: 'u2', user: { isBot: false } } as any
    handlers.onMemberJoined({ serverId: 'other', member })

    expect(useMemberStore.getState().addMember).not.toHaveBeenCalled()
  })

  it('does not set bots online', () => {
    const member = { userId: 'bot1', user: { isBot: true } } as any
    handlers.onMemberJoined({ serverId: 's1', member })

    expect(useMemberStore.getState().setUserOnline).not.toHaveBeenCalled()
  })
})

describe('cleanup', () => {
  it('clears all pending offline timers', () => {
    handlers.onUserOffline({ userId: 'u1' })
    handlers.onUserOffline({ userId: 'u2' })
    handlers.cleanup()

    jest.advanceTimersByTime(10000)

    expect(useMemberStore.getState().setUserOffline).not.toHaveBeenCalled()
  })
})
