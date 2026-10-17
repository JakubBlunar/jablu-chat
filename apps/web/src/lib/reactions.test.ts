import { toggleMessageReaction, toggleMessageReactionAndRemember } from './reactions'
import { addRecentReaction } from '@/stores/reactions.store'
import { useAuthStore } from '@/stores/auth.store'
import { useMessageStore } from '@/stores/message.store'
import { useThreadStore } from '@/stores/thread.store'
import { useForumReplyStore } from '@/stores/forumReply.store'
import type { Message } from '@chat/shared'

let lastEmit: { event: string; payload: unknown; ack?: (res?: unknown) => void } | null = null
const mockEmit = jest.fn()
const listeners = new Map<string, (payload: { messageId: string; emoji: string; userId: string }) => void>()
const mockSocket = {
  connected: true,
  timeout: jest.fn(() => ({ emitWithAck: mockEmit })),
  on: jest.fn((event: string, listener: (payload: { messageId: string; emoji: string; userId: string }) => void) =>
    listeners.set(event, listener)
  ),
  off: jest.fn((event: string) => listeners.delete(event))
}
const operations: Promise<boolean>[] = []
function toggle(params: Parameters<typeof toggleMessageReaction>[0]) {
  const operation = toggleMessageReaction(params)
  operations.push(operation)
  return operation
}
jest.mock('@/stores/toast.store', () => ({ showToast: jest.fn() }))
jest.mock('@/stores/reactions.store', () => ({ addRecentReaction: jest.fn() }))
jest.mock('@/stores/translation.store', () => ({
  useTranslationStore: { getState: () => ({ invalidate: jest.fn(), reset: jest.fn() }) }
}))
beforeEach(() => {
  mockSocket.connected = true
  listeners.clear()
  operations.length = 0
  jest.mocked(addRecentReaction).mockClear()
  mockEmit.mockReset().mockImplementation(
    (event: string, payload: unknown) =>
      new Promise((resolve) => {
        lastEmit = { event, payload, ack: resolve }
      })
  )
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

jest.mock('@/lib/socket', () => ({
  getSocket: () => mockSocket
}))
afterEach(async () => {
  lastEmit?.ack?.({ ok: true, action: 'added' })
  await Promise.all(operations)
  jest.restoreAllMocks()
})

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
  it.each([false, true])('remembers native reactions only after confirmation (ok=%s)', async (ok) => {
    const result = toggleMessageReactionAndRemember({ mode: 'channel', messageId: 'm1', emoji: '🔥' })
    operations.push(result)
    expect(addRecentReaction).not.toHaveBeenCalled()
    lastEmit?.ack?.({ ok, action: 'added' })
    expect(await result).toBe(ok)
    expect(addRecentReaction).toHaveBeenCalledTimes(ok ? 1 : 0)
  })

  it('keeps custom emoji out of native recent reactions', async () => {
    const result = toggleMessageReactionAndRemember({ mode: 'channel', messageId: 'm1', emoji: 'custom', isCustom: true })
    operations.push(result)
    lastEmit?.ack?.({ ok: true, action: 'added' })
    expect(await result).toBe(true)
    expect(addRecentReaction).not.toHaveBeenCalled()
  })

  it('optimistically adds the reaction and emits with an ack', () => {
    toggle({ mode: 'channel', messageId: 'm1', emoji: '🔥' })

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

    toggle({ mode: 'channel', messageId: 'm1', emoji: '🔥' })

    expect(useMessageStore.getState().messages[0].reactions).toEqual([])
  })

  it('reverts the optimistic add when the server rejects (ok: false)', async () => {
    const result = toggle({ mode: 'channel', messageId: 'm1', emoji: '🔥' })
    expect(useMessageStore.getState().messages[0].reactions).toHaveLength(1)

    lastEmit?.ack?.({ ok: false })
    expect(await result).toBe(false)
    expect(useMessageStore.getState().messages[0].reactions).toEqual([])
  })

  it('reverts when the server resolved the opposite action', async () => {
    const result = toggle({ mode: 'channel', messageId: 'm1', emoji: '🔥' })
    expect(useMessageStore.getState().messages[0].reactions).toHaveLength(1)

    // We predicted "added" but the server says it "removed" it.
    lastEmit?.ack?.({ ok: true, action: 'removed' })
    await result
    expect(useMessageStore.getState().messages[0].reactions).toEqual([])
  })

  it('keeps the optimistic change when the server confirms the same action', async () => {
    const result = toggle({ mode: 'channel', messageId: 'm1', emoji: '🔥' })
    lastEmit?.ack?.({ ok: true, action: 'added' })
    await result
    expect(useMessageStore.getState().messages[0].reactions).toHaveLength(1)
  })

  it('routes optimistic updates to the thread store when the message lives there', () => {
    useMessageStore.setState({ messages: [] } as never)
    useThreadStore.setState({ messages: [makeMessage({ id: 't1' })] } as never)

    toggle({ mode: 'channel', messageId: 't1', emoji: '🎉' })

    expect(useThreadStore.getState().messages[0].reactions).toEqual([
      { emoji: '🎉', count: 1, userIds: ['self'], isCustom: false }
    ])
  })

  it('routes optimistic updates to the forum reply store when the message lives there', () => {
    useMessageStore.setState({ messages: [] } as never)
    useForumReplyStore.setState({ messages: [makeMessage({ id: 'f1' })] } as never)

    toggle({ mode: 'channel', messageId: 'f1', emoji: '😮' })

    expect(useForumReplyStore.getState().messages[0].reactions).toEqual([
      { emoji: '😮', count: 1, userIds: ['self'], isCustom: false }
    ])
  })

  it('does not update or buffer a reaction while disconnected', async () => {
    mockSocket.connected = false
    expect(await toggle({ mode: 'channel', messageId: 'm1', emoji: '🔥' })).toBe(false)
    expect(mockEmit).not.toHaveBeenCalled()
    expect(useMessageStore.getState().messages[0].reactions).toEqual([])
  })

  it('rolls back a missing acknowledgement and bounds the operation', async () => {
    mockEmit.mockRejectedValueOnce(new Error('timeout'))
    expect(await toggle({ mode: 'channel', messageId: 'm1', emoji: '🔥' })).toBe(false)
    expect(mockSocket.timeout).toHaveBeenCalledWith(10_000)
    expect(useMessageStore.getState().messages[0].reactions).toEqual([])
  })

  it('serializes rapid duplicate toggles', async () => {
    const first = toggle({ mode: 'channel', messageId: 'm1', emoji: '🔥' })
    expect(await toggle({ mode: 'channel', messageId: 'm1', emoji: '🔥' })).toBe(false)
    expect(mockEmit).toHaveBeenCalledTimes(1)
    lastEmit?.ack?.({ ok: true, action: 'added' })
    expect(await first).toBe(true)
  })

  it('does not undo a confirmed room broadcast when only the ack is missing', async () => {
    let reject!: (error: Error) => void
    mockEmit.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        })
    )
    const result = toggle({ mode: 'channel', messageId: 'm1', emoji: '🔥' })
    listeners.get('reaction:add')?.({ messageId: 'm1', emoji: '🔥', userId: 'self' })
    reject(new Error('timeout'))
    expect(await result).toBe(true)
    expect(useMessageStore.getState().messages[0].reactions).toHaveLength(1)
    expect(listeners.size).toBe(0)
  })
})
