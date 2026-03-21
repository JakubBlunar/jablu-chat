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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../auth/current-user.decorator';
import { ChannelsService } from './channels.service';
import { CreateChannelDto, UpdateChannelDto } from './dto';

@Controller('servers/:serverId/channels')
@UseGuards(AuthGuard('jwt'))
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Post()
  create(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Body() dto: CreateChannelDto,
  ) {
    return this.channels.createChannel(
      serverId,
      user.id,
      dto.name,
      dto.type,
    );
  }

  @Get()
  list(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
  ) {
    return this.channels.getChannels(serverId, user.id);
  }

  @Patch(':id')
  update(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('id', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Body() dto: UpdateChannelDto,
  ) {
    return this.channels.updateChannel(serverId, channelId, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('id', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
  ) {
    await this.channels.deleteChannel(serverId, channelId, user.id);
  }
}
