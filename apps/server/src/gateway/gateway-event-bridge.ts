import { Server } from 'socket.io'
import { EventBusService } from '../events/event-bus.service'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { RedisService } from '../redis/redis.service'
import { sendPushToOfflineMembers } from './gateway-push.service'

export function registerEventBridgeHandlers(
  server: Server,
  events: EventBusService,
  prisma: PrismaService,
  push: PushService,
  redis: RedisService,
  isUserOnline: (userId: string) => boolean,
  manualStatus: Map<string, string>
) {
  const emitToChannel = (channelId: string, event: string, data: unknown) => {
    server.to(`channel:${channelId}`).emit(event, data)
  }

  const emitToDm = (conversationId: string, event: string, data: unknown) => {
    server.to(`dm:${conversationId}`).emit(event, data)
  }

  events.on('user:status', async (payload: { userId: string; status: string }) => {
    if (payload.status === 'dnd') {
      manualStatus.set(payload.userId, 'dnd')
    } else {
      manualStatus.delete(payload.userId)
    }

    const memberships = await prisma.serverMember.findMany({
      where: { userId: payload.userId },
      select: { serverId: true }
    })
    for (const m of memberships) {
      server.to(`server:${m.serverId}`).emit('user:status', {
        userId: payload.userId,
        status: payload.status
      })
    }
  })

  events.on('user:custom-status', async (payload: { userId: string; customStatus: string | null }) => {
    const memberships = await prisma.serverMember.findMany({
      where: { userId: payload.userId },
      select: { serverId: true }
    })
    for (const m of memberships) {
      server.to(`server:${m.serverId}`).emit('user:custom-status', {
        userId: payload.userId,
        customStatus: payload.customStatus
      })
    }
  })

  events.on(
    'webhook:message',
    (payload: { channelId: string; message: unknown; serverId?: string; webhookName?: string }) => {
      emitToChannel(payload.channelId, 'message:new', {
        ...(payload.message as object),
        ...(payload.serverId ? { serverId: payload.serverId } : {})
      })

      if (payload.serverId && payload.webhookName) {
        const content = (payload.message as { content?: string })?.content
        sendPushToOfflineMembers(
          prisma,
          push,
          redis,
          isUserOnline,
          payload.serverId,
          '',
          payload.webhookName,
          content,
          `/channels/${payload.serverId}/${payload.channelId}`,
          payload.channelId,
          []
        ).catch(() => {})
      }
    }
  )

  events.on(
    'webhook:link-previews',
    (payload: { channelId: string; messageId: string; linkPreviews: unknown }) => {
      emitToChannel(payload.channelId, 'message:link-previews', {
        messageId: payload.messageId,
        linkPreviews: payload.linkPreviews
      })
    }
  )

  events.on('dm:read', (payload: { conversationId: string; userId: string; lastReadAt: string }) => {
    emitToDm(payload.conversationId, 'dm:read', payload)
  })

  events.on('admin:message:delete', (payload: { messageId: string; channelId: string }) => {
    emitToChannel(payload.channelId, 'message:delete', payload)
  })

  events.on('admin:dm:delete', (payload: { messageId: string; conversationId: string }) => {
    emitToDm(payload.conversationId, 'dm:delete', payload)
  })

  events.on('channel:reorder', (payload: { serverId: string; channelIds: string[] }) => {
    server.to(`server:${payload.serverId}`).emit('channel:reorder', { channelIds: payload.channelIds })
  })

  events.on('channel:created', async (payload: { serverId: string; channel: { id: string } }) => {
    server.to(`server:${payload.serverId}`).emit('channel:created', payload)
    const sockets = await server.in(`server:${payload.serverId}`).fetchSockets()
    for (const s of sockets) s.join(`channel:${payload.channel.id}`)
  })

  events.on('channel:updated', (payload: { serverId: string; channel: unknown }) => {
    server.to(`server:${payload.serverId}`).emit('channel:updated', payload)
  })

  events.on('channel:deleted', (payload: { serverId: string; channelId: string }) => {
    server.to(`server:${payload.serverId}`).emit('channel:deleted', payload)
  })

  events.on('category:created', (payload: { serverId: string; category: unknown }) => {
    server.to(`server:${payload.serverId}`).emit('category:created', payload)
  })

  events.on('category:updated', (payload: { serverId: string; category: unknown }) => {
    server.to(`server:${payload.serverId}`).emit('category:updated', payload)
  })

  events.on('category:deleted', (payload: { serverId: string; categoryId: string }) => {
    server.to(`server:${payload.serverId}`).emit('category:deleted', payload)
  })

  events.on('category:reorder', (payload: { serverId: string; categoryIds: string[] }) => {
    server.to(`server:${payload.serverId}`).emit('category:reorder', { categoryIds: payload.categoryIds })
  })

  events.on('member:joined', async (payload: { serverId: string; member: unknown }) => {
    const { serverId, member } = payload as { serverId: string; member: { userId: string } }
    server.to(`server:${serverId}`).emit('member:joined', { serverId, member })

    const channels = await prisma.channel.findMany({
      where: { serverId },
      select: { id: true }
    })
    const userSockets = await server.in(`user:${member.userId}`).fetchSockets()
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
  })

  events.on('user:profile', async (payload: { userId: string; displayName?: string; bio?: string; avatarUrl?: string | null }) => {
    const memberships = await prisma.serverMember.findMany({
      where: { userId: payload.userId },
      select: { serverId: true }
    })
    for (const m of memberships) {
      server.to(`server:${m.serverId}`).emit('user:profile', payload)
    }
  })

  events.on('server:updated', (payload: { serverId: string; name?: string; iconUrl?: string | null }) => {
    server.to(`server:${payload.serverId}`).emit('server:updated', payload)
  })

  events.on('member:updated', (payload: { serverId: string; userId: string; roleId?: string }) => {
    server.to(`server:${payload.serverId}`).emit('member:updated', payload)
  })

  events.on('member:removed', async (payload: { serverId: string; userId: string }) => {
    server.to(`server:${payload.serverId}`).emit('member:left', {
      serverId: payload.serverId,
      userId: payload.userId
    })

    const channels = await prisma.channel.findMany({
      where: { serverId: payload.serverId },
      select: { id: true }
    })
    const userSockets = await server.in(`user:${payload.userId}`).fetchSockets()
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
    events.on(ev, (payload: { serverId: string; event: unknown }) => {
      server.to(`server:${payload.serverId}`).emit(ev, payload.event)
    })
  }

  events.on(
    'event:interest',
    (payload: { serverId: string; eventId: string; userId: string; interested: boolean; count: number }) => {
      server.to(`server:${payload.serverId}`).emit('event:interest', {
        eventId: payload.eventId,
        userId: payload.userId,
        interested: payload.interested,
        count: payload.count
      })
    }
  )

  events.on(
    'friend:request',
    (payload: { friendshipId: string; requester: Record<string, unknown>; addressee: Record<string, unknown> }) => {
      const { friendshipId, requester, addressee } = payload
      const addresseeId = (addressee as { id: string }).id
      const requesterName =
        (requester as { displayName?: string }).displayName ??
        (requester as { username?: string }).username ??
        'Someone'

      server.to(`user:${addresseeId}`).emit('friend:request', {
        friendshipId,
        user: requester,
        direction: 'incoming',
        createdAt: new Date().toISOString()
      })

      if (!isUserOnline(addresseeId)) {
        push
          .sendToUsers([addresseeId], {
            title: 'Friend Request',
            body: `${requesterName} sent you a friend request`,
            url: '/channels/@me'
          })
          .catch(() => {})
      }
    }
  )

  events.on(
    'friend:accepted',
    (payload: { friendshipId: string; requester: Record<string, unknown>; addressee: Record<string, unknown> }) => {
      const { friendshipId, requester, addressee } = payload
      server.to(`user:${(requester as { id: string }).id}`).emit('friend:accepted', {
        friendshipId,
        user: addressee
      })
      server.to(`user:${(addressee as { id: string }).id}`).emit('friend:accepted', {
        friendshipId,
        user: requester
      })
    }
  )

  events.on(
    'friend:declined',
    (payload: { friendshipId: string; requesterId: string; addresseeId: string }) => {
      server.to(`user:${payload.requesterId}`).emit('friend:declined', {
        friendshipId: payload.friendshipId
      })
    }
  )

  events.on(
    'friend:cancelled',
    (payload: { friendshipId: string; requesterId: string; addresseeId: string }) => {
      server.to(`user:${payload.addresseeId}`).emit('friend:cancelled', {
        friendshipId: payload.friendshipId
      })
    }
  )

  events.on(
    'friend:removed',
    (payload: { friendshipId: string; userId: string; otherUserId: string }) => {
      server.to(`user:${payload.otherUserId}`).emit('friend:removed', {
        friendshipId: payload.friendshipId,
        userId: payload.userId
      })
    }
  )
}
