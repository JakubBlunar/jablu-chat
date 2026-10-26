import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { Permission } from '@chat/shared'
import { PrismaClient } from '../prisma-client'
import type { PrismaService } from '../prisma/prisma.service'
import { EventBusService } from '../events/event-bus.service'
import { RolesService } from '../roles/roles.service'
import type { ChatGateway } from './gateway.gateway'
import { registerEventListeners } from './gateway-event-listeners'

const url = process.env.PERFORMANCE_TEST_DATABASE_URL
const database = url ? describe : describe.skip

database('Channel creation fan-out (PostgreSQL)', () => {
  it('uses bounded authorization queries for 100/1000/5000 connected users and filters private channels', async () => {
    const pool = new Pool({ connectionString: url })
    const db = new PrismaClient({ adapter: new PrismaPg(pool), log: [{ level: 'query', emit: 'event' }] })
    let queries = 0
    db.$on('query', () => queries++)
    const rollback = new Error('rollback fixture')
    try {
      await expect(db.$transaction(async tx => {
        const users = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO users (id, username, email, password_hash, updated_at)
          SELECT gen_random_uuid()::text, 'perf12-' || gen_random_uuid()::text, gen_random_uuid()::text || '@invalid.test', 'fixture', NOW()
          FROM generate_series(1,5000) RETURNING id
        `
        const server = await tx.server.create({ data: { name: 'Perf12 fixture', ownerId: users[0].id } })
        const channel = await tx.channel.create({ data: { serverId: server.id, name: 'private' } })
        await tx.serverMember.createMany({ data: users.map(u => ({ userId: u.id, serverId: server.id })) })
        const everyone = await tx.role.create({ data: { serverId: server.id, name: '@everyone', isDefault: true, permissions: Permission.VIEW_CHANNEL } })
        const allowed = await tx.role.create({ data: { serverId: server.id, name: 'Allowed', permissions: 0n } })
        await tx.channelPermissionOverride.createMany({ data: [
          { channelId: channel.id, roleId: everyone.id, deny: Permission.VIEW_CHANNEL },
          { channelId: channel.id, roleId: allowed.id, allow: Permission.VIEW_CHANNEL }
        ] })
        await tx.serverMemberRole.createMany({ data: users.filter((_, i) => i % 2 === 0).map(u => ({ userId: u.id, serverId: server.id, roleId: allowed.id })) })
        const roles = new RolesService(tx as PrismaService, new EventBusService())
        for (const size of [100, 1000, 5000]) {
          const sockets = users.slice(0, size).map(u => ({ data: { user: u }, rooms: new Set([`server:${server.id}`]), join: jest.fn(), emit: jest.fn() }))
          const handlers = new Map<string, (payload: unknown) => Promise<void>>()
          const gw = { roles, events: { on: (event: string, fn: (payload: unknown) => Promise<void>) => handlers.set(event, fn) },
            server: { in: () => ({ fetchSockets: async () => sockets }) } }
          registerEventListeners(gw as unknown as ChatGateway)
          queries = 0
          await handlers.get('channel:created')!({ serverId: server.id, channel: { id: channel.id } })
          expect(queries).toBeGreaterThanOrEqual(Math.ceil(size / 500) * 4)
          expect(queries).toBeLessThanOrEqual(Math.ceil(size / 500) * 8)
          expect(sockets.filter(s => s.join.mock.calls.length)).toHaveLength(size / 2)
          expect(sockets[size - 2].emit).toHaveBeenCalledTimes(1)
          expect(sockets[size - 1].emit).not.toHaveBeenCalled()
        }
        throw rollback
      }, { timeout: 30000 })).rejects.toBe(rollback)
    } finally { await db.$disconnect(); await pool.end() }
  }, 40000)
})
