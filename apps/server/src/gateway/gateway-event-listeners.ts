import { Permission, hasPermission } from '@chat/shared'
import type { ChatGateway } from './gateway.gateway'
import { deliverChannelMessage, deliverDmMessage } from './message-notifications'

export async function routeDmSlashCommand(
  gw: ChatGateway,
  content: string,
  conversationId: string,
  botUserId: string,
  invoker: { id: string; username: string; displayName: string | null }
) {
  try {
    const parts = content.slice(1).split(/\s+/)
    const commandName = parts[0]?.toLowerCase()
    if (!commandName) return

    const argsString = parts.slice(1).join(' ')

    const botApp = await gw.prisma.botApplication.findUnique({
      where: { userId: botUserId },
      include: { commands: { where: { name: commandName } } }
    })
    if (!botApp || botApp.commands.length === 0) return

    const command = botApp.commands[0]!
    const botParams = (command.parameters as any[]) ?? []
    const args: Record<string, string> = {}
    if (botParams.length > 0 && argsString) {
      if (botParams.length === 1) {
        args[botParams[0].name] = argsString
      } else {
        const argParts = argsString.split(/\s+/)
        botParams.forEach((p: any, i: number) => {
          if (argParts[i]) args[p.name] = argParts[i]
        })
      }
    }

    const botSockets = await gw.server.in(`user:${botUserId}`).fetchSockets()
    for (const s of botSockets) {
      const data = s.data as { user?: { id: string; isBot?: boolean } }
      if (data.user?.isBot) {
        s.emit('bot:command', {
          conversationId,
          channelId: conversationId,
          commandName,
          args,
          user: invoker
        })
        return
      }
    }
  } catch {
    /* best-effort */
  }
}

export async function routeRestSlashCommand(gw: ChatGateway, content: string, serverId: string, channelId: string, authorId?: string) {
  try {
    const parts = content.slice(1).split(/\s+/)
    const commandName = parts[0]?.toLowerCase()
    if (!commandName) return

    const argsString = parts.slice(1).join(' ')

    const botMembers = await gw.prisma.serverMember.findMany({
      where: { serverId, user: { isBot: true } },
      select: { userId: true }
    })
    if (botMembers.length === 0) return

    const botApps = await gw.prisma.botApplication.findMany({
      where: { userId: { in: botMembers.map((m) => m.userId) } },
      include: { commands: { where: { name: commandName } }, user: { select: { username: true } } },
      orderBy: { user: { username: 'asc' } }
    })

    const match = botApps.find((app) => app.commands.length > 0)
    if (!match) return

    const command = match.commands[0]!

    if (command.requiredPermission) {
      if (!authorId) return
      const permFlag = Permission[command.requiredPermission as keyof typeof Permission]
      if (!permFlag) return
      try {
        const invokerPerms = await gw.roles.getChannelPermissions(serverId, channelId, authorId)
        if (!hasPermission(invokerPerms, permFlag)) return
      } catch { return }
    }

    const botParams = (command.parameters as any[]) ?? []
    const args: Record<string, string> = {}
    if (botParams.length > 0 && argsString) {
      if (botParams.length === 1) {
        args[botParams[0].name] = argsString
      } else {
        const argParts = argsString.split(/\s+/)
        botParams.forEach((p: any, i: number) => {
          if (argParts[i]) args[p.name] = argParts[i]
        })
      }
    }

    const perms = await gw.roles.getChannelPermissions(serverId, channelId, match.userId)
    if (!hasPermission(perms, Permission.SEND_MESSAGES) || !hasPermission(perms, Permission.VIEW_CHANNEL)) return

    const botSockets = await gw.server.in(`user:${match.userId}`).fetchSockets()
    for (const s of botSockets) {
      const data = s.data as { user?: { id: string; isBot?: boolean } }
      if (data.user?.isBot) {
        if (!authorId) return
        const author = await gw.prisma.user.findUnique({ where: { id: authorId }, select: { id: true, username: true, displayName: true } })
        if (!author) return
        s.emit('bot:command', {
          serverId,
          channelId,
          commandName,
          args,
          user: author
        })
        return
      }
    }
  } catch {
    /* best-effort routing */
  }
}

/**
 * Registers all event-bus listeners on the gateway.
 * Called once from `ChatGateway.afterInit()`.
 */
export function registerEventListeners(gw: ChatGateway) {
  gw.events.on(
    'user:status',
    async (payload: { userId: string; status: string; manualUntil?: string | null }) => {
      if (payload.manualUntil === undefined) {
        gw.manualPresence.delete(payload.userId)
      } else {
        gw.manualPresence.set(payload.userId, {
          status: payload.status,
          expiresAt: payload.manualUntil === null ? null : new Date(payload.manualUntil)
        })
      }

      const [memberships, friendIds] = await Promise.all([
        gw.prisma.serverMember.findMany({
          where: { userId: payload.userId },
          select: { serverId: true }
        }),
        gw.getFriendUserIds(payload.userId)
      ])
      for (const m of memberships) {
        gw.server.to(`server:${m.serverId}`).emit('user:status', {
          userId: payload.userId,
          status: payload.status
        })
      }
      for (const fid of friendIds) {
        gw.server.to(`user:${fid}`).emit('user:status', {
          userId: payload.userId,
          status: payload.status
        })
      }
    }
  )

  gw.events.on('user:custom-status', async (payload: { userId: string; customStatus: string | null }) => {
    const [memberships, friendIds] = await Promise.all([
      gw.prisma.serverMember.findMany({
        where: { userId: payload.userId },
        select: { serverId: true }
      }),
      gw.getFriendUserIds(payload.userId)
    ])
    for (const m of memberships) {
      gw.server.to(`server:${m.serverId}`).emit('user:custom-status', {
        userId: payload.userId,
        customStatus: payload.customStatus
      })
    }
    for (const fid of friendIds) {
      gw.server.to(`user:${fid}`).emit('user:custom-status', {
        userId: payload.userId,
        customStatus: payload.customStatus
      })
    }
  })

  gw.events.on(
    'webhook:message',
    (payload: { channelId: string; message: any; serverId?: string; webhookName?: string }) => {
      if (!payload.serverId) {
        gw.emitToChannel(payload.channelId, 'message:new', {
          ...(payload.message as object)
        })
        return
      }
      void deliverChannelMessage(gw.messageNotificationsContext(), {
        serverId: payload.serverId,
        channelId: payload.channelId,
        message: payload.message,
        senderId: null,
        senderDisplayName: payload.webhookName ?? 'Webhook'
      })
    }
  )

  gw.events.on(
    'webhook:link-previews',
    (payload: { channelId: string; messageId: string; linkPreviews: unknown }) => {
      gw.emitToChannel(payload.channelId, 'message:link-previews', {
        messageId: payload.messageId,
        linkPreviews: payload.linkPreviews
      })
    }
  )

  gw.events.on('dm:read', (payload: { conversationId: string; userId: string; lastReadAt: string }) => {
    gw.emitToDm(payload.conversationId, 'dm:read', payload)
  })

  gw.events.on('admin:message:delete', (payload: { messageId: string; channelId: string }) => {
    gw.emitToChannel(payload.channelId, 'message:delete', payload)
  })

  gw.events.on('admin:dm:delete', (payload: { messageId: string; conversationId: string }) => {
    gw.emitToDm(payload.conversationId, 'dm:delete', payload)
  })

  gw.events.on('channel:reorder', (payload: { serverId: string; channelIds: string[] }) => {
    gw.server.to(`server:${payload.serverId}`).emit('channel:reorder', { channelIds: payload.channelIds })
  })

  gw.events.on('channel:created', async (payload: { serverId: string; channel: { id: string } }) => {
    gw.server.to(`server:${payload.serverId}`).emit('channel:created', payload)
    const members = await gw.prisma.serverMember.findMany({
      where: { serverId: payload.serverId },
      select: { userId: true },
    })
    for (const m of members) {
      try {
        const perms = await gw.roles.getChannelPermissions(payload.serverId, payload.channel.id, m.userId)
        if (perms & Permission.VIEW_CHANNEL || perms & Permission.ADMINISTRATOR) {
          const sockets = await gw.server.in(`user:${m.userId}`).fetchSockets()
          for (const s of sockets) s.join(`channel:${payload.channel.id}`)
        }
      } catch { /* member may have been removed */ }
    }
  })

  gw.events.on('channel:updated', (payload: { serverId: string; channel: unknown }) => {
    gw.server.to(`server:${payload.serverId}`).emit('channel:updated', payload)
  })

  gw.events.on('channel:deleted', (payload: { serverId: string; channelId: string }) => {
    gw.server.to(`server:${payload.serverId}`).emit('channel:deleted', payload)
  })

  gw.events.on('category:created', (payload: { serverId: string; category: unknown }) => {
    gw.server.to(`server:${payload.serverId}`).emit('category:created', payload)
  })

  gw.events.on('category:updated', (payload: { serverId: string; category: unknown }) => {
    gw.server.to(`server:${payload.serverId}`).emit('category:updated', payload)
  })

  gw.events.on('category:deleted', (payload: { serverId: string; categoryId: string }) => {
    gw.server.to(`server:${payload.serverId}`).emit('category:deleted', payload)
  })

  gw.events.on('category:reorder', (payload: { serverId: string; categoryIds: string[] }) => {
    gw.server.to(`server:${payload.serverId}`).emit('category:reorder', { categoryIds: payload.categoryIds })
  })

  gw.events.on('member:joined', async (payload: { serverId: string; member: unknown }) => {
    const { serverId, member } = payload as {
      serverId: string
      member: { userId: string; user?: { username?: string; displayName?: string } }
    }
    gw.server.to(`server:${serverId}`).emit('member:joined', { serverId, member })

    const visibleChannelIds = await gw.getVisibleChannelIds(serverId, member.userId)
    const userSockets = await gw.server.in(`user:${member.userId}`).fetchSockets()
    for (const s of userSockets) {
      s.join(`server:${serverId}`)
      for (const chId of visibleChannelIds) {
        s.join(`channel:${chId}`)
      }
      const sids = (s.data as { serverIds?: string[] }).serverIds
      if (sids && !sids.includes(serverId)) {
        sids.push(serverId)
      }
    }

    // Welcome message
    try {
      const server = await gw.prisma.server.findUnique({
        where: { id: serverId },
        select: { name: true, welcomeChannelId: true, welcomeMessage: true }
      })
      if (server?.welcomeChannelId && server.welcomeMessage) {
        const username = member.user?.displayName ?? member.user?.username ?? 'a new member'
        const content = server.welcomeMessage
          .replace(/\{user\}/g, username)
          .replace(/\{server\}/g, server.name)

        const welcomeMsg = await gw.prisma.message.create({
          data: {
            channelId: server.welcomeChannelId,
            content
          },
          include: {
            author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
            attachments: true,
            reactions: true,
            linkPreviews: true
          }
        })
        // Welcome messages are intentionally silent: real-time fan-out only,
        // no push, no notification-center entry, no link previews.
        await deliverChannelMessage(gw.messageNotificationsContext(), {
          serverId,
          channelId: server.welcomeChannelId,
          message: welcomeMsg,
          senderId: null,
          senderDisplayName: server.name,
          skipPush: true,
          skipInApp: true,
          skipLinkPreviews: true
        })
      }
    } catch {
      // Don't break join flow for welcome message failures
    }
  })

  gw.events.on('user:profile', async (payload: { userId: string; displayName?: string; bio?: string; avatarUrl?: string | null }) => {
    const memberships = await gw.prisma.serverMember.findMany({
      where: { userId: payload.userId },
      select: { serverId: true }
    })
    for (const m of memberships) {
      gw.server.to(`server:${m.serverId}`).emit('user:profile', payload)
    }
  })

  gw.events.on('server:updated', (payload: { serverId: string; [key: string]: unknown }) => {
    gw.server.to(`server:${payload.serverId}`).emit('server:updated', payload)
  })

  gw.events.on('member:updated', async (payload: { serverId: string; userId: string; roleIds?: string[]; roles?: unknown[]; mutedUntil?: string | null; onboardingCompleted?: boolean }) => {
    gw.server.to(`server:${payload.serverId}`).emit('member:updated', payload)
    if (payload.roleIds) {
      await gw.reconcileChannelRooms(payload.serverId, payload.userId)
    }
  })

  gw.events.on('channel:permissions:updated', async (payload: { serverId: string; channelId: string; roleId: string }) => {
    gw.server.to(`server:${payload.serverId}`).emit('channel:permissions:updated', payload)
    const members = await gw.prisma.serverMember.findMany({
      where: { serverId: payload.serverId },
      select: { userId: true },
    })
    for (const m of members) {
      await gw.reconcileChannelRooms(payload.serverId, m.userId)
    }
  })

  gw.events.on('role:created', (payload: { serverId: string; role: unknown }) => {
    gw.server.to(`server:${payload.serverId}`).emit('role:created', payload)
  })

  gw.events.on('role:updated', (payload: { serverId: string; role: unknown }) => {
    gw.server.to(`server:${payload.serverId}`).emit('role:updated', payload)
  })

  gw.events.on('role:deleted', (payload: { serverId: string; roleId: string }) => {
    gw.server.to(`server:${payload.serverId}`).emit('role:deleted', payload)
  })

  gw.events.on('roles:reordered', (payload: { serverId: string; roles: unknown[] }) => {
    gw.server.to(`server:${payload.serverId}`).emit('roles:reordered', payload)
  })

  gw.events.on('member:removed', async (payload: { serverId: string; userId: string }) => {
    gw.server.to(`server:${payload.serverId}`).emit('member:left', {
      serverId: payload.serverId,
      userId: payload.userId
    })

    const channels = await gw.prisma.channel.findMany({
      where: { serverId: payload.serverId },
      select: { id: true }
    })
    const userSockets = await gw.server.in(`user:${payload.userId}`).fetchSockets()
    for (const s of userSockets) {
      s.leave(`server:${payload.serverId}`)
      for (const ch of channels) {
        s.leave(`channel:${ch.id}`)
      }
      const serverIds = (s.data as { serverIds?: string[] }).serverIds
      if (serverIds) {
        const idx = serverIds.indexOf(payload.serverId)
        if (idx !== -1) serverIds.splice(idx, 1)
      }
    }
  })

  for (const ev of ['event:created', 'event:updated', 'event:cancelled', 'event:started', 'event:completed'] as const) {
    gw.events.on(ev, (payload: { serverId: string; event: unknown }) => {
      gw.server.to(`server:${payload.serverId}`).emit(ev, payload.event)
    })
  }

  gw.events.on(
    'event:interest',
    (payload: { serverId: string; eventId: string; userId: string; interested: boolean; count: number }) => {
      gw.server.to(`server:${payload.serverId}`).emit('event:interest', {
        eventId: payload.eventId,
        userId: payload.userId,
        interested: payload.interested,
        count: payload.count
      })
    }
  )

  gw.events.on(
    'friend:request',
    (payload: { friendshipId: string; requester: Record<string, unknown>; addressee: Record<string, unknown> }) => {
      const { friendshipId, requester, addressee } = payload
      const addresseeId = (addressee as { id: string }).id
      const requesterName =
        (requester as { displayName?: string }).displayName ??
        (requester as { username?: string }).username ??
        'Someone'

      gw.server.to(`user:${addresseeId}`).emit('friend:request', {
        friendshipId,
        user: requester,
        direction: 'incoming',
        createdAt: new Date().toISOString()
      })

      if (!gw.hasActiveSocket(addresseeId)) {
        gw.push
          .sendToUsers([addresseeId], {
            title: 'Friend Request',
            body: `${requesterName} sent you a friend request`,
            url: '/channels/@me'
          })
          .catch(() => {})
      }
    }
  )

  gw.events.on(
    'friend:accepted',
    (payload: { friendshipId: string; requester: Record<string, unknown>; addressee: Record<string, unknown> }) => {
      const { friendshipId, requester, addressee } = payload
      const requesterId = (requester as { id: string }).id
      const addresseeId = (addressee as { id: string }).id
      gw.invalidateFriendCache(requesterId, addresseeId)
      gw.server.to(`user:${requesterId}`).emit('friend:accepted', {
        friendshipId,
        user: addressee
      })
      gw.server.to(`user:${addresseeId}`).emit('friend:accepted', {
        friendshipId,
        user: requester
      })
    }
  )

  gw.events.on(
    'friend:declined',
    (payload: { friendshipId: string; requesterId: string; addresseeId: string }) => {
      gw.server.to(`user:${payload.requesterId}`).emit('friend:declined', {
        friendshipId: payload.friendshipId
      })
    }
  )

  gw.events.on(
    'friend:cancelled',
    (payload: { friendshipId: string; requesterId: string; addresseeId: string }) => {
      gw.server.to(`user:${payload.addresseeId}`).emit('friend:cancelled', {
        friendshipId: payload.friendshipId
      })
    }
  )

  gw.events.on(
    'friend:removed',
    (payload: { friendshipId: string; userId: string; otherUserId: string }) => {
      gw.invalidateFriendCache(payload.userId, payload.otherUserId)
      gw.server.to(`user:${payload.otherUserId}`).emit('friend:removed', {
        friendshipId: payload.friendshipId,
        userId: payload.userId
      })
    }
  )

  // ── Forum events ──

  gw.events.on(
    'forum:post:created',
    (payload: { channelId: string; serverId: string; post: unknown }) => {
      gw.emitToChannel(payload.channelId, 'forum:post:created', payload.post)
    }
  )

  gw.events.on(
    'forum:post:updated',
    (payload: { channelId: string; serverId: string; post: unknown }) => {
      gw.emitToChannel(payload.channelId, 'forum:post:updated', payload.post)
    }
  )

  gw.events.on(
    'forum:post:deleted',
    (payload: { channelId: string; serverId: string; postId: string }) => {
      gw.emitToChannel(payload.channelId, 'forum:post:deleted', { postId: payload.postId })
    }
  )

  // ── REST-originated events ──
  // These mirror the same Socket.IO broadcasts the gateway does for WS-originated actions,
  // so REST API consumers get real-time delivery to other connected clients.

  gw.events.on(
    'rest:message:created',
    (payload: { channelId: string; message: any; serverId?: string; threadUpdate?: { parentId: string; threadCount: number } }) => {
      if (!payload.serverId) {
        gw.emitToChannel(payload.channelId, 'message:new', { ...payload.message })
        return
      }
      const senderId =
        typeof payload.message?.authorId === 'string'
          ? payload.message.authorId
          : typeof payload.message?.author?.id === 'string'
            ? payload.message.author.id
            : null
      void deliverChannelMessage(gw.messageNotificationsContext(), {
        serverId: payload.serverId,
        channelId: payload.channelId,
        message: payload.message,
        senderId,
        threadUpdate: payload.threadUpdate
      })

      const content = payload.message?.content
      if (typeof content === 'string' && content.startsWith('/')) {
        void routeRestSlashCommand(gw, content, payload.serverId, payload.channelId, senderId ?? undefined)
      }
    }
  )

  gw.events.on('rest:message:edited', (payload: { channelId: string; message: unknown }) => {
    gw.emitToChannel(payload.channelId, 'message:edit', payload.message)
  })

  gw.events.on('rest:message:deleted', (payload: { channelId: string; messageId: string }) => {
    gw.emitToChannel(payload.channelId, 'message:delete', { messageId: payload.messageId })
  })

  gw.events.on('rest:message:pinned', (payload: { channelId: string; message: unknown }) => {
    gw.emitToChannel(payload.channelId, 'message:pin', payload.message)
  })

  gw.events.on('rest:message:unpinned', (payload: { channelId: string; message: unknown }) => {
    gw.emitToChannel(payload.channelId, 'message:unpin', payload.message)
  })

  for (const ev of ['rest:reaction:added', 'rest:reaction:removed'] as const) {
    gw.events.on(
      ev,
      (payload: {
        messageId: string
        emoji: string
        userId: string
        isCustom: boolean
        channelId: string | null
        directConversationId: string | null
      }) => {
        const socketEvent = ev === 'rest:reaction:added' ? 'reaction:add' : 'reaction:remove'
        const data = { messageId: payload.messageId, emoji: payload.emoji, userId: payload.userId, isCustom: payload.isCustom }
        if (payload.channelId) {
          gw.emitToChannel(payload.channelId, socketEvent, data)
        } else if (payload.directConversationId) {
          gw.emitToDm(payload.directConversationId, socketEvent, { ...data, conversationId: payload.directConversationId })
        }
      }
    )
  }

  gw.events.on('rest:poll:voted', (payload: { channelId: string; poll: unknown }) => {
    gw.emitToChannel(payload.channelId, 'poll:vote', payload.poll)
  })

  gw.events.on('bot:commands-updated', (payload: { serverId: string; botAppId: string }) => {
    gw.server.to(`server:${payload.serverId}`).emit('bot:commands-updated', { serverId: payload.serverId })
  })

  gw.events.on(
    'rest:dm:created',
    async (payload: { conversationId: string; message: any }) => {
      const roomName = `dm:${payload.conversationId}`
      const memberRows = await gw.prisma.directConversationMember.findMany({
        where: { conversationId: payload.conversationId },
        select: { userId: true }
      })
      for (const { userId } of memberRows) {
        const sockets = await gw.server.in(`user:${userId}`).fetchSockets()
        for (const s of sockets) s.join(roomName)
      }

      const senderId =
        typeof payload.message?.authorId === 'string'
          ? payload.message.authorId
          : typeof payload.message?.author?.id === 'string'
            ? payload.message.author.id
            : null

      await deliverDmMessage(gw.messageNotificationsContext(), {
        conversationId: payload.conversationId,
        message: payload.message,
        senderId
      })

      const content = payload.message?.content
      if (typeof content === 'string' && content.startsWith('/')) {
        const members = memberRows.map((m) => m.userId)
        const otherMembers = senderId ? members.filter((id) => id !== senderId) : members
        const botMember = otherMembers.length > 0 ? await gw.prisma.user.findFirst({
          where: { id: { in: otherMembers }, isBot: true },
        }) : null
        if (botMember && senderId) {
          const invoker = await gw.prisma.user.findUnique({
            where: { id: senderId },
            select: { id: true, username: true, displayName: true }
          })
          if (invoker) {
            void routeDmSlashCommand(gw, content, payload.conversationId, botMember.id, invoker)
          }
        }
      }
    }
  )
}
