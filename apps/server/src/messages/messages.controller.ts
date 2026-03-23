import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  EditMessageDto,
  MessageQueryDto,
  SendMessageDto,
  ToggleReactionDto,
} from './dto';
import { MessagesService } from './messages.service';

@Controller('channels/:channelId/messages')
@UseGuards(AuthGuard('jwt'))
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Query() query: MessageQueryDto,
  ) {
    const limit = query.limit ?? 50;
    if (query.around) {
      return this.messages.getMessagesAround(
        channelId,
        user.id,
        query.around,
        limit,
      );
    }
    if (query.after) {
      return this.messages.getMessagesAfter(
        channelId,
        user.id,
        query.after,
        limit,
      );
    }
    return this.messages.getMessages(
      channelId,
      user.id,
      query.cursor,
      limit,
    );
  }

  @Get('pinned')
  pinned(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
  ) {
    return this.messages.getPinnedMessages(channelId, user.id);
  }

  @Post()
  send(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.createMessage(
      channelId,
      user.id,
      dto.content,
      dto.replyToId,
      dto.attachmentIds,
    );
  }

  @Patch(':id')
  edit(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('id', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Body() dto: EditMessageDto,
  ) {
    return this.messages.editMessageInChannel(
      messageId,
      channelId,
      user.id,
      dto.content,
    );
  }

  @Delete(':id')
  remove(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('id', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
  ) {
    return this.messages.deleteMessageInChannel(
      messageId,
      channelId,
      user.id,
    );
  }

  @Post(':id/pin')
  pin(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('id', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
  ) {
    return this.messages.pinMessage(messageId, user.id, channelId);
  }

  @Delete(':id/pin')
  unpin(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('id', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
  ) {
    return this.messages.unpinMessage(messageId, user.id, channelId);
  }

  @Post(':id/reactions')
  toggleReaction(
    @Param('id', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Body() dto: ToggleReactionDto,
  ) {
    return this.messages.toggleReaction(
      messageId,
      user.id,
      dto.emoji,
      dto.isCustom,
    );
  }
}
