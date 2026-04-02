import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { EventBusService } from '../events/event-bus.service'
import { CreateDmDto, CreateGroupDmDto, SendDmMessageDto } from './dto'
import { DmService } from './dm.service'

@Controller('dm')
@UseGuards(UnifiedAuthGuard)
export class DmController {
  constructor(
    private readonly dm: DmService,
    private readonly events: EventBusService
  ) {}

  @Get()
  listConversations(@CurrentUser() user: { id: string }) {
    return this.dm.getConversations(user.id)
  }

  @Post()
  createDm(@CurrentUser() user: { id: string }, @Body() dto: CreateDmDto) {
    return this.dm.findOrCreateDm(user.id, dto.recipientId)
  }

  @Post('group')
  createGroupDm(@CurrentUser() user: { id: string }, @Body() dto: CreateGroupDmDto) {
    return this.dm.createGroupDm(user.id, dto.memberIds, dto.groupName)
  }

  @Patch(':id/close')
  closeConversation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    return this.dm.closeConversation(id, user.id)
  }

  @Get('can-dm/:userId')
  canDmUser(@Param('userId', ParseUUIDPipe) targetId: string, @CurrentUser() user: { id: string }) {
    return this.dm.canDmUser(user.id, targetId)
  }

  @Get(':id/read-states')
  getReadStates(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    return this.dm.getConversationReadStates(id, user.id)
  }

  @Get(':id/messages/pinned')
  getPinnedMessages(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    return this.dm.getPinnedMessages(id, user.id)
  }

  @Get(':id')
  getConversation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    return this.dm.getConversation(id, user.id)
  }

  @Get(':id/messages')
  getMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('around') around?: string,
    @Query('after') after?: string
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined
    const safeLimit =
      parsedLimit != null && !Number.isNaN(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : undefined
    if (around) {
      return this.dm.getMessagesAround(id, user.id, around, safeLimit)
    }
    if (after) {
      return this.dm.getMessagesAfter(id, user.id, after, safeLimit)
    }
    return this.dm.getMessages(id, user.id, cursor, safeLimit)
  }

  @Post(':id/messages')
  async sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SendDmMessageDto
  ) {
    const msg = await this.dm.createMessage(id, user.id, dto.content)
    this.events.emit('rest:dm:created', { conversationId: id, message: msg })
    return msg
  }
}
