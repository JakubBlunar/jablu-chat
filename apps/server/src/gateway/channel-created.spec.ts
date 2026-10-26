import { Permission } from '@chat/shared'
import { registerEventListeners } from './gateway-event-listeners'
import type { ChatGateway } from './gateway.gateway'

function setup(count: number) {
  const sockets = Array.from({ length: count }, (_, i) => ({
    data: { user: { id: `u${i}` } }, rooms: new Set(['server:s1']), join: jest.fn().mockResolvedValue(undefined), emit: jest.fn()
  }))
  const handlers = new Map<string, (payload: unknown) => Promise<void>>()
  const gw = {
    events: { on: (event: string, handler: (payload: unknown) => Promise<void>) => handlers.set(event, handler) },
    server: { in: jest.fn().mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue(sockets) }), to: jest.fn() },
    roles: { getChannelPermissionsForUsers: jest.fn(async (_server, _channel, ids: string[]) => new Map(ids.map(id => [id, Permission.VIEW_CHANNEL]))) },
    prisma: { serverMember: { findMany: jest.fn() } }
  }
  registerEventListeners(gw as unknown as ChatGateway)
  return { gw, sockets, created: () => handlers.get('channel:created')!({ serverId: 's1', channel: { id: 'private' } }) }
}

it.each([100, 1000, 5000])('batches %s connected members and emits only after their room join', async count => {
  const { gw, sockets, created } = setup(count)
  await created()
  expect(gw.roles.getChannelPermissionsForUsers).toHaveBeenCalledTimes(Math.ceil(count / 500))
  expect(gw.server.in).toHaveBeenCalledTimes(1)
  expect(gw.prisma.serverMember.findMany).not.toHaveBeenCalled()
  for (const socket of [sockets[0], sockets[count - 1]]) {
    expect(socket.join).toHaveBeenCalledWith('channel:private')
    expect(socket.emit).toHaveBeenCalledWith('channel:created', expect.anything())
    expect(socket.join.mock.invocationCallOrder[0]).toBeLessThan(socket.emit.mock.invocationCallOrder[0])
  }
  expect(gw.server.to).not.toHaveBeenCalled()
})

it('filters private-channel overrides, removed members and devices that left while permission work was running', async () => {
  const { gw, sockets, created } = setup(4)
  gw.roles.getChannelPermissionsForUsers.mockImplementationOnce(async () => {
    sockets[3].rooms.delete('server:s1')
    return new Map([['u0', Permission.ADMINISTRATOR], ['u1', 0n], ['u3', Permission.VIEW_CHANNEL]])
  })
  await created()
  expect(sockets[0].join).toHaveBeenCalledTimes(1)
  for (const s of sockets.slice(1)) {
    expect(s.join).not.toHaveBeenCalled()
    expect(s.emit).not.toHaveBeenCalled()
  }
})

it('does no database work for a server without connected devices', async () => {
  const { gw, created } = setup(0)
  await created()
  expect(gw.roles.getChannelPermissionsForUsers).not.toHaveBeenCalled()
})
