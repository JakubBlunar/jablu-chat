import type { ChatGateway } from './gateway.gateway'

/**
 * Registers all event-bus listeners on the gateway.
 * Called once from `ChatGateway.afterInit()`.
 */
export function registerEventListeners(gw: ChatGateway) {
  gw.events.on('user:status', async (payload: { userId: string; status: string }) => {
    if (payload.status === 'online') {
      gw.manualStatus.delete(payload.userId)
    } else {
      gw.manualStatus.set(payload.userId, payload.status)
    }

    const memberships = await gw.prisma.serverMember.findMany({
      where: { userId: payload.userId },
      select: { serverId: true }
    })
    for (const m of memberships) {
      gw.server.to(`server:${m.serverId}`).emit('user:status', {
        userId: payload.userId,
        status: payload.status
      })
    }
  })

  gw.events.on('user:custom-status', async (payload: { userId: string; customStatus: string | null }) => {
    const memberships = await gw.prisma.serverMember.findMany({
      where: { userId: payload.userId },
      select: { serverId: true }
    })
    for (const m of memberships) {
      gw.server.to(`server:${m.serverId}`).emit('user:custom-status', {
        userId: payload.userId,
        customStatus: payload.customStatus
      })
    }
  })

  gw.events.on(
    'webhook:message',
    (payload: { channelId: string; message: unknown; serverId?: string; webhookName?: string }) => {
      gw.emitToChannel(payload.channelId, 'message:new', payload.message)

      if (payload.serverId && payload.webhookName) {
        const content = (payload.message as { content?: string })?.content
        gw
          .sendPushToOfflineMembers(
            payload.serverId,
            '',
            payload.webhookName,
            content,
            `/channels/${payload.serverId}/${payload.channelId}`,
            payload.channelId,
            []
          )
          .catch(() => {})
      }
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
    const sockets = await gw.server.in(`server:${payload.serverId}`).fetchSockets()
    for (const s of sockets) s.join(`channel:${payload.channel.id}`)
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

    const channels = await gw.prisma.channel.findMany({
      where: { serverId },
      select: { id: true }
    })
    const userSockets = await gw.server.in(`user:${member.userId}`).fetchSockets()
    for (const s of userSockets) {
      s.join(`server:${serverId}`)
      for (const ch of channels) {
        s.join(`channel:${ch.id}`)
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
        gw.emitToChannel(server.welcomeChannelId, 'message:new', welcomeMsg)
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

  gw.events.on('member:updated', (payload: { serverId: string; userId: string; roleId?: string }) => {
    gw.server.to(`server:${payload.serverId}`).emit('member:updated', payload)
  })

  gw.events.on('channel:permissions:updated', (payload: { serverId: string; channelId: string; roleId: string }) => {
    gw.server.to(`server:${payload.serverId}`).emit('channel:permissions:updated', payload)
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

      if (!gw.isUserOnline(addresseeId)) {
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
      gw.server.to(`user:${(requester as { id: string }).id}`).emit('friend:accepted', {
        friendshipId,
        user: addressee
      })
      gw.server.to(`user:${(addressee as { id: string }).id}`).emit('friend:accepted', {
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
      gw.server.to(`user:${payload.otherUserId}`).emit('friend:removed', {
        friendshipId: payload.friendshipId,
        userId: payload.userId
      })
    }
  )

  // ── REST-originated events ──
  // These mirror the same Socket.IO broadcasts the gateway does for WS-originated actions,
  // so REST API consumers get real-time delivery to other connected clients.

  gw.events.on(
    'rest:message:created',
    (payload: { channelId: string; message: unknown; serverId?: string; threadUpdate?: { parentId: string; threadCount: number } }) => {
      gw.emitToChannel(payload.channelId, 'message:new', payload.message)
      if (payload.threadUpdate) {
        gw.emitToChannel(payload.channelId, 'message:thread-update', {
          parentId: payload.threadUpdate.parentId,
          threadCount: payload.threadUpdate.threadCount
        })
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
}
