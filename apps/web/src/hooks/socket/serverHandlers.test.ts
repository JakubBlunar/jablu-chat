import { createServerHandlers } from './serverHandlers'

jest.mock('@/lib/notifications', () => ({
  showNotification: jest.fn()
}))

import { showNotification } from '@/lib/notifications'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useChannelStore } from '@/stores/channel.store'
import { useEventStore } from '@/stores/event.store'
import { useFriendStore } from '@/stores/friend.store'
import { useMemberStore } from '@/stores/member.store'
import { useServerStore } from '@/stores/server.store'

const mockNotify = jest.mocked(showNotification)

function resetStores() {
  useAuthStore.setState({ user: { id: 'me' } } as any)
  useServerStore.setState({
    currentServerId: 's1',
    servers: [{ id: 's1', name: 'Test' }],
    removeServer: jest.fn(),
    updateServerInList: jest.fn(),
  } as any)
  useMemberStore.setState({
    members: [
      { userId: 'me', serverId: 's1', roleIds: ['r1'], roles: [{ id: 'r1', isDefault: false }] }
    ],
    removeMember: jest.fn(),
    updateMemberRoles: jest.fn(),
    updateMemberTimeout: jest.fn(),
    updateMemberOnboarding: jest.fn(),
    updateRoleInMembers: jest.fn(),
    removeRoleFromMembers: jest.fn(),
    updateUserProfile: jest.fn(),
  } as any)
  useChannelStore.setState({
    fetchChannels: jest.fn().mockResolvedValue(undefined),
    addChannel: jest.fn(),
    updateChannel: jest.fn(),
    removeChannel: jest.fn(),
    addCategory: jest.fn(),
    updateCategory: jest.fn(),
    removeCategory: jest.fn(),
    applyCategoryReorder: jest.fn(),
  } as any)
  useChannelPermissionsStore.setState({
    fetchChannelPermissions: jest.fn().mockResolvedValue(undefined),
  } as any)
  useEventStore.setState({
    addEvent: jest.fn(),
    updateEvent: jest.fn(),
    removeEvent: jest.fn(),
    updateInterest: jest.fn(),
  } as any)
  useFriendStore.setState({
    addPendingRequest: jest.fn(),
    removePending: jest.fn(),
    fetchFriends: jest.fn(),
    removeFriendByFriendshipId: jest.fn(),
  } as any)
}

let handlers: ReturnType<typeof createServerHandlers>

beforeEach(() => {
  resetStores()
  jest.clearAllMocks()
  handlers = createServerHandlers()
})

describe('onMemberLeft', () => {
  it('removes member from store for current server', () => {
    handlers.onMemberLeft({ serverId: 's1', userId: 'other' })

    expect(useMemberStore.getState().removeMember).toHaveBeenCalledWith('s1', 'other')
  })

  it('removes server when self leaves', () => {
    handlers.onMemberLeft({ serverId: 's1', userId: 'me' })

    expect(useServerStore.getState().removeServer).toHaveBeenCalledWith('s1')
  })

  it('ignores events for other servers', () => {
    handlers.onMemberLeft({ serverId: 'other-server', userId: 'someone' })

    expect(useMemberStore.getState().removeMember).not.toHaveBeenCalled()
  })
})

describe('onMemberUpdated', () => {
  it('updates member roles and refetches channels/perms for self', () => {
    handlers.onMemberUpdated({
      serverId: 's1',
      userId: 'me',
      roleIds: ['r1', 'r2'],
      roles: [{ id: 'r1' }, { id: 'r2' }] as any
    })

    expect(useMemberStore.getState().updateMemberRoles).toHaveBeenCalledWith('s1', 'me', ['r1', 'r2'], [{ id: 'r1' }, { id: 'r2' }])
    expect(useChannelStore.getState().fetchChannels).toHaveBeenCalledWith('s1')
    expect(useChannelPermissionsStore.getState().fetchChannelPermissions).toHaveBeenCalledWith('s1')
  })

  it('does not refetch channels for other users role changes', () => {
    handlers.onMemberUpdated({
      serverId: 's1',
      userId: 'other',
      roleIds: ['r1'],
    })

    expect(useMemberStore.getState().updateMemberRoles).toHaveBeenCalled()
    expect(useChannelStore.getState().fetchChannels).not.toHaveBeenCalled()
  })

  it('updates timeout', () => {
    handlers.onMemberUpdated({ serverId: 's1', userId: 'other', mutedUntil: '2025-01-01' })

    expect(useMemberStore.getState().updateMemberTimeout).toHaveBeenCalledWith('s1', 'other', '2025-01-01')
  })

  it('updates onboarding status', () => {
    handlers.onMemberUpdated({ serverId: 's1', userId: 'other', onboardingCompleted: true })

    expect(useMemberStore.getState().updateMemberOnboarding).toHaveBeenCalledWith('s1', 'other', true)
  })

  it('ignores events for non-current server', () => {
    handlers.onMemberUpdated({ serverId: 'other', userId: 'me', roleIds: ['r1'] })

    expect(useMemberStore.getState().updateMemberRoles).not.toHaveBeenCalled()
  })
})

describe('onRoleUpdated', () => {
  it('updates role in members', () => {
    const role = { id: 'r1', isDefault: false } as any
    handlers.onRoleUpdated({ serverId: 's1', role })

    expect(useMemberStore.getState().updateRoleInMembers).toHaveBeenCalledWith(role)
  })

  it('refetches channels/perms when updated role affects current user', () => {
    const role = { id: 'r1', isDefault: false } as any
    handlers.onRoleUpdated({ serverId: 's1', role })

    expect(useChannelStore.getState().fetchChannels).toHaveBeenCalledWith('s1')
    expect(useChannelPermissionsStore.getState().fetchChannelPermissions).toHaveBeenCalledWith('s1')
  })

  it('refetches when @everyone role is updated', () => {
    const role = { id: 'everyone', isDefault: true } as any
    handlers.onRoleUpdated({ serverId: 's1', role })

    expect(useChannelStore.getState().fetchChannels).toHaveBeenCalledWith('s1')
  })

  it('does not refetch when role does not affect current user', () => {
    const role = { id: 'other-role', isDefault: false } as any
    handlers.onRoleUpdated({ serverId: 's1', role })

    expect(useChannelStore.getState().fetchChannels).not.toHaveBeenCalled()
  })
})

describe('onRoleDeleted', () => {
  it('removes role from members', () => {
    handlers.onRoleDeleted({ serverId: 's1', roleId: 'r1' })

    expect(useMemberStore.getState().removeRoleFromMembers).toHaveBeenCalledWith('s1', 'r1')
  })

  it('refetches channels/perms when deleted role belongs to current user', () => {
    handlers.onRoleDeleted({ serverId: 's1', roleId: 'r1' })

    expect(useChannelStore.getState().fetchChannels).toHaveBeenCalledWith('s1')
    expect(useChannelPermissionsStore.getState().fetchChannelPermissions).toHaveBeenCalledWith('s1')
  })

  it('does not refetch when deleted role is not user role', () => {
    handlers.onRoleDeleted({ serverId: 's1', roleId: 'unknown-role' })

    expect(useChannelStore.getState().fetchChannels).not.toHaveBeenCalled()
  })
})

describe('onServerUpdated', () => {
  it('patches server in list', () => {
    handlers.onServerUpdated({ serverId: 's1', name: 'New Name', iconUrl: '/icon.png' })

    expect(useServerStore.getState().updateServerInList).toHaveBeenCalledWith('s1', { name: 'New Name', iconUrl: '/icon.png' })
  })
})

describe('onFriendRequest', () => {
  it('adds pending request and shows notification for incoming', () => {
    const payload = {
      friendshipId: 'f1',
      user: { username: 'charlie', displayName: 'Charlie' },
      direction: 'incoming',
      createdAt: '2024-01-01'
    }

    handlers.onFriendRequest(payload)

    expect(useFriendStore.getState().addPendingRequest).toHaveBeenCalled()
    expect(mockNotify).toHaveBeenCalledWith(
      'Friend Request',
      'Charlie sent you a friend request',
      '/channels/@me',
      undefined,
      'friend'
    )
  })

  it('does not show notification for outgoing requests', () => {
    const payload = {
      friendshipId: 'f1',
      user: { username: 'charlie' },
      direction: 'outgoing',
      createdAt: '2024-01-01'
    }

    handlers.onFriendRequest(payload)

    expect(mockNotify).not.toHaveBeenCalled()
  })
})

describe('onFriendAccepted', () => {
  it('removes pending and refreshes friends', () => {
    handlers.onFriendAccepted({ friendshipId: 'f1', user: {} })

    expect(useFriendStore.getState().removePending).toHaveBeenCalledWith('f1')
    expect(useFriendStore.getState().fetchFriends).toHaveBeenCalled()
  })
})

describe('onChannelCreated / onChannelDeleted', () => {
  it('adds channel for current server', () => {
    const channel = { id: 'ch-new', name: 'new' } as any
    handlers.onChannelCreated({ serverId: 's1', channel })

    expect(useChannelStore.getState().addChannel).toHaveBeenCalledWith(channel)
  })

  it('ignores channel events from other servers', () => {
    handlers.onChannelCreated({ serverId: 'other', channel: {} as any })

    expect(useChannelStore.getState().addChannel).not.toHaveBeenCalled()
  })

  it('removes channel for current server', () => {
    handlers.onChannelDeleted({ serverId: 's1', channelId: 'ch1' })

    expect(useChannelStore.getState().removeChannel).toHaveBeenCalledWith('ch1')
  })
})
