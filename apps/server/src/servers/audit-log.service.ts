import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    serverId: string,
    actorId: string,
    action: string,
    targetType?: string,
    targetId?: string,
    details?: string,
  ) {
    return this.prisma.auditLog.create({
      data: { serverId, actorId, action, targetType, targetId, details },
    });
  }

  async getLog(serverId: string, limit = 50, cursor?: string) {
    const take = Math.min(Math.max(1, limit), 100);

    const rows = await this.prisma.auditLog.findMany({
      where: {
        serverId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      include: {
        actor: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    return { entries: page, hasMore };
  }
}
