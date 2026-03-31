import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import {
  WsChannelIdDto,
  WsConversationIdDto,
  WsDmEditDto,
  WsDmMessageDto,
  WsDmSendDto,
  WsEditMessageDto,
  WsMessageChannelDto,
  WsMessageIdDto,
  WsPollVoteDto,
  WsReactionToggleDto,
  WsSendMessageDto,
  WsVoiceStateDto
} from './gateway.dto'

const UUID = '550e8400-e29b-41d4-a716-446655440000'
const UUID2 = '660e8400-e29b-41d4-a716-446655440000'

function toDto<T>(cls: new () => T, plain: Record<string, unknown>): T {
  return plainToInstance(cls, plain)
}

async function expectValid<T extends object>(cls: new () => T, plain: Record<string, unknown>) {
  const errors = await validate(toDto(cls, plain))
  expect(errors).toHaveLength(0)
}

async function expectInvalid<T extends object>(cls: new () => T, plain: Record<string, unknown>, property: string) {
  const errors = await validate(toDto(cls, plain))
  expect(errors.length).toBeGreaterThan(0)
  expect(errors.some((e) => e.property === property)).toBe(true)
}

describe('WsSendMessageDto', () => {
  it('accepts valid payload with all fields', async () => {
    await expectValid(WsSendMessageDto, {
      channelId: UUID,
      content: 'hello',
      replyToId: UUID2,
      attachmentIds: [UUID],
      threadParentId: UUID2
    })
  })

  it('accepts minimal payload (channelId only)', async () => {
    await expectValid(WsSendMessageDto, { channelId: UUID })
  })

  it('rejects missing channelId', async () => {
    await expectInvalid(WsSendMessageDto, { content: 'hello' }, 'channelId')
  })

  it('rejects non-UUID channelId', async () => {
    await expectInvalid(WsSendMessageDto, { channelId: 'not-a-uuid' }, 'channelId')
  })

  it('rejects content exceeding max length', async () => {
    await expectInvalid(WsSendMessageDto, {
      channelId: UUID,
      content: 'x'.repeat(4001)
    }, 'content')
  })

  it('rejects non-UUID attachmentIds', async () => {
    await expectInvalid(WsSendMessageDto, {
      channelId: UUID,
      attachmentIds: ['not-uuid']
    }, 'attachmentIds')
  })

  it('rejects too many attachmentIds', async () => {
    await expectInvalid(WsSendMessageDto, {
      channelId: UUID,
      attachmentIds: Array.from({ length: 21 }, () => UUID)
    }, 'attachmentIds')
  })
})

describe('WsEditMessageDto', () => {
  it('accepts valid payload', async () => {
    await expectValid(WsEditMessageDto, { messageId: UUID, content: 'updated' })
  })

  it('rejects missing messageId', async () => {
    await expectInvalid(WsEditMessageDto, { content: 'updated' }, 'messageId')
  })

  it('rejects empty content', async () => {
    await expectInvalid(WsEditMessageDto, { messageId: UUID, content: '' }, 'content')
  })

  it('rejects content exceeding max length', async () => {
    await expectInvalid(WsEditMessageDto, {
      messageId: UUID,
      content: 'x'.repeat(4001)
    }, 'content')
  })
})

describe('WsMessageIdDto', () => {
  it('accepts valid UUID', async () => {
    await expectValid(WsMessageIdDto, { messageId: UUID })
  })

  it('rejects missing messageId', async () => {
    await expectInvalid(WsMessageIdDto, {}, 'messageId')
  })

  it('rejects non-UUID messageId', async () => {
    await expectInvalid(WsMessageIdDto, { messageId: '123' }, 'messageId')
  })
})

describe('WsReactionToggleDto', () => {
  it('accepts valid payload', async () => {
    await expectValid(WsReactionToggleDto, { messageId: UUID, emoji: '👍' })
  })

  it('accepts payload with isCustom', async () => {
    await expectValid(WsReactionToggleDto, { messageId: UUID, emoji: 'custom_emoji', isCustom: true })
  })

  it('rejects missing emoji', async () => {
    await expectInvalid(WsReactionToggleDto, { messageId: UUID }, 'emoji')
  })

  it('rejects empty emoji', async () => {
    await expectInvalid(WsReactionToggleDto, { messageId: UUID, emoji: '' }, 'emoji')
  })

  it('rejects emoji exceeding 50 chars', async () => {
    await expectInvalid(WsReactionToggleDto, {
      messageId: UUID,
      emoji: 'x'.repeat(51)
    }, 'emoji')
  })

  it('rejects non-boolean isCustom', async () => {
    await expectInvalid(WsReactionToggleDto, {
      messageId: UUID,
      emoji: '👍',
      isCustom: 'yes'
    }, 'isCustom')
  })
})

describe('WsMessageChannelDto', () => {
  it('accepts valid payload', async () => {
    await expectValid(WsMessageChannelDto, { messageId: UUID, channelId: UUID2 })
  })

  it('rejects missing messageId', async () => {
    await expectInvalid(WsMessageChannelDto, { channelId: UUID }, 'messageId')
  })

  it('rejects missing channelId', async () => {
    await expectInvalid(WsMessageChannelDto, { messageId: UUID }, 'channelId')
  })
})

describe('WsPollVoteDto', () => {
  it('accepts valid payload', async () => {
    await expectValid(WsPollVoteDto, { pollId: UUID, optionId: UUID2 })
  })

  it('rejects missing pollId', async () => {
    await expectInvalid(WsPollVoteDto, { optionId: UUID }, 'pollId')
  })

  it('rejects missing optionId', async () => {
    await expectInvalid(WsPollVoteDto, { pollId: UUID }, 'optionId')
  })
})

describe('WsChannelIdDto', () => {
  it('accepts valid UUID', async () => {
    await expectValid(WsChannelIdDto, { channelId: UUID })
  })

  it('rejects missing channelId', async () => {
    await expectInvalid(WsChannelIdDto, {}, 'channelId')
  })

  it('rejects non-UUID', async () => {
    await expectInvalid(WsChannelIdDto, { channelId: 'abc' }, 'channelId')
  })
})

describe('WsDmSendDto', () => {
  it('accepts valid payload with all fields', async () => {
    await expectValid(WsDmSendDto, {
      conversationId: UUID,
      content: 'hello',
      replyToId: UUID2,
      attachmentIds: [UUID]
    })
  })

  it('accepts minimal payload (conversationId only)', async () => {
    await expectValid(WsDmSendDto, { conversationId: UUID })
  })

  it('rejects missing conversationId', async () => {
    await expectInvalid(WsDmSendDto, { content: 'hello' }, 'conversationId')
  })

  it('rejects content exceeding max length', async () => {
    await expectInvalid(WsDmSendDto, {
      conversationId: UUID,
      content: 'x'.repeat(4001)
    }, 'content')
  })
})

describe('WsDmEditDto', () => {
  it('accepts valid payload', async () => {
    await expectValid(WsDmEditDto, {
      conversationId: UUID,
      messageId: UUID2,
      content: 'edited'
    })
  })

  it('rejects missing conversationId', async () => {
    await expectInvalid(WsDmEditDto, { messageId: UUID, content: 'x' }, 'conversationId')
  })

  it('rejects empty content', async () => {
    await expectInvalid(WsDmEditDto, {
      conversationId: UUID,
      messageId: UUID2,
      content: ''
    }, 'content')
  })
})

describe('WsDmMessageDto', () => {
  it('accepts valid payload', async () => {
    await expectValid(WsDmMessageDto, { conversationId: UUID, messageId: UUID2 })
  })

  it('rejects missing conversationId', async () => {
    await expectInvalid(WsDmMessageDto, { messageId: UUID }, 'conversationId')
  })

  it('rejects missing messageId', async () => {
    await expectInvalid(WsDmMessageDto, { conversationId: UUID }, 'messageId')
  })
})

describe('WsConversationIdDto', () => {
  it('accepts valid UUID', async () => {
    await expectValid(WsConversationIdDto, { conversationId: UUID })
  })

  it('rejects missing conversationId', async () => {
    await expectInvalid(WsConversationIdDto, {}, 'conversationId')
  })

  it('rejects non-UUID', async () => {
    await expectInvalid(WsConversationIdDto, { conversationId: 'nope' }, 'conversationId')
  })
})

describe('WsVoiceStateDto', () => {
  it('accepts all boolean fields', async () => {
    await expectValid(WsVoiceStateDto, {
      muted: true,
      deafened: false,
      camera: true,
      screenShare: false
    })
  })

  it('accepts empty object (all fields optional)', async () => {
    await expectValid(WsVoiceStateDto, {})
  })

  it('accepts partial fields', async () => {
    await expectValid(WsVoiceStateDto, { muted: true })
  })

  it('rejects non-boolean muted', async () => {
    await expectInvalid(WsVoiceStateDto, { muted: 'yes' }, 'muted')
  })

  it('rejects non-boolean deafened', async () => {
    await expectInvalid(WsVoiceStateDto, { deafened: 1 }, 'deafened')
  })

  it('rejects non-boolean camera', async () => {
    await expectInvalid(WsVoiceStateDto, { camera: 'on' }, 'camera')
  })

  it('rejects non-boolean screenShare', async () => {
    await expectInvalid(WsVoiceStateDto, { screenShare: 'off' }, 'screenShare')
  })
})
