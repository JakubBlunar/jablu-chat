import { makeMessage } from '@/test/factories'
import { useMessageStore } from './message.store'
import { useDmStore } from './dm.store'
import { useThreadStore } from './thread.store'
import { useForumReplyStore } from './forumReply.store'

jest.mock('@/lib/api', () => ({ api: { get: jest.fn() } }))
jest.mock('@/lib/socket', () => ({ getSocket: () => null }))

type MutationState = Pick<
  ReturnType<typeof useMessageStore.getState>,
  'messages' | 'updateMessage' | 'addReaction' | 'removeReaction'
>
interface MutationStore {
  getState: () => MutationState
  setState: (state: Pick<MutationState, 'messages'>) => void
  subscribe: (listener: () => void) => () => void
}
const stores: { name: string; store: MutationStore; remove: (id: string) => void }[] = [
  { name: 'channel', store: useMessageStore, remove: (id: string) => useMessageStore.getState().removeMessage(id) },
  { name: 'DM', store: useDmStore, remove: (id: string) => useDmStore.getState().removeMessage(id) },
  { name: 'thread', store: useThreadStore, remove: (id: string) => useThreadStore.getState().deleteMessage(id) },
  { name: 'forum', store: useForumReplyStore, remove: (id: string) => useForumReplyStore.getState().removeMessage(id) }
]

describe.each(stores)('$name message mutations', ({ store, remove }) => {
  it('preserves the entire state and sends zero notifications for no-ops', () => {
    const message = makeMessage({ reactions: [{ emoji: 'ok', count: 1, userIds: ['u1'], isCustom: false }] })
    store.setState({ messages: [message] })
    const original = store.getState()
    const notified = jest.fn()
    const unsubscribe = store.subscribe(notified)
    try {
      original.updateMessage(message)
      original.updateMessage(makeMessage({ id: 'missing' }))
      remove('missing')
      original.addReaction('missing', 'ok', 'u1')
      original.addReaction(message.id, 'ok', 'u1')
      original.removeReaction(message.id, 'ok', 'absent-user')
      original.removeReaction(message.id, 'missing', 'u1')
      original.removeReaction('missing', 'ok', 'u1')
      expect(store.getState()).toBe(original)
      expect(notified).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })

  it('updates reactions immutably without mutating old snapshots or unrelated messages', () => {
    const reaction = { emoji: 'ok', count: 1, userIds: ['u1'], isCustom: false }
    Object.freeze(reaction.userIds)
    Object.freeze(reaction)
    const message = makeMessage({ reactions: [reaction] })
    Object.freeze(message.reactions)
    Object.freeze(message)
    const other = makeMessage()
    const messages = [message, other]
    Object.freeze(messages)
    store.setState({ messages })
    store.getState().addReaction(message.id, 'ok', 'u2')
    expect(reaction).toEqual({ emoji: 'ok', count: 1, userIds: ['u1'], isCustom: false })
    expect(store.getState().messages[0].reactions?.[0]).toEqual({ ...reaction, count: 2, userIds: ['u1', 'u2'] })
    expect(store.getState().messages[1]).toBe(other)
    store.getState().removeReaction(message.id, 'ok', 'u1')
    expect(store.getState().messages[0].reactions?.[0].userIds).toEqual(['u2'])
    store.getState().removeReaction(message.id, 'ok', 'u2')
    expect(store.getState().messages[0].reactions).toEqual([])
    store.getState().addReaction(message.id, 'custom', 'u1', true)
    expect(store.getState().messages[0].reactions).toEqual([
      { emoji: 'custom', count: 1, userIds: ['u1'], isCustom: true }
    ])
  })

  it('notifies once for a real replacement or removal while preserving unrelated references', () => {
    const message = makeMessage()
    const other = makeMessage()
    store.setState({ messages: [message, other] })
    const notified = jest.fn()
    const unsubscribe = store.subscribe(notified)
    try {
      const edited = { ...message, content: 'edited' }
      store.getState().updateMessage(edited)
      expect(store.getState().messages).toEqual([edited, other])
      expect(store.getState().messages[1]).toBe(other)
      expect(notified).toHaveBeenCalledTimes(1)
      remove(message.id)
      expect(store.getState().messages).toEqual([other])
      expect(notified).toHaveBeenCalledTimes(2)
    } finally {
      unsubscribe()
    }
  })
})

it('does not notify for absent or identical channel metadata updates', () => {
  const linkPreviews: NonNullable<ReturnType<typeof makeMessage>['linkPreviews']> = []
  const message = makeMessage({ linkPreviews, threadCount: 1 })
  useMessageStore.setState({ messages: [message] })
  const original = useMessageStore.getState()
  const notified = jest.fn()
  const unsubscribe = useMessageStore.subscribe(notified)
  try {
    original.setLinkPreviews('absent', [])
    original.setLinkPreviews(message.id, linkPreviews)
    original.updateThreadCount('absent', 1)
    original.updateThreadCount(message.id, 1)
    expect(useMessageStore.getState()).toBe(original)
    expect(notified).not.toHaveBeenCalled()
  } finally {
    unsubscribe()
  }
})
