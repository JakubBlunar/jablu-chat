import type { Server } from 'socket.io'
import {
  COMPACT_MESSAGES_ROOM,
  emitMessageEvent,
  fullMessageRoom,
  joinMessageContext,
  leaveMessageContext
} from './message-subscriptions'
import { ChatGateway } from './gateway.gateway'
import { ForbiddenException } from '@nestjs/common'

function socket(userId: string, compact = true) {
  const rooms = new Set<string>(compact ? [COMPACT_MESSAGES_ROOM] : [])
  return {
    data: { user: { id: userId }, compactMessages: compact } as Record<string, any>,
    rooms,
    events: [] as { event: string; data: any }[],
    join: jest.fn(async (room: string | string[]) => {
      for (const id of Array.isArray(room) ? room : [room]) rooms.add(id)
    }),
    leave: jest.fn(async (room: string) => {
      rooms.delete(room)
    })
  }
}
function server(sockets: ReturnType<typeof socket>[]) {
  function broadcast(rooms: string[], excluded: string[] = []) {
    return {
      except: (ids: string | string[]) => broadcast(rooms, [...excluded, ...(Array.isArray(ids) ? ids : [ids])]),
      emit: (event: string, data: unknown) => {
        for (const s of sockets)
          if (rooms.some((r) => s.rooms.has(r)) && !excluded.some((r) => s.rooms.has(r))) s.events.push({ event, data })
      }
    }
  }
  return { to: (ids: string | string[]) => broadcast(Array.isArray(ids) ? ids : [ids]) } as unknown as Server
}

it('delivers full messages once to watchers and legacy clients and compact personalized hints elsewhere', async () => {
  const active = socket('active'),
    background = socket('mentioned'),
    device = socket('mentioned'),
    legacy = socket('bot', false)
  for (const s of [active, background, device, legacy]) await joinMessageContext(s, 'channel', 'channel')
  await active.join(fullMessageRoom('channel', 'channel'))
  await device.join(fullMessageRoom('channel', 'other-channel'))
  const message = {
    id: 'message',
    content: '```ts\n' + 'large '.repeat(1000) + '\n```',
    authorId: 'sender',
    createdAt: new Date().toISOString(),
    mentionedUserIds: ['mentioned'],
    reactions: Array(5000).fill({ userId: 'user' }),
    attachments: []
  }
  emitMessageEvent(server([active, background, device, legacy]), 'channel', 'channel', 'message:new', message, true)
  for (const s of [active, legacy]) expect(s.events).toEqual([{ event: 'message:new', data: message }])
  for (const s of [background, device]) {
    expect(s.events).toHaveLength(1)
    expect(s.events[0]).toMatchObject({
      event: 'message:activity',
      data: { isMention: true, message: { id: 'message' } }
    })
    expect(JSON.stringify(s.events[0]).length).toBeLessThan(1000)
    expect(s.events[0]!.data.message.reactions).toBeUndefined()
    expect(s.events[0]!.data.message.content).not.toContain('```')
    expect(s.events[0]!.data.message.content.length).toBeLessThanOrEqual(100)
  }
  await leaveMessageContext(background, 'channel', 'channel')
  background.events.length = 0
  emitMessageEvent(server([background]), 'channel', 'channel', 'message:new', message, true)
  expect(background.events).toEqual([])
})

it('keeps membership transitions and background DM invalidations gap-free', async () => {
  const s = socket('user')
  await s.join('dm:conversation') // before background membership reconciliation
  const io = server([s])
  emitMessageEvent(io, 'dm', 'conversation', 'dm:new', { id: 'message' }, true)
  expect(s.events[0]!.event).toBe('dm:new')
  s.events.length = 0
  await joinMessageContext(s, 'dm', 'conversation')
  emitMessageEvent(io, 'dm', 'conversation', 'dm:edit', { id: 'message', content: 'private text' }, true)
  expect(s.events).toEqual([
    { event: 'message:activity', data: { mode: 'dm', contextId: 'conversation', event: 'dm:edit', isMention: true } }
  ])
})

function gateway(allow: (id: string) => Promise<unknown>) {
  return Object.assign(Object.create(ChatGateway.prototype), {
    messages: { assertUserCanAccessChannel: allow },
    dm: { requireMembership: allow },
    messageWatchQueues: new WeakMap()
  }) as ChatGateway
}

it('checks permissions and makes the latest concurrent watch win, including delayed adapter joins', async () => {
  const s = socket('user')
  const gw = gateway(async () => {})
  let release!: () => void
  const started = new Promise<void>((resolve) => {
    s.join.mockImplementationOnce(async (room) => {
      resolve()
      await new Promise<void>((r) => {
        release = r
      })
      s.rooms.add(room as string)
    })
  })
  const first = gw.onChannelWatch(s as never, { channelId: 'first' })
  await started
  const second = gw.onChannelWatch(s as never, { channelId: 'second' })
  release()
  expect(await first).toEqual({ ok: false })
  expect(await second).toEqual({ ok: true })
  expect([...s.rooms].filter((r) => r.startsWith('messages:channel:'))).toEqual([fullMessageRoom('channel', 'second')])
  await gw.onChannelWatch(s as never, {})
  expect(s.rooms.has(fullMessageRoom('channel', 'second'))).toBe(false)
})

it('fences a permission revocation while a watch authorization is in flight', async () => {
  const s = socket('user')
  await joinMessageContext(s, 'channel', 'private')
  let grant!: () => void
  const gw = gateway(
    () =>
      new Promise<void>((resolve) => {
        grant = resolve
      })
  )
  const pending = gw.onChannelWatch(s as never, { channelId: 'private' })
  await leaveMessageContext(s, 'channel', 'private')
  grant()
  expect(await pending).toEqual({ ok: false })
  expect([...s.rooms]).toEqual([COMPACT_MESSAGES_ROOM])
})

it('denies inaccessible watches and cannot restore a DM room removed during authorization', async () => {
  const s = socket('user')
  const denied = gateway(async () => { throw new ForbiddenException('denied') })
  expect(await denied.onChannelWatch(s as never, { channelId: 'private' })).toEqual({ ok: false, error: 'denied' })
  expect(s.join).not.toHaveBeenCalled()
  s.data.realtimeReady = true
  await joinMessageContext(s, 'dm', 'removed')
  let grant!: () => void
  const gw = gateway(() => new Promise<void>(resolve => { grant = resolve }))
  const pending = gw.onDmWatch(s as never, { conversationId: 'removed' })
  // Membership revocation leaves the base and all derived rooms atomically.
  s.rooms.delete('dm:removed')
  grant()
  expect(await pending).toEqual({ ok: false })
  expect(s.rooms.has(fullMessageRoom('dm', 'removed'))).toBe(false)
})
