import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { UploadsService } from '../uploads/uploads.service'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { EventBusService } from '../events/event-bus.service'
import { AddGroupMembersDto, CreateDmDto, CreateGroupDmDto, DmAttachmentsQueryDto, SendDmMessageDto, UpdateDmPreferencesDto, UpdateGroupDmDto } from './dto'
import { DmService } from './dm.service'

@Controller('dm')
@UseGuards(UnifiedAuthGuard)
export class DmController {
  constructor(
    private readonly dm: DmService,
    private readonly events: EventBusService,
    private readonly uploads: UploadsService
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

  @Patch(':id/preferences')
  updatePreferences(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }, @Body() dto: UpdateDmPreferencesDto) {
    return this.dm.updatePreferences(id, user.id, dto)
  }

  @Patch(':id/group')
  updateGroup(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }, @Body() dto: UpdateGroupDmDto) {
    return this.dm.updateGroup(id, user.id, dto)
  }

  @Post(':id/members')
  addMembers(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }, @Body() dto: AddGroupMembersDto) {
    return this.dm.addGroupMembers(id, user.id, dto.memberIds)
  }

  @Post(':id/leave')
  leaveGroup(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    return this.dm.leaveGroup(id, user.id)
  }

  @Post(':id/avatar')
  @UseInterceptors(FileInterceptor('avatar', {
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'].includes(file.mimetype)) cb(null, true)
      else cb(new BadRequestException('Only image files are allowed'), false)
    }
  }))
  async uploadGroupAvatar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }, @UploadedFile() file: Express.Multer.File) {
    const conversation = await this.dm.getConversation(id, user.id)
    if (!conversation.isGroup) throw new BadRequestException('This action is only available in group DMs')
    if (!file) throw new BadRequestException('No image provided')
    const groupAvatarUrl = await this.uploads.saveAvatar(file)
    return this.dm.updateGroup(id, user.id, { groupAvatarUrl })
  }

  @Delete(':id/avatar')
  removeGroupAvatar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    return this.dm.updateGroup(id, user.id, { groupAvatarUrl: null })
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

  @Get(':id/attachments')
  getAttachments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @Query() query: DmAttachmentsQueryDto
  ) {
    return this.dm.getAttachments(id, user.id, query.kind, query.page, query.limit)
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
