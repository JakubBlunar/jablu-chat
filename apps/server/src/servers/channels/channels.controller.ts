import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards
} from '@nestjs/common'
import { CurrentUser } from '../../auth/current-user.decorator'
import { UnifiedAuthGuard } from '../../auth/unified-auth.guard'
import { ChannelsService } from './channels.service'
import { CreateChannelDto, ReorderChannelsDto, UpdateChannelDto } from './dto'

@Controller('servers/:serverId/channels')
@UseGuards(UnifiedAuthGuard)
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Post()
  create(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Body() dto: CreateChannelDto
  ) {
    return this.channels.createChannel(serverId, user.id, dto.name, dto.type, dto.categoryId, {
      defaultSortOrder: dto.defaultSortOrder,
      defaultLayout: dto.defaultLayout,
      postGuidelines: dto.postGuidelines,
      requireTags: dto.requireTags
    })
  }

  @Get()
  list(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string; username: string; email: string }
  ) {
    return this.channels.getChannels(serverId, user.id)
  }

  @Patch('reorder')
  reorder(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Body() dto: ReorderChannelsDto
  ) {
    return this.channels.reorderChannels(serverId, user.id, dto.channelIds)
  }

  @Patch(':id')
  update(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('id', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Body() dto: UpdateChannelDto
  ) {
    return this.channels.updateChannel(serverId, channelId, user.id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('id', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string; username: string; email: string }
  ) {
    await this.channels.deleteChannel(serverId, channelId, user.id)
  }
}
