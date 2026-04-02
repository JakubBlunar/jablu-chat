import { groupReactions, mapMessageToWire, mapDmMessageToWire } from './message-wire'

function makeBaseMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    channelId: 'ch-1',
    directConversationId: null,
    authorId: 'user-1',
    content: 'Hello',
    deleted: false,
    pinned: false,
    editedAt: null,
    createdAt: new Date('2024-06-01'),
    threadParentId: null,
    replyToId: null,
    webhookId: null,
    webhookName: null,
    webhookAvatarUrl: null,
    author: { id: 'user-1', username: 'alice', displayName: 'Alice', avatarUrl: null, isBot: false },
    attachments: [],
    reactions: [],
    replyTo: null,
    linkPreviews: [],
    webhook: null,
    poll: null,
    _count: { threadMessages: 0 },
    threadMessages: [],
    ...overrides,
  } as any
}

describe('groupReactions', () => {
  it('returns empty array for no reactions', () => {
    expect(groupReactions([])).toEqual([])
  })

  it('groups a single reaction', () => {
    const result = groupReactions([{ emoji: '👍', userId: 'u1', isCustom: false }])
    expect(result).toEqual([{ emoji: '👍', count: 1, userIds: ['u1'], isCustom: false }])
  })

  it('groups multiple users on the same emoji', () => {
    const result = groupReactions([
      { emoji: '👍', userId: 'u1', isCustom: false },
      { emoji: '👍', userId: 'u2', isCustom: false },
      { emoji: '👍', userId: 'u3', isCustom: false },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].count).toBe(3)
    expect(result[0].userIds).toEqual(['u1', 'u2', 'u3'])
  })

  it('keeps different emojis separate', () => {
    const result = groupReactions([
      { emoji: '👍', userId: 'u1', isCustom: false },
      { emoji: '❤️', userId: 'u2', isCustom: false },
    ])
    expect(result).toHaveLength(2)
    expect(result[0].emoji).toBe('👍')
    expect(result[1].emoji).toBe('❤️')
  })

  it('handles custom emojis', () => {
    const result = groupReactions([
      { emoji: 'custom_pepe', userId: 'u1', isCustom: true },
      { emoji: 'custom_pepe', userId: 'u2', isCustom: true },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].isCustom).toBe(true)
    expect(result[0].count).toBe(2)
  })
})

describe('mapMessageToWire', () => {
  it('maps a basic message with no extras', () => {
    const msg = makeBaseMessage()
    const wire = mapMessageToWire(msg)

    expect(wire.id).toBe('msg-1')
    expect(wire.content).toBe('Hello')
    expect(wire.threadCount).toBe(0)
    expect(wire.lastThreadReply).toBeNull()
    expect(wire.reactions).toEqual([])
    expect(wire.webhook).toBeNull()
    expect(wire.poll).toBeNull()
  })

  it('maps threadCount from _count', () => {
    const msg = makeBaseMessage({ _count: { threadMessages: 5 } })
    expect(mapMessageToWire(msg).threadCount).toBe(5)
  })

  it('maps lastThreadReply from threadMessages', () => {
    const replyDate = new Date('2024-06-02')
    const msg = makeBaseMessage({
      threadMessages: [{
        content: 'reply text',
        createdAt: replyDate,
        author: { id: 'u2', username: 'bob', displayName: 'Bob', avatarUrl: null },
      }],
    })
    const wire = mapMessageToWire(msg)
    expect(wire.lastThreadReply).toEqual({
      content: 'reply text',
      author: { id: 'u2', username: 'bob', displayName: 'Bob', avatarUrl: null },
      createdAt: replyDate.toISOString(),
    })
  })

  it('handles lastThreadReply with string createdAt', () => {
    const msg = makeBaseMessage({
      threadMessages: [{
        content: 'reply',
        createdAt: '2024-06-02T00:00:00.000Z',
        author: null,
      }],
    })
    const wire = mapMessageToWire(msg)
    expect(wire.lastThreadReply!.createdAt).toBe('2024-06-02T00:00:00.000Z')
    expect(wire.lastThreadReply!.author).toBeNull()
  })

  it('maps webhook from webhookId with inline name/avatar', () => {
    const msg = makeBaseMessage({
      webhookId: 'wh-1',
      webhookName: 'My Bot',
      webhookAvatarUrl: 'https://example.com/bot.png',
      webhook: { name: 'Fallback', avatarUrl: null },
    })
    const wire = mapMessageToWire(msg)
    expect(wire.webhook).toEqual({
      name: 'My Bot',
      avatarUrl: 'https://example.com/bot.png',
    })
  })

  it('falls back to webhook relation name', () => {
    const msg = makeBaseMessage({
      webhookId: 'wh-1',
      webhookName: null,
      webhookAvatarUrl: null,
      webhook: { name: 'Relation Name', avatarUrl: 'https://rel.png' },
    })
    const wire = mapMessageToWire(msg)
    expect(wire.webhook).toEqual({
      name: 'Relation Name',
      avatarUrl: 'https://rel.png',
    })
  })

  it('falls back to "Webhook" when no name anywhere', () => {
    const msg = makeBaseMessage({
      webhookId: 'wh-1',
      webhookName: null,
      webhookAvatarUrl: null,
      webhook: { name: null, avatarUrl: null },
    })
    const wire = mapMessageToWire(msg)
    expect(wire.webhook!.name).toBe('Webhook')
    expect(wire.webhook!.avatarUrl).toBeNull()
  })

  it('returns null webhook when webhookId is null', () => {
    const msg = makeBaseMessage({ webhookId: null })
    expect(mapMessageToWire(msg).webhook).toBeNull()
  })

  it('maps poll with voted flag for requesting user', () => {
    const msg = makeBaseMessage({
      poll: {
        id: 'poll-1',
        messageId: 'msg-1',
        question: 'Favorite color?',
        multiSelect: false,
        expiresAt: new Date('2025-01-01'),
        createdAt: new Date('2024-06-01'),
        options: [
          { id: 'opt-1', label: 'Red', position: 0, votes: [{ userId: 'user-1' }] },
          { id: 'opt-2', label: 'Blue', position: 1, votes: [{ userId: 'user-2' }] },
        ],
      },
    })

    const wire = mapMessageToWire(msg, 'user-1')
    expect(wire.poll!.question).toBe('Favorite color?')
    expect(wire.poll!.options[0].voted).toBe(true)
    expect(wire.poll!.options[0].voteCount).toBe(1)
    expect(wire.poll!.options[1].voted).toBe(false)
  })

  it('sets voted=false for all options when no requestingUserId', () => {
    const msg = makeBaseMessage({
      poll: {
        id: 'poll-1',
        messageId: 'msg-1',
        question: 'Q?',
        multiSelect: false,
        expiresAt: null,
        createdAt: new Date('2024-06-01'),
        options: [
          { id: 'opt-1', label: 'A', position: 0, votes: [{ userId: 'user-1' }] },
        ],
      },
    })

    const wire = mapMessageToWire(msg)
    expect(wire.poll!.expiresAt).toBeNull()
    expect(wire.poll!.options[0].voted).toBe(false)
  })

  it('returns null poll when message has no poll', () => {
    expect(mapMessageToWire(makeBaseMessage()).poll).toBeNull()
  })

  it('includes isBot flag in author', () => {
    const msg = makeBaseMessage({
      author: { id: 'bot-1', username: 'freebot', displayName: 'FreeGameBot', avatarUrl: null, isBot: true },
    })
    const wire = mapMessageToWire(msg)
    expect(wire.author!.isBot).toBe(true)
  })

  it('groups reactions in the wire output', () => {
    const msg = makeBaseMessage({
      reactions: [
        { emoji: '👍', userId: 'u1', isCustom: false },
        { emoji: '👍', userId: 'u2', isCustom: false },
      ],
    })
    const wire = mapMessageToWire(msg)
    expect(wire.reactions).toHaveLength(1)
    expect(wire.reactions[0].count).toBe(2)
  })
})

describe('mapDmMessageToWire', () => {
  it('maps a DM message with grouped reactions', () => {
    const msg = {
      id: 'dm-msg-1',
      directConversationId: 'conv-1',
      channelId: null,
      authorId: 'u1',
      content: 'Hi',
      deleted: false,
      pinned: false,
      editedAt: null,
      createdAt: new Date('2024-06-01'),
      threadParentId: null,
      replyToId: null,
      webhookId: null,
      webhookName: null,
      webhookAvatarUrl: null,
      author: { id: 'u1', username: 'alice', displayName: 'Alice', avatarUrl: null },
      attachments: [],
      reactions: [
        { emoji: '❤️', userId: 'u2', isCustom: false },
        { emoji: '❤️', userId: 'u3', isCustom: false },
      ],
      replyTo: null,
      linkPreviews: [],
    } as any

    const wire = mapDmMessageToWire(msg)
    expect(wire.id).toBe('dm-msg-1')
    expect(wire.content).toBe('Hi')
    expect(wire.reactions).toHaveLength(1)
    expect(wire.reactions[0].count).toBe(2)
  })

  it('returns empty reactions for a message with none', () => {
    const msg = {
      id: 'dm-msg-2',
      reactions: [],
      content: 'Hello',
      author: { id: 'u1' },
      attachments: [],
      replyTo: null,
      linkPreviews: [],
    } as any

    const wire = mapDmMessageToWire(msg)
    expect(wire.reactions).toEqual([])
  })
})
