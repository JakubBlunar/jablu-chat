import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { MessagesService } from './messages.service'
import { PrismaService } from '../prisma/prisma.service'
import { createMockPrismaService } from '../__mocks__/prisma.mock'
import { RolesService } from '../roles/roles.service'
import { XpService } from '../xp/xp.service'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { WsReactionSetManyDto } from '../gateway/gateway.dto'

const UUID = '550e8400-e29b-41d4-a716-446655440000'
const UUID2 = '660e8400-e29b-41d4-a716-446655440000'
const prisma = createMockPrismaService()
const service = new MessagesService(prisma as unknown as PrismaService, {} as RolesService, {} as XpService)
const rows = [
  { id: UUID, channelId: 'channel', directConversationId: null },
  { id: UUID2, channelId: 'channel', directConversationId: null }
]

beforeEach(() => {
  jest.resetAllMocks()
  prisma.message.findMany.mockResolvedValue(rows)
  jest.spyOn(service as any, 'requireMessageChannelMember').mockResolvedValue(undefined)
  prisma.$transaction.mockImplementation((run) => run(prisma))
  prisma.reaction.createManyAndReturn.mockResolvedValue([{ messageId: UUID }])
  prisma.reaction.findMany.mockResolvedValue([{ messageId: UUID }])
})

it('rejects empty, oversized, duplicated, malformed targets and missing desired state', async () => {
  for (const messageIds of [[], [UUID, UUID], ['invalid'], Array(51).fill(UUID)]) {
    const errors = await validate(plainToInstance(WsReactionSetManyDto, { messageIds, emoji: '🎉', present: true }))
    expect(errors.length).toBeGreaterThan(0)
  }
  expect(
    await validate(plainToInstance(WsReactionSetManyDto, { messageIds: [UUID, UUID2], emoji: '🎉', present: true }))
  ).toHaveLength(0)
  expect(await validate(plainToInstance(WsReactionSetManyDto, { messageIds: [UUID], emoji: '🎉' }))).not.toHaveLength(0)
})

it('adds in one idempotent transaction and returns only actual changes for broadcast', async () => {
  const result = await service.setManyReactions([UUID, UUID2], 'user', '🎉', false, true)
  expect(result.changedIds).toEqual([UUID])
  expect(result.action).toBe('added')
  expect(prisma.reaction.createManyAndReturn).toHaveBeenCalledWith({
    data: [UUID, UUID2].map((messageId) => ({ messageId, userId: 'user', emoji: '🎉', isCustom: false })),
    skipDuplicates: true,
    select: { messageId: true }
  })
})

it('removes in bulk, preserving the exact originals changed', async () => {
  const result = await service.setManyReactions([UUID, UUID2], 'user', '🎉', false, false)
  expect(result.changedIds).toEqual([UUID])
  expect(result.action).toBe('removed')
  expect(prisma.reaction.deleteMany).toHaveBeenCalledTimes(1)
})

it('checks every target and access before any mutation', async () => {
  prisma.message.findMany.mockResolvedValueOnce([rows[0]])
  await expect(service.setManyReactions([UUID, UUID2], 'user', '🎉', false, true)).rejects.toThrow(NotFoundException)
  prisma.message.findMany.mockResolvedValueOnce([rows[0], { ...rows[1], channelId: 'private' }])
  await expect(service.setManyReactions([UUID, UUID2], 'user', '🎉', false, true)).rejects.toThrow(BadRequestException)
  jest.spyOn(service as any, 'requireMessageChannelMember').mockRejectedValueOnce(new ForbiddenException())
  await expect(service.setManyReactions([UUID, UUID2], 'user', '🎉', false, true)).rejects.toThrow(ForbiddenException)
  expect(prisma.$transaction).not.toHaveBeenCalled()
})

it('checks DM membership and prevents mixing DM conversations', async () => {
  prisma.message.findMany.mockResolvedValue(rows.map((r) => ({ ...r, channelId: null, directConversationId: 'dm' })))
  prisma.directConversationMember.findUnique.mockResolvedValueOnce(null)
  await expect(service.setManyReactions([UUID, UUID2], 'user', '🎉', false, true)).rejects.toThrow(ForbiddenException)
  expect(prisma.$transaction).not.toHaveBeenCalled()
  prisma.directConversationMember.findUnique.mockResolvedValueOnce({ userId: 'user' })
  await expect(service.setManyReactions([UUID, UUID2], 'user', '🎉', false, true)).resolves.toMatchObject({
    directConversationId: 'dm'
  })
})
