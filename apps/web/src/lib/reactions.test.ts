import { toggleMessageReaction } from './reactions'
import { useAuthStore } from '@/stores/auth.store'
import { useMessageStore } from '@/stores/message.store'
import { useThreadStore } from '@/stores/thread.store'
import { useForumReplyStore } from '@/stores/forumReply.store'
import type { Message } from '@chat/shared'

let lastEmit: { event: string; payload: unknown; ack?: (res?: unknown) => void } | null = null
const mockEmit = jest.fn((event: string, payload: unknown, ack?: (res?: unknown) => void) => {
  lastEmit = { event, payload, ack }
})

jest.mock('@/lib/socket', () => ({
  getSocket: () => ({ emit: mockEmit })
}))

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    channelId: 'c1',
    authorId: 'other',
    content: 'hi',
    createdAt: new Date().toISOString(),
    reactions: [],
    ...overrides
  } as Message
}

beforeEach(() => {
  mockEmit.mockClear()
  lastEmit = null
  useAuthStore.setState({ user: { id: 'self', username: 'me', displayName: 'Me' } } as never)
  useMessageStore.setState({ messages: [makeMessage()] } as never)
  useThreadStore.setState({ messages: [] } as never)
  useForumReplyStore.setState({ messages: [] } as never)
})

describe('toggleMessageReaction', () => {
  it('optimistically adds the reaction and emits with an ack', () => {
    toggleMessageReaction({ mode: 'channel', messageId: 'm1', emoji: '🔥' })

    const msg = useMessageStore.getState().messages[0]
    expect(msg.reactions).toEqual([{ emoji: '🔥', count: 1, userIds: ['self'], isCustom: false }])
    expect(lastEmit?.event).toBe('reaction:toggle')
    expect(lastEmit?.payload).toEqual({ messageId: 'm1', emoji: '🔥', isCustom: false })
    expect(typeof lastEmit?.ack).toBe('function')
  })

  it('optimistically removes a reaction the user already made', () => {
    useMessageStore.setState({
      messages: [makeMessage({ reactions: [{ emoji: '🔥', count: 1, userIds: ['self'], isCustom: false }] })]
    } as never)

    toggleMessageReaction({ mode: 'channel', messageId: 'm1', emoji: '🔥' })

    expect(useMessageStore.getState().messages[0].reactions).toEqual([])
  })

  it('reverts the optimistic add when the server rejects (ok: false)', () => {
    toggleMessageReaction({ mode: 'channel', messageId: 'm1', emoji: '🔥' })
    expect(useMessageStore.getState().messages[0].reactions).toHaveLength(1)

    lastEmit?.ack?.({ ok: false })
    expect(useMessageStore.getState().messages[0].reactions).toEqual([])
  })

  it('reverts when the server resolved the opposite action', () => {
    toggleMessageReaction({ mode: 'channel', messageId: 'm1', emoji: '🔥' })
    expect(useMessageStore.getState().messages[0].reactions).toHaveLength(1)

    // We predicted "added" but the server says it "removed" it.
    lastEmit?.ack?.({ ok: true, action: 'removed' })
    expect(useMessageStore.getState().messages[0].reactions).toEqual([])
  })

  it('keeps the optimistic change when the server confirms the same action', () => {
    toggleMessageReaction({ mode: 'channel', messageId: 'm1', emoji: '🔥' })
    lastEmit?.ack?.({ ok: true, action: 'added' })
    expect(useMessageStore.getState().messages[0].reactions).toHaveLength(1)
  })

  it('routes optimistic updates to the thread store when the message lives there', () => {
    useMessageStore.setState({ messages: [] } as never)
    useThreadStore.setState({ messages: [makeMessage({ id: 't1' })] } as never)

    toggleMessageReaction({ mode: 'channel', messageId: 't1', emoji: '🎉' })

    expect(useThreadStore.getState().messages[0].reactions).toEqual([
      { emoji: '🎉', count: 1, userIds: ['self'], isCustom: false }
    ])
  })

  it('routes optimistic updates to the forum reply store when the message lives there', () => {
    useMessageStore.setState({ messages: [] } as never)
    useForumReplyStore.setState({ messages: [makeMessage({ id: 'f1' })] } as never)

    toggleMessageReaction({ mode: 'channel', messageId: 'f1', emoji: '😮' })

    expect(useForumReplyStore.getState().messages[0].reactions).toEqual([
      { emoji: '😮', count: 1, userIds: ['self'], isCustom: false }
    ])
  })
})
