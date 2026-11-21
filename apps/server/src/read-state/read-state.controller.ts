import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Put, Request, UseGuards } from '@nestjs/common'
import { IsBoolean, IsOptional, IsUUID } from 'class-validator'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { Permission } from '@chat/shared'
import { EventBusService } from '../events/event-bus.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { ReadStateService } from './read-state.service'
import { InboxService } from '../inbox/inbox.service'

class ReadBoundaryDto {
  @IsOptional()
  @IsUUID()
  throughMessageId?: string

  @IsOptional()
  @IsUUID()
  threadParentId?: string

  @IsOptional()
  @IsBoolean()
  seenOnly?: boolean
}

@Controller()
@UseGuards(UnifiedAuthGuard)
export class ReadStateController {
  constructor(
    private readonly readState: ReadStateService,
    private readonly inbox: InboxService,
    private readonly events: EventBusService,
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
  ) {}

  @Get('read-states')
  getAll(@Request() req: { user: { id: string } }) {
    return this.readState.getAllForUser(req.user.id)
  }

  @Put('servers/:id/ack')
  async ackServer(@Request() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) serverId: string) {
    await this.roles.requireMembership(serverId, req.user.id)
    await this.readState.ackServer(req.user.id, serverId)
    return { ok: true }
  }

  @Put('channels/:id/ack')
  async ackChannel(
    @Request() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) channelId: string,
    @Body() boundary?: ReadBoundaryDto
  ) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } })
    if (!channel) throw new NotFoundException('Channel not found')
    if (boundary?.throughMessageId) {
      return this.inbox.readRendered(req.user.id, {
        mode: 'channel', contextId: channelId, serverId: channel.serverId,
        threadParentId: boundary.threadParentId ?? null, messageId: boundary.throughMessageId
      }, boundary.seenOnly)
    }
    await this.roles.requireChannelPermission(channel.serverId, channelId, req.user.id, Permission.VIEW_CHANNEL)
    await this.readState.ackChannel(req.user.id, channelId)
    return { ok: true }
  }

  @Put('dm/:id/ack')
  async ackDm(
    @Request() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() boundary?: ReadBoundaryDto
  ) {
    const membership = await this.prisma.directConversationMember.findFirst({
      where: { conversationId, userId: req.user.id }
    })
    if (!membership) throw new ForbiddenException('Not a member of this conversation')
    if (boundary?.throughMessageId) {
      return this.inbox.readRendered(req.user.id, {
        mode: 'dm', contextId: conversationId, serverId: null, threadParentId: null, messageId: boundary.throughMessageId
      }, boundary.seenOnly)
    }
    const lastReadAt = await this.readState.ackDm(req.user.id, conversationId)
    this.events.emit('dm:read', {
      conversationId,
      userId: req.user.id,
      lastReadAt: lastReadAt.toISOString()
    })
    this.events.emit('dm:preferences-read-state', { userId: req.user.id })
    return { ok: true }
  }

  @Put('dm/:id/unread')
  async markDmUnread(@Request() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) conversationId: string) {
    const membership = await this.prisma.directConversationMember.findFirst({ where: { conversationId, userId: req.user.id } })
    if (!membership) throw new ForbiddenException('Not a member of this conversation')
    await this.readState.markDmUnread(req.user.id, conversationId)
    this.events.emit('dm:preferences-read-state', { userId: req.user.id })
    return { ok: true }
  }
}
