import { renderHook } from '@testing-library/react'
import { useServerResources } from './useServerResources'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useChannelStore } from '@/stores/channel.store'
import { useMemberStore } from '@/stores/member.store'
import { useMessageStore } from '@/stores/message.store'
import { useServerStore } from '@/stores/server.store'
import { useNavigationStore } from '@/stores/navigation.store'
import { useEffect } from 'react'

it('does not clear a route-selected history from an obsolete empty-server render', () => {
  const { clearMessages } = mockFetchers()
  renderHook(() => {
    useEffect(() => {
      useServerStore.getState().setCurrentServer('s1')
    }, [])
    useServerResources()
  })
  expect(clearMessages).not.toHaveBeenCalled()
})

jest.mock('@/lib/socket', () => ({ getSocket: () => null }))

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
  useNavigationStore.setState({ navigatingToServerId: null, isNavigating: false })
  useChannelPermissionsStore.setState({ requestedServerId: null, loadedServerId: null })
  useServerStore.setState({ viewMode: 'server', currentServerId: null, servers: [], isLoading: false })
  useChannelStore.setState({
    channels: [],
    categories: [],
    currentChannelId: null,
    isLoading: false,
    loadedServerId: null,
    requestedServerId: null
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
  it('does not repeat a navigation refresh that completed before the route mounted', () => {
    const { fetchMembers, fetchChannels, fetchChannelPermissions } = mockFetchers()
    useMemberStore.setState({ loadedServerId: 's1' })
    useChannelStore.setState({ loadedServerId: 's1', requestedServerId: 's1' })
    useChannelPermissionsStore.setState({ loadedServerId: 's1', requestedServerId: 's1' })
    useServerStore.setState({ currentServerId: 's1' })
    renderHook(() => useServerResources())
    expect(fetchChannels).not.toHaveBeenCalled()
    expect(fetchChannelPermissions).not.toHaveBeenCalled()
    expect(fetchMembers).not.toHaveBeenCalled()
  })

  it('does not restart old-view resources while navigation preloads another server', () => {
    const { fetchMembers, fetchChannels, fetchChannelPermissions } = mockFetchers()
    useServerStore.setState({ currentServerId: 'old' })
    useNavigationStore.setState({ navigatingToServerId: 'new', isNavigating: true })
    renderHook(() => useServerResources())
    expect(fetchChannels).not.toHaveBeenCalled()
    expect(fetchChannelPermissions).not.toHaveBeenCalled()
    expect(fetchMembers).not.toHaveBeenCalled()
  })

  it('only fills missing members when channels are cached', () => {
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

  it('leaves cold structure loading to the coordinator and fills members', () => {
    const { fetchMembers, fetchChannels, fetchChannelPermissions } = mockFetchers()
    useServerStore.setState({ viewMode: 'server', currentServerId: 's1' })

    renderHook(() => useServerResources())

    expect(fetchMembers).toHaveBeenCalledWith('s1')
    expect(fetchChannels).not.toHaveBeenCalled()
    expect(fetchChannelPermissions).not.toHaveBeenCalled()
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
