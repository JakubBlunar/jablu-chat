import { BadRequestException } from '@nestjs/common'
import { createMockPrismaService } from '../__mocks__/prisma.mock'
import { findMessageReplay } from './message-replay'

describe('findMessageReplay', () => {
  const prisma = createMockPrismaService()
  const message = {
    id: 'client-id',
    authorId: 'alice',
    channelId: 'channel',
    directConversationId: null,
    threadParentId: null
  }
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.message.findUnique.mockResolvedValue(message)
  })
  it('does not change delivery for older clients', async () => {
    expect(await findMessageReplay(prisma, undefined, 'alice', { channelId: 'channel' })).toBeNull()
    expect(prisma.message.findUnique).not.toHaveBeenCalled()
  })
  it('returns only the same author and destination on retry', async () => {
    expect(await findMessageReplay(prisma, 'client-id', 'alice', { channelId: 'channel' })).toBe(message)
  })
  it.each([
    ['bob', { channelId: 'channel' }],
    ['alice', { channelId: 'other' }],
    ['alice', { conversationId: 'channel' }],
    ['alice', { channelId: 'channel', threadParentId: 'thread' }]
  ])('rejects reuse in another account or destination', async (userId, destination) => {
    await expect(findMessageReplay(prisma, 'client-id', userId, destination)).rejects.toThrow(BadRequestException)
  })
})
