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
import { DmService } from '../dm/dm.service';
import { EventBusService } from '../events/event-bus.service';
import { LinkPreviewService } from '../messages/link-preview.service';
import { MessagesService } from '../messages/messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { ReadStateService } from '../read-state/read-state.service';
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

  /** channelId -> Set of participants in voice channel */
  private readonly voiceParticipants = new Map<
    string,
    Map<string, { userId: string; username: string }>
  >();

  /** socketId -> channelId the socket is in (for cleanup on disconnect) */
  private readonly socketVoiceChannel = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly dm: DmService,
    private readonly linkPreviews: LinkPreviewService,
    private readonly wsJwtGuard: WsJwtGuard,
    private readonly events: EventBusService,
    private readonly readState: ReadStateService,
    private readonly push: PushService,
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

    this.events.on(
      'webhook:link-previews',
      (payload: {
        channelId: string;
        messageId: string;
        linkPreviews: unknown;
      }) => {
        this.emitToChannel(payload.channelId, 'message:link-previews', {
          messageId: payload.messageId,
          linkPreviews: payload.linkPreviews,
        });
      },
    );

    this.events.on(
      'channel:reorder',
      (payload: { serverId: string; channelIds: string[] }) => {
        this.server
          .to(`server:${payload.serverId}`)
          .emit('channel:reorder', { channelIds: payload.channelIds });
      },
    );
  }

  emitToChannel(channelId: string, event: string, data: unknown) {
    this.server.to(`channel:${channelId}`).emit(event, data);
  }

  emitToDm(conversationId: string, event: string, data: unknown) {
    this.server.to(`dm:${conversationId}`).emit(event, data);
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

    const dmConversations =
      await this.prisma.directConversationMember.findMany({
        where: { userId: user.id },
        select: { conversationId: true },
      });
    for (const dc of dmConversations) {
      client.join(`dm:${dc.conversationId}`);
    }

    const voiceState: Record<string, { userId: string; username: string }[]> =
      {};
    for (const [chId, participants] of this.voiceParticipants) {
      voiceState[chId] = [...participants.values()];
    }
    client.emit('voice:participants', voiceState);
  }

  async handleDisconnect(client: Socket) {
    const data = client.data as { user?: WsUser; serverIds?: string[] };
    const user = data.user;
    const serverIds = data.serverIds;

    this.removeVoiceParticipant(client.id, serverIds);

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

  private removeVoiceParticipant(
    socketId: string,
    serverIds?: string[],
  ) {
    const channelId = this.socketVoiceChannel.get(socketId);
    if (!channelId) return;

    this.socketVoiceChannel.delete(socketId);
    const participants = this.voiceParticipants.get(channelId);
    if (!participants) return;

    const leaving = participants.get(socketId);
    participants.delete(socketId);
    if (participants.size === 0) {
      this.voiceParticipants.delete(channelId);
    }

    if (leaving && serverIds) {
      for (const sid of serverIds) {
        this.server.to(`server:${sid}`).emit('voice:participant-left', {
          channelId,
          userId: leaving.userId,
        });
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

    const channel = await this.prisma.channel.findUnique({
      where: { id: body.channelId },
      select: { serverId: true },
    });

    let mentionedUserIds: string[] = [];
    if (body.content && channel) {
      mentionedUserIds = await this.readState.resolveMentions(
        body.content,
        channel.serverId,
        user.id,
      );
      if (mentionedUserIds.length > 0) {
        await this.readState.incrementMention(
          body.channelId,
          mentionedUserIds,
        );
      }
    }

    this.emitToChannel(body.channelId, 'message:new', {
      ...msg,
      mentionedUserIds,
      serverId: channel?.serverId ?? null,
    });

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

    if (channel) {
      this.sendPushToOfflineMembers(
        channel.serverId,
        user.id,
        msg.author?.displayName ?? msg.author?.username ?? 'Someone',
        body.content,
        `/channels/${body.channelId}`,
        body.channelId,
        mentionedUserIds,
      ).catch(() => {});
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
    const ctx = await this.messages.getMessageContext(body.messageId);
    const event =
      result.action === 'added' ? 'reaction:add' : 'reaction:remove';
    const payload = {
      messageId: body.messageId,
      emoji: body.emoji,
      userId: user.id,
      isCustom: result.isCustom,
    };
    if (ctx.channelId) {
      this.emitToChannel(ctx.channelId, event, payload);
    } else if (ctx.directConversationId) {
      this.emitToDm(ctx.directConversationId, event, {
        ...payload,
        conversationId: ctx.directConversationId,
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
      username: user.displayName ?? user.username,
    });
    return { ok: true };
  }

  @SubscribeMessage('dm:send')
  async onDmSend(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      conversationId: string;
      content?: string;
      replyToId?: string;
      attachmentIds?: string[];
    },
  ) {
    const user = (client.data as { user: WsUser }).user;
    const msg = await this.dm.createMessage(
      body.conversationId,
      user.id,
      body.content,
      body.replyToId,
      body.attachmentIds,
    );

    // Ensure all conversation members are in the socket room
    const memberIds = await this.dm.getConversationMemberIds(
      body.conversationId,
    );
    const roomName = `dm:${body.conversationId}`;
    const sockets = await this.server.fetchSockets();
    for (const s of sockets) {
      const sUser = (s.data as { user?: WsUser }).user;
      if (sUser && memberIds.includes(sUser.id)) {
        s.join(roomName);
      }
    }

    const otherMemberIds = memberIds.filter((id) => id !== user.id);
    await this.readState.incrementDmMention(
      body.conversationId,
      otherMemberIds,
    );

    this.emitToDm(body.conversationId, 'dm:new', {
      ...msg,
      conversationId: body.conversationId,
    });

    if (body.content) {
      this.linkPreviews
        .generatePreviews(msg.id, body.content)
        .then((previews) => {
          if (previews.length > 0) {
            this.emitToDm(body.conversationId, 'dm:link-previews', {
              messageId: msg.id,
              conversationId: body.conversationId,
              linkPreviews: previews,
            });
          }
        })
        .catch(() => {});
    }

    const offlineDmMembers = otherMemberIds.filter(
      (id) => !this.onlineUsers.has(id),
    );
    if (offlineDmMembers.length > 0) {
      const authorName = msg.author?.displayName ?? msg.author?.username ?? 'Someone';
      const preview = body.content?.slice(0, 100) || '[attachment]';
      this.push
        .sendToUsers(offlineDmMembers, {
          title: `DM from ${authorName}`,
          body: preview,
          url: `/dm/${body.conversationId}`,
        })
        .catch(() => {});
    }

    return { ok: true, message: msg };
  }

  @SubscribeMessage('dm:edit')
  async onDmEdit(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { conversationId: string; messageId: string; content: string },
  ) {
    const user = (client.data as { user: WsUser }).user;
    const updated = await this.dm.editMessage(
      body.conversationId,
      body.messageId,
      user.id,
      body.content,
    );
    this.emitToDm(body.conversationId, 'dm:edit', {
      ...updated,
      conversationId: body.conversationId,
    });
    return { ok: true, message: updated };
  }

  @SubscribeMessage('dm:delete')
  async onDmDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; messageId: string },
  ) {
    const user = (client.data as { user: WsUser }).user;
    await this.dm.deleteMessage(
      body.conversationId,
      body.messageId,
      user.id,
    );
    this.emitToDm(body.conversationId, 'dm:delete', {
      messageId: body.messageId,
      conversationId: body.conversationId,
    });
    return { ok: true };
  }

  @SubscribeMessage('dm:typing')
  async onDmTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    const user = (client.data as { user: WsUser }).user;
    await this.dm.requireMembership(body.conversationId, user.id);
    client.to(`dm:${body.conversationId}`).emit('dm:typing', {
      userId: user.id,
      conversationId: body.conversationId,
      username: user.displayName ?? user.username,
    });
    return { ok: true };
  }

  @SubscribeMessage('dm:join')
  async onDmJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    const user = (client.data as { user: WsUser }).user;
    await this.dm.requireMembership(body.conversationId, user.id);
    client.join(`dm:${body.conversationId}`);
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

  @SubscribeMessage('voice:join')
  async onVoiceJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string },
  ) {
    const user = (client.data as { user: WsUser }).user;
    const serverIds = (client.data as { serverIds?: string[] }).serverIds ?? [];

    const prev = this.socketVoiceChannel.get(client.id);
    if (prev) {
      this.removeVoiceParticipant(client.id, serverIds);
    }

    let participants = this.voiceParticipants.get(body.channelId);
    if (!participants) {
      participants = new Map();
      this.voiceParticipants.set(body.channelId, participants);
    }
    participants.set(client.id, {
      userId: user.id,
      username: user.displayName ?? user.username,
    });
    this.socketVoiceChannel.set(client.id, body.channelId);

    for (const sid of serverIds) {
      this.server.to(`server:${sid}`).emit('voice:participant-joined', {
        channelId: body.channelId,
        userId: user.id,
        username: user.displayName ?? user.username,
      });
    }

    return { ok: true };
  }

  @SubscribeMessage('voice:leave')
  async onVoiceLeave(
    @ConnectedSocket() client: Socket,
  ) {
    const serverIds = (client.data as { serverIds?: string[] }).serverIds ?? [];
    this.removeVoiceParticipant(client.id, serverIds);
    return { ok: true };
  }

  @SubscribeMessage('voice:state')
  async onVoiceState(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      muted?: boolean;
      deafened?: boolean;
      camera?: boolean;
      screenShare?: boolean;
    },
  ) {
    const user = (client.data as { user: WsUser }).user;
    const serverIds = (client.data as { serverIds?: string[] }).serverIds ?? [];
    const channelId = this.socketVoiceChannel.get(client.id);
    if (!channelId) return { ok: false };

    for (const sid of serverIds) {
      this.server.to(`server:${sid}`).emit('voice:participant-state', {
        channelId,
        userId: user.id,
        ...body,
      });
    }
    return { ok: true };
  }

  /**
   * Sends web-push notifications to server members who have no active
   * Socket.IO connection ("offline"). Called fire-and-forget from message
   * handlers so it never blocks the message response.
   *
   * Respects per-channel ChannelNotifPref:
   *   - "all" (default) → always push
   *   - "mentions"       → push only if user was @mentioned
   *   - "none"           → skip
   *
   * Current cost per message: 2 indexed DB queries (serverMember + channelNotifPref)
   * plus one web-push HTTP call per eligible subscription.
   *
   * --- Possible future improvements ---
   *
   * 1. Redis pref cache: store prefs in Redis (hash per channel or per user),
   *    invalidate on PUT/DELETE in NotifPrefsController. Eliminates the
   *    channelNotifPref DB query and reduces latency to a single Redis HMGET.
   *
   * 2. Bull/BullMQ job queue: instead of doing web-push calls inline,
   *    enqueue a "send-push" job. A dedicated worker processes the queue,
   *    retries on transient failures, and keeps the gateway event loop free.
   *    Pairs well with Redis since Bull already requires it.
   *
   * 3. Batch DB query: combine the serverMember + channelNotifPref lookups
   *    into a single raw SQL join to halve the DB round-trips.
   *
   * 4. User-level DND / quiet hours: check a global user preference before
   *    sending, so users can silence all push during certain time windows.
   *
   * At current scale (<20 concurrent users) the indexed queries are
   * sub-millisecond and the simple approach is appropriate.
   */
  private async sendPushToOfflineMembers(
    serverId: string,
    senderId: string,
    senderName: string,
    content: string | undefined,
    url: string,
    channelId: string,
    mentionedUserIds: string[],
  ) {
    const members = await this.prisma.serverMember.findMany({
      where: { serverId, NOT: { userId: senderId } },
      select: { userId: true },
    });

    const offlineIds = members
      .map((m) => m.userId)
      .filter((id) => !this.onlineUsers.has(id));

    if (offlineIds.length === 0) return;

    const prefs = await this.prisma.channelNotifPref.findMany({
      where: { channelId, userId: { in: offlineIds } },
    });
    const prefMap = new Map(prefs.map((p) => [p.userId, p.level]));
    const mentionSet = new Set(mentionedUserIds);

    const eligibleIds = offlineIds.filter((id) => {
      const level = prefMap.get(id) ?? 'all';
      if (level === 'none') return false;
      if (level === 'mentions') return mentionSet.has(id);
      return true;
    });

    if (eligibleIds.length === 0) return;

    const preview = content?.slice(0, 100) || '[attachment]';
    await this.push.sendToUsers(eligibleIds, {
      title: senderName,
      body: preview,
      url,
    });
  }
}
