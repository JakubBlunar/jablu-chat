import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { Permission } from '@chat/shared'
import { CurrentUser } from '../auth/current-user.decorator'
import { EventBusService } from '../events/event-bus.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { EditMessageDto, MessageQueryDto, SendMessageDto, ToggleReactionDto } from './dto'
import { MessagesService } from './messages.service'

@Controller('channels/:channelId/messages')
@UseGuards(UnifiedAuthGuard)
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    private readonly roles: RolesService,
    private readonly events: EventBusService,
    private readonly prisma: PrismaService
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
    const ch = await this.requireChannel(channelId)
    await this.roles.requireChannelPermission(ch.serverId, channelId, user.id, Permission.SEND_MESSAGES)

    const membership = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: user.id, serverId: ch.serverId } },
      select: { mutedUntil: true }
    })
    if (membership?.mutedUntil && membership.mutedUntil > new Date()) {
      throw new ForbiddenException('You are timed out in this server')
    }

    const msg = await this.messages.createMessage(channelId, user.id, dto.content, dto.replyToId, dto.attachmentIds)
    const { serverId, threadUpdate, ...wire } = msg as typeof msg & { threadUpdate?: { parentId: string; threadCount: number } }
    this.events.emit('rest:message:created', { channelId, message: wire, serverId, threadUpdate })
    return wire
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

  private async requireChannel(channelId: string) {
    const ch = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true, isArchived: true }
    })
    if (!ch) throw new NotFoundException('Channel not found')
    if (ch.isArchived) throw new ForbiddenException('This channel is archived')
    return ch
  }
}
