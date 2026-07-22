import { ServerEventsService } from './server-events.service'
import { createMockPrismaService, type MockPrismaService } from '../__mocks__/prisma.mock'

function createService(prisma: MockPrismaService): ServerEventsService {
  const stub: any = {}
  return new ServerEventsService(
    prisma as any,
    { client: {} } as any, // redis
    stub, // push
    stub, // eventBus
    stub, // schedulerRegistry
    stub // roles
  )
}

describe('ServerEventsService cleanup', () => {
  let prisma: MockPrismaService
  let service: ServerEventsService

  beforeEach(() => {
    prisma = createMockPrismaService()
    service = createService(prisma)
  })

  describe('cleanupOldEvents', () => {
    it('deletes finished events past retention and stale non-recurring events', async () => {
      prisma.serverEvent.deleteMany.mockResolvedValue({ count: 3 })

      await (service as any).cleanupOldEvents()

      expect(prisma.serverEvent.deleteMany).toHaveBeenCalledTimes(1)
      const where = prisma.serverEvent.deleteMany.mock.calls[0][0].where
      expect(Array.isArray(where.OR)).toBe(true)

      const finished = where.OR.find((c: any) => c.status?.in?.includes('completed'))
      expect(finished).toBeDefined()
      expect(finished.updatedAt.lt).toBeInstanceOf(Date)

      const stale = where.OR.find((c: any) => c.recurrenceRule === null)
      expect(stale).toBeDefined()
      expect(stale.status.in).toEqual(expect.arrayContaining(['scheduled', 'active']))
      expect(stale.startAt.lt).toBeInstanceOf(Date)
    })
  })

  describe('completeEndedEvents', () => {
    it('completes ended events and force-completes no-end active events past grace', async () => {
      prisma.serverEvent.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }])
      const completeSpy = jest
        .spyOn(service as any, 'completeEvent')
        .mockResolvedValue(undefined)

      await (service as any).completeEndedEvents()

      const where = prisma.serverEvent.findMany.mock.calls[0][0].where
      expect(where.status).toBe('active')
      expect(Array.isArray(where.OR)).toBe(true)

      const endedBranch = where.OR.find((c: any) => c.endAt?.lte instanceof Date)
      expect(endedBranch).toBeDefined()

      const noEndBranch = where.OR.find((c: any) => c.endAt === null)
      expect(noEndBranch).toBeDefined()
      expect(noEndBranch.startAt.lte).toBeInstanceOf(Date)

      expect(completeSpy).toHaveBeenCalledWith('e1')
      expect(completeSpy).toHaveBeenCalledWith('e2')
    })
  })
})
