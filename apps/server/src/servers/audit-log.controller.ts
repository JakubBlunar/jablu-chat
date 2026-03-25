import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ServerRole } from '@prisma/client'
import { CurrentUser } from '../auth/current-user.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from './audit-log.service'

@Controller('servers/:serverId/audit-log')
@UseGuards(AuthGuard('jwt'))
export class AuditLogController {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly prisma: PrismaService
  ) {}

  @Get()
  async list(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string },
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string
  ) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId }
    })
    if (!server) throw new NotFoundException('Server not found')

    if (server.ownerId !== user.id) {
      const membership = await this.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId: user.id, serverId } }
      })
      if (!membership) {
        throw new ForbiddenException('You are not a member of this server')
      }
      if (membership.role !== ServerRole.admin && membership.role !== ServerRole.owner) {
        throw new ForbiddenException('Insufficient permissions')
      }
    }

    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 50, 100) : 50
    return this.auditLog.getLog(serverId, limit, cursor)
  }
}
