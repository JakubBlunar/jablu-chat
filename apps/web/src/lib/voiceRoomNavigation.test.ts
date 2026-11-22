import { openConversation } from './conversationNavigation'
import { returnToVoiceRoom } from './voiceRoomNavigation'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

jest.mock('@/lib/socket', () => ({ getSocket: () => null }))
jest.mock('./conversationNavigation', () => ({ openConversation: jest.fn() }))

beforeEach(() => {
  jest.clearAllMocks()
  useVoiceConnectionStore.setState({
    currentServerId: 'server',
    currentChannelId: 'room',
    currentDmCallId: null,
    viewingVoiceRoom: false
  })
})

it.each([null, 'dm-call'])('routes back to the connected room (DM call %s)', async (currentDmCallId) => {
  useVoiceConnectionStore.setState({ currentDmCallId })
  const target = currentDmCallId
    ? { kind: 'dm' as const, conversationId: 'room' }
    : { kind: 'channel' as const, serverId: 'server', channelId: 'room' }
  jest.mocked(openConversation).mockResolvedValue({ status: 'opened', path: '/call', target, empty: false })
  await returnToVoiceRoom()
  expect(openConversation).toHaveBeenCalledWith({ target, source: 'sidebar' })
  expect(useVoiceConnectionStore.getState().viewingVoiceRoom).toBe(true)
})

it('does not reveal an ended call after a delayed navigation', async () => {
  jest
    .mocked(openConversation)
    .mockResolvedValue({
      status: 'opened',
      path: '/call',
      empty: false,
      target: { kind: 'channel', serverId: 'server', channelId: 'room' }
    })
  const opening = returnToVoiceRoom()
  useVoiceConnectionStore.setState({ currentChannelId: null })
  await opening
  expect(useVoiceConnectionStore.getState().viewingVoiceRoom).toBe(false)
})
