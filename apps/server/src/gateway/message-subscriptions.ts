import { messagePreviewText, type MessageActivity } from '@chat/shared'
import type { Server } from 'socket.io'

export const COMPACT_MESSAGES_ROOM = 'messages:compact:v1'
type Mode = MessageActivity['mode']
type RoomSocket = {
  data: {
    compactMessages?: boolean
    user?: { id: string }
    channelWatch?: string
    channelPendingWatch?: string
    channelWatchSequence?: number
    dmWatch?: string
    dmPendingWatch?: string
    dmWatchSequence?: number
  }
  join: (room: string | string[]) => unknown
  leave: (room: string) => unknown
}
export const fullMessageRoom = (mode: Mode, id: string) => `messages:${mode}:${id}`
const backgroundRoom = (mode: Mode, id: string) => `background:${mode}:${id}`
const mentionRoom = (id: string, userId: string) => `background:channel:${id}:user:${userId}`
export const messageContextRooms = (mode: Mode, id: string) => [
  `${mode}:${id}`,
  fullMessageRoom(mode, id),
  backgroundRoom(mode, id)
]

export async function joinMessageContext(socket: RoomSocket, mode: Mode, id: string) {
  const rooms = [`${mode}:${id}`]
  if (socket.data.compactMessages) {
    rooms.push(backgroundRoom(mode, id))
    if (mode === 'channel' && socket.data.user) rooms.push(mentionRoom(id, socket.data.user.id))
  }
  await socket.join(rooms.length === 1 ? rooms[0]! : rooms)
}

export async function leaveMessageContext(socket: RoomSocket, mode: Mode, id: string) {
  if (mode === 'channel' && socket.data.channelPendingWatch === id) {
    socket.data.channelWatchSequence = (socket.data.channelWatchSequence ?? 0) + 1
  }
  if (mode === 'channel' && socket.data.channelWatch === id) socket.data.channelWatch = undefined
  if (mode === 'dm' && socket.data.dmPendingWatch === id) {
    socket.data.dmWatchSequence = (socket.data.dmWatchSequence ?? 0) + 1
  }
  if (mode === 'dm' && socket.data.dmWatch === id) socket.data.dmWatch = undefined
  await socket.leave(fullMessageRoom(mode, id))
  await socket.leave(backgroundRoom(mode, id))
  if (mode === 'channel' && socket.data.user) await socket.leave(mentionRoom(id, socket.data.user.id))
  await socket.leave(`${mode}:${id}`)
}

/** Two disjoint deliveries: full wire for watchers/legacy clients, bounded hints elsewhere. */
export function emitMessageEvent(
  server: Server,
  mode: Mode,
  id: string,
  event: string,
  data: unknown,
  enabled: boolean
) {
  const base = `${mode}:${id}`
  const messageEvent =
    (event.startsWith(mode === 'channel' ? 'message:' : 'dm:') &&
      !['dm:read', 'dm:typing', 'dm:typing-stop'].includes(event)) ||
    (mode === 'channel' && (event.startsWith('forum:post:') || event === 'poll:vote' || event.startsWith('reaction:')))
  if (!enabled || !messageEvent) {
    server.to(base).emit(event, data)
    return
  }
  const full = fullMessageRoom(mode, id)
  // A newly added membership can receive full events until its background
  // rooms finish joining. This also keeps mixed-version rollout gap-free.
  server.to(base).except(backgroundRoom(mode, id)).emit(event, data)
  server.to(full).emit(event, data)
  const activity: MessageActivity = { mode, contextId: id, event }
  // Producer data is internal, and only this explicit allowlist goes to background clients.
  const message = data as {
    id?: string
    authorId?: string
    createdAt?: string
    serverId?: string
    threadParentId?: string
    content?: string
    author?: { username?: string; displayName?: string }
    attachments?: { type: string; filename: string }[]
    mentionedUserIds?: string[]
  }
  if (event === (mode === 'channel' ? 'message:new' : 'dm:new') && message?.id) {
    activity.message = {
      id: message.id,
      authorId: message.authorId ?? null,
      createdAt: message.createdAt ?? '',
      serverId: message.serverId,
      threadParentId: message.threadParentId ?? null,
      content: messagePreviewText(message.content) || null,
      author: message.author
        ? {
            username: message.author.username?.slice(0, 100) ?? '',
            displayName: message.author.displayName?.slice(0, 100) ?? null
          }
        : undefined,
      attachments: (message.attachments ?? [])
        .slice(0, 10)
        .map((a) => ({ type: a.type, filename: a.filename.slice(0, 100) }))
    }
  }
  const mentionedRooms =
    mode === 'channel' && activity.message
      ? [...new Set(message.mentionedUserIds ?? [])].map((userId) => mentionRoom(id, userId))
      : []
  server
    .to(backgroundRoom(mode, id))
    .except([full, ...mentionedRooms])
    .emit('message:activity', { ...activity, isMention: mode === 'dm' })
  if (mentionedRooms.length)
    server
      .to(mentionedRooms)
      .except(full)
      .emit('message:activity', { ...activity, isMention: true })
}
