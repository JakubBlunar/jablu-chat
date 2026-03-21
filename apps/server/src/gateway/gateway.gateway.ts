import { UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EventBusService } from '../events/event-bus.service';
import { LinkPreviewService } from '../messages/link-preview.service';
import { MessagesService } from '../messages/messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { WsJwtGuard, WsUser } from './ws-jwt.guard';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/' })
@UseGuards(WsJwtGuard)
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server!: Server;

  /** userId -> number of active socket connections */
  private readonly onlineUsers = new Map<string, number>();

  /** userId -> manually chosen status (dnd) that should not be overridden by idle detection */
  private readonly manualStatus = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly linkPreviews: LinkPreviewService,
    private readonly wsJwtGuard: WsJwtGuard,
    private readonly events: EventBusService,
  ) {}

  private addOnlineUser(userId: string): boolean {
    const count = this.onlineUsers.get(userId) ?? 0;
    this.onlineUsers.set(userId, count + 1);
    return count === 0;
  }

  private removeOnlineUser(userId: string): boolean {
    const count = this.onlineUsers.get(userId) ?? 0;
    if (count <= 1) {
      this.onlineUsers.delete(userId);
      return true;
    }
    this.onlineUsers.set(userId, count - 1);
    return false;
  }

  getOnlineUserIds(): string[] {
    return [...this.onlineUsers.keys()];
  }

  afterInit() {
    this.events.on(
      'user:status',
      async (payload: { userId: string; status: string }) => {
        if (payload.status === 'dnd') {
          this.manualStatus.set(payload.userId, 'dnd');
        } else {
          this.manualStatus.delete(payload.userId);
        }

        const memberships = await this.prisma.serverMember.findMany({
          where: { userId: payload.userId },
          select: { serverId: true },
        });
        for (const m of memberships) {
          this.server.to(`server:${m.serverId}`).emit('user:status', {
            userId: payload.userId,
            status: payload.status,
          });
        }
      },
    );

    this.events.on(
      'webhook:message',
      (payload: { channelId: string; message: unknown }) => {
        this.emitToChannel(payload.channelId, 'message:new', payload.message);
      },
    );
  }

  emitToChannel(channelId: string, event: string, data: unknown) {
    this.server.to(`channel:${channelId}`).emit(event, data);
  }

  async handleConnection(client: Socket) {
    let user: WsUser;
    try {
      user = await this.wsJwtGuard.authenticateClient(client);
    } catch {
      client.disconnect(true);
      return;
    }

    const memberships = await this.prisma.serverMember.findMany({
      where: { userId: user.id },
      include: {
        server: {
          include: {
            channels: { select: { id: true } },
            members: { select: { userId: true } },
          },
        },
      },
    });

    const serverIds: string[] = [];
    const allMemberUserIds = new Set<string>();
    for (const m of memberships) {
      serverIds.push(m.serverId);
      client.join(`server:${m.serverId}`);
      for (const ch of m.server.channels) {
        client.join(`channel:${ch.id}`);
      }
      for (const mem of m.server.members) {
        allMemberUserIds.add(mem.userId);
      }
    }
    (client.data as { serverIds?: string[] }).serverIds = serverIds;

    const isFirstConnection = this.addOnlineUser(user.id);

    if (isFirstConnection) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'online', lastSeenAt: new Date() },
      });
      for (const sid of serverIds) {
        this.server.to(`server:${sid}`).emit('user:online', { userId: user.id });
      }
    }

    const onlineNow = this.getOnlineUserIds().filter((id) =>
      allMemberUserIds.has(id),
    );
    client.emit('presence:init', { onlineUserIds: onlineNow });
  }

  async handleDisconnect(client: Socket) {
    const data = client.data as { user?: WsUser; serverIds?: string[] };
    const user = data.user;
    const serverIds = data.serverIds;
    if (!user || !serverIds?.length) {
      return;
    }

    const isLastConnection = this.removeOnlineUser(user.id);

    if (isLastConnection) {
      this.manualStatus.delete(user.id);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'offline', lastSeenAt: new Date() },
      });
      for (const sid of serverIds) {
        this.server
          .to(`server:${sid}`)
          .emit('user:offline', { userId: user.id });
      }
    }
  }

  @SubscribeMessage('message:send')
  async onMessageSend(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      channelId: string;
      content?: string;
      replyToId?: string;
      attachmentIds?: string[];
    },
  ) {
    const user = (client.data as { user: WsUser }).user;
    const msg = await this.messages.createMessage(
      body.channelId,
      user.id,
      body.content,
      body.replyToId,
      body.attachmentIds,
    );
    this.emitToChannel(body.channelId, 'message:new', msg);

    if (body.content) {
      this.linkPreviews
        .generatePreviews(msg.id, body.content)
        .then((previews) => {
          if (previews.length > 0) {
            this.emitToChannel(body.channelId, 'message:link-previews', {
              messageId: msg.id,
              linkPreviews: previews,
            });
          }
        })
        .catch(() => {});
    }

    return { ok: true, message: msg };
  }

  @SubscribeMessage('message:edit')
  async onMessageEdit(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId: string; content: string },
  ) {
    const user = (client.data as { user: WsUser }).user;
    const updated = await this.messages.editMessage(
      body.messageId,
      user.id,
      body.content,
    );
    const channelId = updated.channelId;
    if (channelId) {
      this.emitToChannel(channelId, 'message:edit', updated);
    }
    return { ok: true, message: updated };
  }

  @SubscribeMessage('message:delete')
  async onMessageDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId: string },
  ) {
    const user = (client.data as { user: WsUser }).user;
    const channelId = await this.messages.getMessageChannelId(body.messageId);
    await this.messages.deleteMessage(body.messageId, user.id);
    if (channelId) {
      this.emitToChannel(channelId, 'message:delete', {
        messageId: body.messageId,
        channelId,
      });
    }
    return { ok: true };
  }

  @SubscribeMessage('reaction:toggle')
  async onReactionToggle(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId: string; emoji: string; isCustom?: boolean },
  ) {
    const user = (client.data as { user: WsUser }).user;
    const result = await this.messages.toggleReaction(
      body.messageId,
      user.id,
      body.emoji,
      body.isCustom ?? false,
    );
    const channelId = await this.messages.getMessageChannelId(body.messageId);
    if (channelId) {
      const event =
        result.action === 'added' ? 'reaction:add' : 'reaction:remove';
      this.emitToChannel(channelId, event, {
        messageId: body.messageId,
        emoji: body.emoji,
        userId: user.id,
        isCustom: result.isCustom,
      });
    }
    return { ok: true, action: result.action };
  }

  @SubscribeMessage('message:pin')
  async onMessagePin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId: string; channelId: string },
  ) {
    const user = (client.data as { user: WsUser }).user;
    const msg = await this.messages.pinMessage(
      body.messageId,
      user.id,
      body.channelId,
    );
    this.emitToChannel(body.channelId, 'message:pin', msg);
    return { ok: true, message: msg };
  }

  @SubscribeMessage('message:unpin')
  async onMessageUnpin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { messageId: string; channelId: string },
  ) {
    const user = (client.data as { user: WsUser }).user;
    const msg = await this.messages.unpinMessage(
      body.messageId,
      user.id,
      body.channelId,
    );
    this.emitToChannel(body.channelId, 'message:unpin', msg);
    return { ok: true, message: msg };
  }

  @SubscribeMessage('activity:idle')
  async onActivityIdle(@ConnectedSocket() client: Socket) {
    const user = (client.data as { user: WsUser }).user;
    if (this.manualStatus.get(user.id) === 'dnd') {
      return { ok: true };
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { status: 'idle' },
    });
    const serverIds =
      (client.data as { serverIds?: string[] }).serverIds ?? [];
    for (const sid of serverIds) {
      this.server
        .to(`server:${sid}`)
        .emit('user:status', { userId: user.id, status: 'idle' });
    }
    return { ok: true };
  }

  @SubscribeMessage('activity:active')
  async onActivityActive(@ConnectedSocket() client: Socket) {
    const user = (client.data as { user: WsUser }).user;
    if (this.manualStatus.get(user.id) === 'dnd') {
      return { ok: true };
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { status: 'online' },
    });
    const serverIds =
      (client.data as { serverIds?: string[] }).serverIds ?? [];
    for (const sid of serverIds) {
      this.server
        .to(`server:${sid}`)
        .emit('user:status', { userId: user.id, status: 'online' });
    }
    return { ok: true };
  }

  @SubscribeMessage('typing:start')
  async onTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string },
  ) {
    const user = (client.data as { user: WsUser }).user;
    await this.messages.assertUserCanAccessChannel(body.channelId, user.id);
    this.emitToChannel(body.channelId, 'user:typing', {
      userId: user.id,
      channelId: body.channelId,
      username: user.username,
    });
    return { ok: true };
  }

  @SubscribeMessage('channel:join')
  async onChannelJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string },
  ) {
    const user = (client.data as { user: WsUser }).user;
    await this.messages.assertUserCanAccessChannel(body.channelId, user.id);
    client.join(`channel:${body.channelId}`);
    return { ok: true };
  }

  @SubscribeMessage('channel:leave')
  async onChannelLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string },
  ) {
    const user = (client.data as { user: WsUser }).user;
    await this.messages.assertUserCanAccessChannel(body.channelId, user.id);
    client.leave(`channel:${body.channelId}`);
    return { ok: true };
  }
}
