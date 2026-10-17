import { renderHook } from '@testing-library/react'
import { useRouteSync } from './useRouteSync'
import { useChannelStore } from '@/stores/channel.store'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useServerStore } from '@/stores/server.store'
import { makeChannel } from '@/test/factories'

let mockLocation = { pathname: '/channels/s1/ch1', search: '', key: 'initial' }
let mockParams = { serverId: 's1', channelId: 'ch1' }
const mockSetViewingVoiceRoom = jest.fn()
const mockVoice = { currentChannelId: 'voice1', viewingVoiceRoom: false, setViewingVoiceRoom: mockSetViewingVoiceRoom }

jest.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
  useParams: () => mockParams
}))
jest.mock('@/stores/voice-connection.store', () => ({
  useVoiceConnectionStore: { getState: () => mockVoice }
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockLocation = { pathname: '/channels/s1/ch1', search: '', key: 'initial' }
  mockParams = { serverId: 's1', channelId: 'ch1' }
  useServerStore.setState({ currentServerId: 's1', viewMode: 'server' })
  useChannelStore.setState({
    currentChannelId: 'ch1', channels: [makeChannel('ch1', 's1')],
    loadedServerId: 's1', isLoading: false,
    fetchChannels: jest.fn().mockResolvedValue(undefined)
  })
  useChannelPermissionsStore.setState({ fetchChannelPermissions: jest.fn().mockResolvedValue(undefined) })
})

it('refreshes a new deep-linked channel even when staying in the same server', () => {
  mockParams = { serverId: 's1', channelId: 'new-channel' }
  mockLocation.pathname = '/channels/s1/new-channel'
  renderHook(() => useRouteSync())
  expect(useChannelStore.getState().currentChannelId).toBe('new-channel')
  expect(useChannelStore.getState().fetchChannels).toHaveBeenCalledWith('s1')
  expect(useChannelPermissionsStore.getState().fetchChannelPermissions).toHaveBeenCalledWith('s1')
})

it('does not refresh a known channel unnecessarily', () => {
  renderHook(() => useRouteSync())
  expect(useChannelStore.getState().fetchChannels).not.toHaveBeenCalled()
})

it('returns to text when a notification targets the same channel behind a voice room', () => {
  const { rerender } = renderHook(() => useRouteSync())
  mockSetViewingVoiceRoom.mockClear()
  mockLocation = { ...mockLocation, search: '?m=message', key: 'notification' }
  rerender()
  expect(mockSetViewingVoiceRoom).toHaveBeenCalledWith(false)
})
