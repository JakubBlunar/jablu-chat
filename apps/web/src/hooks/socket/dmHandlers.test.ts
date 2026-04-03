import { createDmHandlers } from './dmHandlers'

jest.mock('@/lib/api', () => ({
  api: {
    getDmConversation: jest.fn()
  }
}))

jest.mock('@/lib/notifications', () => ({
  showNotification: jest.fn()
}))

import { api } from '@/lib/api'
import { showNotification } from '@/lib/notifications'
import { useAuthStore } from '@/stores/auth.store'
import { useDmStore } from '@/stores/dm.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useServerStore } from '@/stores/server.store'

const mockGetConv = jest.mocked(api.getDmConversation)
const mockNotify = jest.mocked(showNotification)

function resetStores() {
  useAuthStore.setState({ user: { id: 'me' } } as any)
  useServerStore.setState({ viewMode: 'dm' } as any)
  useDmStore.setState({
    currentConversationId: 'conv1',
    conversations: [{ id: 'conv1' }],
    messages: [],
    addMessage: jest.fn(),
    updateMessage: jest.fn(),
    removeMessage: jest.fn(),
    addOrUpdateConversation: jest.fn(),
    updateConversationLastMessage: jest.fn(),
  } as any)
  useReadStateStore.setState({
    ackDm: jest.fn(),
    incrementDm: jest.fn(),
  } as any)
}

let handlers: ReturnType<typeof createDmHandlers>
let throttledAck: jest.Mock

beforeEach(() => {
  resetStores()
  jest.clearAllMocks()
  throttledAck = jest.fn((fn: () => void) => fn())
  handlers = createDmHandlers(throttledAck)
})

describe('onDmNew', () => {
  const basePayload = {
    id: 'dm-msg-1',
    conversationId: 'conv1',
    authorId: 'other',
    content: 'Hey!',
    createdAt: '2024-01-01T00:00:00Z',
    author: { username: 'bob', displayName: 'Bob' }
  }

  it('adds message when viewing the conversation', () => {
    handlers.onDmNew(basePayload as any)

    expect(useDmStore.getState().addMessage).toHaveBeenCalledWith(basePayload)
    expect(throttledAck).toHaveBeenCalled()
  })

  it('increments unread and shows notification when not viewing', () => {
    useDmStore.setState({ ...useDmStore.getState(), currentConversationId: 'other-conv' } as any)

    handlers.onDmNew(basePayload as any)

    expect(useReadStateStore.getState().incrementDm).toHaveBeenCalledWith('conv1')
    expect(mockNotify).toHaveBeenCalledWith(
      'DM from Bob',
      'Hey!',
      '/channels/@me/conv1',
      undefined,
      'mention'
    )
  })

  it('increments unread when in server viewMode', () => {
    useServerStore.setState({ viewMode: 'server' } as any)

    handlers.onDmNew(basePayload as any)

    expect(useReadStateStore.getState().incrementDm).toHaveBeenCalledWith('conv1')
  })

  it('does not increment unread for own messages', () => {
    useDmStore.setState({ ...useDmStore.getState(), currentConversationId: 'other-conv' } as any)

    handlers.onDmNew({ ...basePayload, authorId: 'me' } as any)

    expect(useReadStateStore.getState().incrementDm).not.toHaveBeenCalled()
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('fetches conversation when not in list', async () => {
    useDmStore.setState({ ...useDmStore.getState(), conversations: [] } as any)
    mockGetConv.mockResolvedValue({ id: 'conv1' } as any)

    handlers.onDmNew(basePayload as any)

    await new Promise((r) => setTimeout(r, 10))
    expect(mockGetConv).toHaveBeenCalledWith('conv1')
  })

  it('does not fetch conversation when already in list', () => {
    handlers.onDmNew(basePayload as any)

    expect(mockGetConv).not.toHaveBeenCalled()
  })

  it('updates conversation last message', () => {
    handlers.onDmNew(basePayload as any)

    expect(useDmStore.getState().updateConversationLastMessage).toHaveBeenCalledWith('conv1', {
      content: 'Hey!',
      authorId: 'other',
      createdAt: '2024-01-01T00:00:00Z'
    })
  })
})

describe('onDmEdit', () => {
  it('updates message when viewing the conversation', () => {
    const payload = { id: 'm1', conversationId: 'conv1', content: 'edited' } as any
    handlers.onDmEdit(payload)

    expect(useDmStore.getState().updateMessage).toHaveBeenCalledWith(payload)
  })

  it('ignores edit for non-active conversation', () => {
    const payload = { id: 'm1', conversationId: 'other', content: 'edited' } as any
    handlers.onDmEdit(payload)

    expect(useDmStore.getState().updateMessage).not.toHaveBeenCalled()
  })
})

describe('onDmDelete', () => {
  it('removes message when viewing the conversation', () => {
    handlers.onDmDelete({ messageId: 'm1', conversationId: 'conv1' })

    expect(useDmStore.getState().removeMessage).toHaveBeenCalledWith('m1')
  })

  it('ignores delete for non-active conversation', () => {
    handlers.onDmDelete({ messageId: 'm1', conversationId: 'other' })

    expect(useDmStore.getState().removeMessage).not.toHaveBeenCalled()
  })
})

describe('onDmLinkPreviews', () => {
  it('updates link previews for current conversation message', () => {
    const msg = { id: 'm1', content: 'hello' }
    useDmStore.setState({ ...useDmStore.getState(), messages: [msg] } as any)

    handlers.onDmLinkPreviews({
      messageId: 'm1',
      conversationId: 'conv1',
      linkPreviews: [{ url: 'https://x.com', title: 'X' }] as any
    })

    expect(useDmStore.getState().updateMessage).toHaveBeenCalledWith({
      ...msg,
      linkPreviews: [{ url: 'https://x.com', title: 'X' }]
    })
  })

  it('does nothing when conversation is not active', () => {
    handlers.onDmLinkPreviews({
      messageId: 'm1',
      conversationId: 'other',
      linkPreviews: [] as any
    })

    expect(useDmStore.getState().updateMessage).not.toHaveBeenCalled()
  })
})
