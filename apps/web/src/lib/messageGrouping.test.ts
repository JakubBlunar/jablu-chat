import type { Message } from '@chat/shared'
import { aggregateReactions, groupMessages } from './messageGrouping'

const msg = (id: string, authorId = id, overrides: Partial<Message> = {}): Message => ({
  id,
  authorId,
  author: { id: authorId, username: authorId, avatarUrl: null },
  channelId: 'channel',
  directConversationId: null,
  threadParentId: null,
  replyToId: null,
  webhookId: null,
  pinned: false,
  content: 'jinx',
  createdAt: '2026-11-07T12:34:01Z',
  editedAt: null,
  ...overrides
})

it('groups distinct people by exact text and clock minute, preserving originals', () => {
  const messages = [msg('a'), msg('b', 'b', { createdAt: '2026-11-07T12:34:59Z' }), msg('c')]
  expect(groupMessages(messages)).toEqual([messages])
  expect(messages[0].id).toBe('a')
})

it('keeps chronological runs, repeated authors, unread boundaries and contexts separate', () => {
  const a = msg('a'),
    b = msg('b')
  expect(groupMessages([a, b], 'b')).toEqual([[a], [b]])
  for (const changed of [
    msg('b', 'a'),
    msg('b', 'b', { channelId: 'other' }),
    msg('b', 'b', { threadParentId: 'thread' }),
    msg('b', 'b', { content: 'Jinx' }),
    msg('b', 'b', { createdAt: '2026-11-07T12:35:00Z' }),
    msg('b', 'b', { replyToId: 'reply' }),
    msg('b', 'b', { attachments: [{}] as Message['attachments'] }),
    msg('b', 'b', { author: null })
  ]) {
    expect(groupMessages([a, changed])).toEqual([[a], [changed]])
  }
  const different = msg('other', 'other', { content: 'interruption' })
  expect(groupMessages([a, different, b])).toEqual([[a], [different], [b]])
})

it('recomputes groups when edited or deleted, including rejoining matching edits', () => {
  const a = msg('a'),
    b = msg('b'),
    c = msg('c')
  const edited = { ...b, content: 'different', editedAt: '2026-11-07T12:34:40Z' }
  expect(groupMessages([a, edited, c])).toEqual([[a], [edited], [c]])
  expect(groupMessages([a, { ...edited, content: 'jinx' }, c])).toHaveLength(1)
  expect(groupMessages([a, c])).toEqual([[a, c]])
})

it('unions reactors per emoji and preserves incomplete preview metadata', () => {
  const reaction = (userIds: string[], usersComplete = true) => ({
    emoji: '🎉',
    userIds,
    count: userIds.length,
    isCustom: false,
    usersComplete
  })
  expect(
    aggregateReactions([
      msg('a', 'a', { reactions: [reaction(['a', 'b'])] }),
      msg('b', 'b', { reactions: [reaction(['b', 'c'])] })
    ])
  ).toEqual([reaction(['a', 'b', 'c'])])
  expect(aggregateReactions([msg('a', 'a', { reactions: [reaction(['a'], false)] })])[0].usersComplete).toBe(false)
})
