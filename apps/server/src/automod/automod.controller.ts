import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { AutoModType } from '@prisma/client'
import { CurrentUser } from '../auth/current-user.decorator'
import { AutoModService } from './automod.service'

@Controller('servers/:serverId/automod')
@UseGuards(AuthGuard('jwt'))
export class AutoModController {
  constructor(private readonly automod: AutoModService) {}

  @Get()
  getRules(
    @Param('serverId', ParseUUIDPipe) serverId: string
  ) {
    return this.automod.getRules(serverId)
  }

  @Get(':type')
  getRule(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('type') type: AutoModType
  ) {
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
