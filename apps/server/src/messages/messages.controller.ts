import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { EventBusService } from '../events/event-bus.service'
import { EditMessageDto, MessageQueryDto, SendMessageDto, ToggleReactionDto } from './dto'
import { MessagesService } from './messages.service'

@Controller('channels/:channelId/messages')
@UseGuards(UnifiedAuthGuard)
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    private readonly events: EventBusService
  ) {}

  @Get()
  list(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Query() query: MessageQueryDto
  ) {
    const limit = query.limit ?? 50
    if (query.around) {
      return this.messages.getMessagesAround(channelId, user.id, query.around, limit)
    }
    if (query.after) {
      return this.messages.getMessagesAfter(channelId, user.id, query.after, limit)
    }
    return this.messages.getMessages(channelId, user.id, query.cursor, limit)
  }

  @Get('pinned')
  pinned(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string; username: string; email: string }
  ) {
    return this.messages.getPinnedMessages(channelId, user.id)
  }

  @Get(':id/thread')
  thread(
    @Param('channelId', ParseUUIDPipe) _channelId: string,
    @Param('id', ParseUUIDPipe) parentId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Query('cursor') cursor?: string,
    @Query('after') after?: string,
    @Query('around') around?: string,
    @Query('limit') limit?: string
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined
    const safeLimit = parsedLimit != null && !Number.isNaN(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : undefined
    return this.messages.getThreadMessages(parentId, user.id, { cursor, after, around, limit: safeLimit })
  }

  @Post()
  async send(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Body() dto: SendMessageDto
  ) {
    return this.messages.withSendAuthorization(channelId, user.id, async operation => {
      const msg = await this.messages.createMessage(
        channelId,
        user.id,
        dto.content,
        dto.replyToId,
        dto.attachmentIds,
        undefined,
        dto.embeds,
        dto.forwardFromMessageId,
        undefined,
        operation
      )
      const { serverId, threadUpdate, ...wire } = msg as typeof msg & { threadUpdate?: { parentId: string; threadCount: number } }
      this.events.emit('rest:message:created', { channelId, message: wire, serverId, threadUpdate,
        channelName: operation.channel.name, senderMentionPermissions: operation.senderMentionPermissions })
      return wire
    })
  }

  @Patch(':id')
  async edit(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('id', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Body() dto: EditMessageDto
  ) {
    const wire = await this.messages.editMessageInChannel(messageId, channelId, user.id, dto.content)
    this.events.emit('rest:message:edited', { channelId, message: wire })
    return wire
  }

  @Delete(':id')
  async remove(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('id', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: { id: string; username: string; email: string }
  ) {
    const result = await this.messages.deleteMessageInChannel(messageId, channelId, user.id)
    this.events.emit('rest:message:deleted', { channelId, messageId })
    return result
  }

  @Post(':id/pin')
  async pin(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('id', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: { id: string; username: string; email: string }
  ) {
    const wire = await this.messages.pinMessage(messageId, user.id, channelId)
    this.events.emit('rest:message:pinned', { channelId, message: wire })
    return wire
  }

  @Delete(':id/pin')
  async unpin(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('id', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: { id: string; username: string; email: string }
  ) {
    const wire = await this.messages.unpinMessage(messageId, user.id, channelId)
    this.events.emit('rest:message:unpinned', { channelId, message: wire })
    return wire
  }

  @Post(':id/reactions')
  async toggleReaction(
    @Param('id', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Body() dto: ToggleReactionDto
  ) {
    const result = await this.messages.toggleReaction(messageId, user.id, dto.emoji, dto.isCustom)
    const event = result.action === 'added' ? 'rest:reaction:added' : 'rest:reaction:removed'
    this.events.emit(event, {
      messageId,
      emoji: dto.emoji,
      userId: user.id,
      isCustom: result.isCustom,
      channelId: result.channelId,
      directConversationId: result.directConversationId
    })
    return result
  }

  @Get(':id/reactions')
  reactors(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('id', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: { id: string },
    @Query('emoji') emoji: string,
    @Query('after') after?: string
  ) {
    return this.messages.getReactors(channelId, messageId, user.id, emoji, after)
  }

}
