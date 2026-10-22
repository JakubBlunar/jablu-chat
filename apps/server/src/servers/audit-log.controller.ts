import { Controller, BadRequestException, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { Permission } from '@chat/shared'
import { CurrentUser } from '../auth/current-user.decorator'
import { RolesService } from '../roles/roles.service'
import { AuditLogService } from './audit-log.service'

@Controller('servers/:serverId/audit-log')
@UseGuards(UnifiedAuthGuard)
export class AuditLogController {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly roles: RolesService
  ) {}

  @Get()
  async list(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string },
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string,
    @Query('search') search?: string,
    @Query('action') action?: string
  ) {
    await this.roles.requirePermission(serverId, user.id, Permission.MANAGE_SERVER)
    if (cursor) {
      const [timestamp, id, extra] = cursor.split('|')
      if (
        !Number.isFinite(Date.parse(timestamp)) ||
        extra !== undefined ||
        (id !== undefined && !/^[0-9a-f-]{36}$/i.test(id))
      ) {
        throw new BadRequestException('Invalid audit log cursor')
      }
    }
    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 50, 100) : 50
    return this.auditLog.getLog(serverId, limit, cursor, {
      search: search?.slice(0, 200),
      action: action?.slice(0, 100)
    })
  }
}
