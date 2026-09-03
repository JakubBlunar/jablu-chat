import { renderHook } from '@testing-library/react'
import { useServerResources } from './useServerResources'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useChannelStore } from '@/stores/channel.store'
import { useMemberStore } from '@/stores/member.store'
import { useMessageStore } from '@/stores/message.store'
import { useServerStore } from '@/stores/server.store'

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}))

function mockFetchers() {
  const fetchMembers = jest.fn().mockResolvedValue(undefined)
  const fetchChannels = jest.fn().mockResolvedValue(undefined)
  const fetchChannelPermissions = jest.fn().mockResolvedValue(undefined)
  const clearMessages = jest.fn()
  useMemberStore.setState({ fetchMembers, loadedServerId: null } as never)
  useChannelStore.setState({ fetchChannels, loadedServerId: null } as never)
  useChannelPermissionsStore.setState({ fetchChannelPermissions } as never)
  useMessageStore.setState({ clearMessages } as never)
  return { fetchMembers, fetchChannels, fetchChannelPermissions, clearMessages }
}

beforeEach(() => {
  useServerStore.setState({ viewMode: 'server', currentServerId: null, servers: [], isLoading: false })
  useChannelStore.setState({
    channels: [],
    categories: [],
    currentChannelId: null,
    isLoading: false,
    loadedServerId: null
  })
  useMemberStore.setState({
    members: [],
    onlineUserIds: new Set(),
    realtimeStatuses: new Map(),
    isLoading: false,
    loadedServerId: null
  })
})

describe('useServerResources', () => {
  it('fetches members even when channels were already hydrated from cache', () => {
    const { fetchMembers, fetchChannels, fetchChannelPermissions } = mockFetchers()
    useChannelStore.setState({ loadedServerId: 's1' } as never)
    useServerStore.setState({ viewMode: 'server', currentServerId: 's1' })

    renderHook(() => useServerResources())

    expect(fetchMembers).toHaveBeenCalledWith('s1')
    expect(fetchChannels).not.toHaveBeenCalled()
    expect(fetchChannelPermissions).not.toHaveBeenCalled()
  })

  it('does not refetch members when they are already loaded for this server', () => {
    const { fetchMembers } = mockFetchers()
    useMemberStore.setState({ loadedServerId: 's1' } as never)
    useChannelStore.setState({ loadedServerId: 's1' } as never)
    useServerStore.setState({ viewMode: 'server', currentServerId: 's1' })

    renderHook(() => useServerResources())

    expect(fetchMembers).not.toHaveBeenCalled()
  })

  it('fetches channels, permissions, and members on a cold server with no cache', () => {
    const { fetchMembers, fetchChannels, fetchChannelPermissions } = mockFetchers()
    useServerStore.setState({ viewMode: 'server', currentServerId: 's1' })

    renderHook(() => useServerResources())

    expect(fetchMembers).toHaveBeenCalledWith('s1')
    expect(fetchChannels).toHaveBeenCalledWith('s1')
    expect(fetchChannelPermissions).toHaveBeenCalledWith('s1')
  })

  it('does not fetch while in DM view', () => {
    const { fetchMembers, fetchChannels, clearMessages } = mockFetchers()
    useServerStore.setState({ viewMode: 'dm', currentServerId: 's1' })

    renderHook(() => useServerResources())

    expect(fetchMembers).not.toHaveBeenCalled()
    expect(fetchChannels).not.toHaveBeenCalled()
    expect(clearMessages).not.toHaveBeenCalled()
  })
})
