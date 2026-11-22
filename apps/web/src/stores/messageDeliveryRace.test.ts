import type { Message } from '@chat/shared'
import { api } from '@/lib/api'
import { makeMessage } from '@/test/factories'
import { useMessageStore } from './message.store'
import { useDmStore } from './dm.store'

jest.mock('@/lib/api', () => ({ api: { get: jest.fn(), getDmMessagesAfter: jest.fn() } }))

it.each(['channel', 'dm'])('reconciles an overlapping %s reconnect page with live messages by ID', async (mode) => {
  const a = makeMessage({ id: 'a' })
  const b = makeMessage({ id: 'b', content: 'same text' })
  const c = makeMessage({ id: 'c', content: 'same text' })
  const d = makeMessage({ id: 'd' })
  const channel = mode === 'channel'
  const history = channel ? useMessageStore : useDmStore
  if (channel) useMessageStore.setState({ loadedForChannelId: 'room', messages: [a], hasNewer: false })
  else useDmStore.setState({ loadedForConvId: 'room', messages: [a], hasNewer: false })
  let deliver!: (page: { messages: Message[]; hasMore: boolean; hasNewer: boolean }) => void
  const page = new Promise<Parameters<typeof deliver>[0]>(resolve => { deliver = resolve })
  const request = channel ? jest.mocked(api.get) : jest.mocked(api.getDmMessagesAfter)
  request.mockImplementationOnce(() => page)
  const pending = history.getState().fetchNewerMessages('room')
  history.getState().addMessage(c)
  history.getState().addMessage(d)
  deliver({ messages: [c, b], hasMore: false, hasNewer: false })
  await pending
  expect(history.getState().messages.map(m => m.id)).toEqual(['a', 'b', 'c', 'd'])
})
