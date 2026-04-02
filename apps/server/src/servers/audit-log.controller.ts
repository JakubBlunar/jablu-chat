import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards
} from '@nestjs/common'
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
    @Query('cursor') cursor?: string
  ) {
    await this.roles.requirePermission(serverId, user.id, Permission.MANAGE_SERVER)
    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 50, 100) : 50
    return this.auditLog.getLog(serverId, limit, cursor)
  }
}
