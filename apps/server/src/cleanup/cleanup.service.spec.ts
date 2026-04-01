import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import { CleanupService } from './cleanup.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

describe('CleanupService', () => {
  let service: CleanupService
  let prisma: MockPrismaService
  let uploads: { getUploadDir: jest.Mock; deleteFile: jest.Mock }
  let config: { get: jest.Mock }
  let scheduler: { addCronJob: jest.Mock }

  beforeEach(() => {
    prisma = createMockPrismaService()
    uploads = {
      getUploadDir: jest.fn().mockReturnValue('/tmp/uploads'),
      deleteFile: jest.fn()
    }
    config = {
      get: jest.fn((key: string, defaultValue: unknown) => {
        const values: Record<string, unknown> = {
          STORAGE_LIMIT_GB: 100,
          CLEANUP_MIN_AGE_DAYS: 30,
          CLEANUP_ORPHAN_HOURS: 24,
          CLEANUP_DELETE_MESSAGES: 'true',
          CLEANUP_SKIP_ARCHIVED: 'true',
          CLEANUP_ENABLED: 'false'
        }
        return values[key] ?? defaultValue
      })
    }
    scheduler = { addCronJob: jest.fn() }

    service = new CleanupService(
      prisma as any,
      uploads as any,
      config as unknown as ConfigService,
      scheduler as unknown as SchedulerRegistry
    )
  })

  it('classifies old forum posts separately in audit totals', async () => {
    jest.spyOn(service, 'calculateDirSize').mockResolvedValue(1024)
    jest.spyOn(service as any, 'scanDiskOrphans').mockResolvedValue({ count: 1, bytes: 10 })

    prisma.attachment.findMany
      .mockResolvedValueOnce([{ sizeBytes: 5 }])
      .mockResolvedValueOnce([{ sizeBytes: 7 }])

    prisma.message.findMany
      .mockResolvedValueOnce([
        {
          id: 'forum-post-1',
          attachments: [{ sizeBytes: 11 }],
          threadMessages: [{ attachments: [{ sizeBytes: 13 }] }]
        }
      ])
      .mockResolvedValueOnce([{ id: 'msg-1', attachments: [{ sizeBytes: 17 }] }])

    prisma.storageAudit.create.mockResolvedValue({ id: 'audit-1' })

    await service.runAudit()

    expect(prisma.storageAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        forumPostCount: 1,
        forumPostBytes: BigInt(24),
        messageCount: 1,
        messageBytes: BigInt(17),
        totalFreeable: BigInt(63)
      })
    })

    const [, oldMessagesCall] = prisma.message.findMany.mock.calls
    expect(oldMessagesCall[0].where.OR).toEqual([{ channelId: null }, { channel: { type: { not: 'forum' } } }])
  })

  it('runs cleanup phases in order including forum phase', async () => {
    prisma.storageAudit.findUnique.mockResolvedValue({ id: 'audit-1', status: 'completed' })
    prisma.storageAudit.update.mockResolvedValue({ id: 'audit-1', status: 'executed' })
    jest.spyOn(service as any, 'currentSize').mockResolvedValue(1_000_000_000_000)

    const order: string[] = []
    jest.spyOn(service as any, 'cleanOrphanedAttachments').mockImplementation(async () => {
      order.push('orphans')
      return 1
    })
    jest.spyOn(service as any, 'cleanDiskOrphans').mockImplementation(async () => {
      order.push('disk')
      return 2
    })
    jest.spyOn(service as any, 'cleanOldAttachments').mockImplementation(async () => {
      order.push('attachments')
      return 3
    })
    jest.spyOn(service as any, 'cleanOldForumPosts').mockImplementation(async () => {
      order.push('forum')
      return 4
    })
    jest.spyOn(service as any, 'cleanOldMessages').mockImplementation(async () => {
      order.push('messages')
      return 5
    })
    const finalizeSpy = jest.spyOn(service as any, 'finalizeAudit').mockResolvedValue({ id: 'audit-1' })

    await service.executeCleanup('audit-1')

    expect(order).toEqual(['orphans', 'disk', 'attachments', 'forum', 'messages'])
    expect(finalizeSpy).toHaveBeenCalledWith('audit-1', 15)
  })
})
