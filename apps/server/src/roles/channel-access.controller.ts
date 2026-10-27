import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { ChannelAccessService } from './channel-access.service'

@Controller('servers/:serverId/channels/:channelId/access')
@UseGuards(UnifiedAuthGuard)
export class ChannelAccessController {
  constructor(private readonly access: ChannelAccessService) {}

  @Get()
  get(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.access.getContext(serverId, channelId, user.id)
  }

  @Put()
  save(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown
  ) {
    return this.access.save(serverId, channelId, user.id, body)
  }
}
