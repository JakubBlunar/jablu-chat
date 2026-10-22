import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    serverId: string,
    actorId: string,
    action: string,
    targetType?: string,
    targetId?: string,
    details?: string
  ) {
    return this.prisma.auditLog.create({
      data: { serverId, actorId, action, targetType, targetId, details }
    })
  }

  async getLog(serverId: string, limit = 50, cursor?: string, filters: { search?: string; action?: string } = {}) {
    const take = Math.min(Math.max(1, limit), 100)
    const [timestamp, id] = cursor?.split('|') ?? []
    const search = filters.search?.trim()

    const rows = await this.prisma.auditLog.findMany({
      where: {
        serverId,
        ...(filters.action ? { action: filters.action } : {}),
        AND: [
          ...(timestamp
            ? [
                id
                  ? {
                      OR: [
                        { createdAt: { lt: new Date(timestamp) } },
                        { createdAt: new Date(timestamp), id: { lt: id } }
                      ]
                    }
                  : { createdAt: { lt: new Date(timestamp) } }
              ]
            : []),
          ...(search
            ? [
                {
                  OR: [
                    { actor: { username: { contains: search, mode: 'insensitive' as const } } },
                    { actor: { displayName: { contains: search, mode: 'insensitive' as const } } },
                    { details: { contains: search, mode: 'insensitive' as const } },
                    { targetId: { contains: search, mode: 'insensitive' as const } }
                  ]
                }
              ]
            : [])
        ]
      },
      include: {
        actor: { select: { id: true, username: true, displayName: true, avatarUrl: true } }
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1
    })

    const hasMore = rows.length > take
    const page = hasMore ? rows.slice(0, take) : rows

    const last = page[page.length - 1]
    return { entries: page, hasMore, nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null }
  }
}
