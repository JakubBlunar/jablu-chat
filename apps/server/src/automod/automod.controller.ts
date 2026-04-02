import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { AutoModType } from '@prisma/client'
import { Permission } from '@chat/shared'
import { CurrentUser } from '../auth/current-user.decorator'
import { RolesService } from '../roles/roles.service'
import { AutoModService } from './automod.service'

@Controller('servers/:serverId/automod')
@UseGuards(UnifiedAuthGuard)
export class AutoModController {
  constructor(
    private readonly automod: AutoModService,
    private readonly roles: RolesService,
  ) {}

  @Get()
  async getRules(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string },
  ) {
    await this.roles.requirePermission(serverId, user.id, Permission.MANAGE_SERVER)
    return this.automod.getRules(serverId)
  }

  @Get(':type')
  async getRule(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('type') type: AutoModType,
    @CurrentUser() user: { id: string },
  ) {
    await this.roles.requirePermission(serverId, user.id, Permission.MANAGE_SERVER)
    return this.automod.getRule(serverId, type)
  }

  @Put(':type')
  upsertRule(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('type') type: AutoModType,
    @CurrentUser() user: { id: string },
    @Body() body: { enabled: boolean; config: Record<string, unknown> }
  ) {
    return this.automod.upsertRule(serverId, user.id, type, body.enabled, body.config as any)
  }
}
