import { act, renderHook, waitFor } from '@testing-library/react'
import { useMessageJumpFromQuery } from './useMessageJumpFromQuery'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useMessageStore } from '@/stores/message.store'
import { useNavigationStore } from '@/stores/navigation.store'
import { useServerStore } from '@/stores/server.store'
import { useThreadStore } from '@/stores/thread.store'
import { makeChannel, makeMessage } from '@/test/factories'

let mockParams: { serverId?: string; channelId?: string; conversationId?: string }
let mockSearch: URLSearchParams
let mockLocation: { pathname: string; key: string }
const mockSetSearch = jest.fn()

jest.mock('react-router-dom', () => ({
  useParams: () => mockParams,
  useLocation: () => mockLocation,
  useSearchParams: () => [mockSearch, mockSetSearch]
}))
jest.mock('@/lib/socket', () => ({ getSocket: jest.fn() }))

const navigateChannel = jest.fn()
const navigateDm = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = { serverId: 's2', channelId: 'ch2' }
  mockSearch = new URLSearchParams('m=target&keep=yes')
  mockLocation = { pathname: '/channels/s2/ch2', key: 'notification-1' }
  useServerStore.setState({ viewMode: 'server', currentServerId: 's2' })
  useChannelStore.setState({
    currentChannelId: 'ch2', loadedServerId: 's2', isLoading: false,
    channels: [makeChannel('ch2', 's2')]
  })
  useMessageStore.setState({ loadedForChannelId: 'ch2', messages: [makeMessage({ id: 'target' })] })
  useDmStore.setState({ currentConversationId: null, loadedForConvId: null })
  useThreadStore.getState().closeThread()
  navigateChannel.mockResolvedValue(null)
  navigateDm.mockResolvedValue(null)
  useNavigationStore.setState({ navigateToChannel: navigateChannel, navigateToDm: navigateDm })
})

it('waits for route sync rather than jumping in the previous channel', async () => {
  useServerStore.setState({ currentServerId: 's1' })
  useChannelStore.setState({ currentChannelId: 'ch1' })
  renderHook(() => useMessageJumpFromQuery())
  expect(navigateChannel).not.toHaveBeenCalled()
  act(() => {
    useServerStore.setState({ currentServerId: 's2' })
    useChannelStore.setState({ currentChannelId: 'ch2' })
  })
  await waitFor(() => expect(navigateChannel).toHaveBeenCalledWith({
    serverId: 's2', channelId: 'ch2', scrollToMessageId: 'target'
  }))
})

it('waits for the channel list to finish refreshing', async () => {
  useChannelStore.setState({ isLoading: true })
  renderHook(() => useMessageJumpFromQuery())
  expect(navigateChannel).not.toHaveBeenCalled()
  act(() => { useChannelStore.setState({ isLoading: false }) })
  await waitFor(() => expect(navigateChannel).toHaveBeenCalledTimes(1))
})

it('removes only handled jump parameters', async () => {
  renderHook(() => useMessageJumpFromQuery())
  await waitFor(() => expect(mockSetSearch).toHaveBeenCalled())
  const next = mockSetSearch.mock.calls[0][0](mockSearch) as URLSearchParams
  expect(next.get('m')).toBeNull()
  expect(next.get('keep')).toBe('yes')
})

it('does not consume a failed jump before the target conversation is loaded', async () => {
  useMessageStore.setState({ loadedForChannelId: 'ch1' })
  renderHook(() => useMessageJumpFromQuery())
  await act(async () => {})
  expect(mockSetSearch).not.toHaveBeenCalled()
})

it('routes a DM jump from the URL, not a previously selected server', async () => {
  mockParams = { conversationId: 'dm2' }
  mockLocation = { pathname: '/channels/@me/dm2', key: 'dm-notification' }
  renderHook(() => useMessageJumpFromQuery())
  expect(navigateDm).not.toHaveBeenCalled()
  act(() => {
    useServerStore.setState({ viewMode: 'dm' })
    useDmStore.setState({
      currentConversationId: 'dm2', loadedForConvId: 'dm2', messages: [makeMessage({ id: 'target' })]
    })
  })
  await waitFor(() => expect(navigateDm).toHaveBeenCalledWith({
    conversationId: 'dm2', scrollToMessageId: 'target'
  }))
})

it('opens a thread and focuses the reply instead of losing its target', async () => {
  mockSearch = new URLSearchParams('m=reply&thread=parent')
  const parent = makeMessage({ id: 'parent', channelId: 'ch2' })
  useMessageStore.setState({ messages: [parent] })
  renderHook(() => useMessageJumpFromQuery())
  await waitFor(() => expect(useThreadStore.getState().isOpen).toBe(true))
  expect(useThreadStore.getState().parentMessage?.id).toBe('parent')
  expect(useThreadStore.getState().focusMessageId).toBe('reply')
  expect(navigateChannel).toHaveBeenCalledWith({
    serverId: 's2', channelId: 'ch2', scrollToMessageId: 'parent'
  })
})

it('cancels an old query before it consumes a newer navigation', async () => {
  let finish: (value: null) => void = () => {}
  navigateChannel.mockImplementationOnce(() => new Promise<null>((resolve) => { finish = resolve }))
  const { rerender } = renderHook(() => useMessageJumpFromQuery())
  mockSearch = new URLSearchParams()
  mockLocation = { ...mockLocation, key: 'navigated-away' }
  rerender()
  await act(async () => { finish(null) })
  expect(mockSetSearch).not.toHaveBeenCalled()
})
