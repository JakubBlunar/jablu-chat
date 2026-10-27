import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { Permission } from '@chat/shared'
import { ForbiddenException } from '@nestjs/common'
import { PrismaClient } from '../prisma-client'
import type { PrismaService } from '../prisma/prisma.service'
import { EventBusService } from '../events/event-bus.service'
import { RolesService } from '../roles/roles.service'
import { ReadStateService } from '../read-state/read-state.service'
import { ChatGateway } from '../gateway/gateway.gateway'
import { MessagesService } from './messages.service'
import { MessagesController } from './messages.controller'
import type { XpService } from '../xp/xp.service'

const url = process.env.PERFORMANCE_TEST_DATABASE_URL
const database = url ? describe : describe.skip

database('Message operation authorization (PostgreSQL)', () => {
  it('reuses send checks and targets mention candidates while preserving authorization boundaries', async () => {
    const pool = new Pool({ connectionString: url })
    const db = new PrismaClient({ adapter: new PrismaPg(pool), log: [{ level: 'query', emit: 'event' }] })
    let queries = 0
    db.$on('query', () => queries++)
    const rollback = new Error('rollback fixture')
    try {
      await expect(db.$transaction(async tx => {
        const users = await tx.$queryRaw<{ id: string; username: string }[]>`
          INSERT INTO users (id, username, email, password_hash, updated_at)
          SELECT gen_random_uuid()::text, 'p11_' || md5(random()::text), gen_random_uuid()::text || '@invalid.test', 'fixture', NOW()
          FROM generate_series(1,5003) RETURNING id, username
        `
        const [owner, sender, target, roleMember] = users
        const server = await tx.server.create({ data: { name: 'Perf11 fixture', ownerId: owner.id } })
        const channel = await tx.channel.create({ data: { serverId: server.id, name: 'general' } })
        await tx.serverMember.createMany({ data: users.map(u => ({ userId: u.id, serverId: server.id })) })
        await tx.user.update({ where: { id: target.id }, data: { displayName: 'Target Name' } })
        await tx.serverMember.update({ where: { userId_serverId: { userId: target.id, serverId: server.id } }, data: { displayName: 'Server Target' } })
        const everyone = await tx.role.create({ data: { serverId: server.id, name: '@everyone', isDefault: true, permissions: Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES } })
        const moderator = await tx.role.create({ data: { serverId: server.id, name: 'Moderators', permissions: 0n } })
        await tx.serverMemberRole.create({ data: { userId: roleMember.id, serverId: server.id, roleId: moderator.id } })
        const prisma = new Proxy(tx, { get(target, property) {
          return property === '$transaction' ? (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx) : Reflect.get(target, property)
        } }) as unknown as PrismaService
        const events = new EventBusService()
        const roles = new RolesService(prisma, events)
        const messages = new MessagesService(prisma, roles, { tryAwardForMessage: async () => null } as unknown as XpService)
        const reads = new ReadStateService(prisma, roles, {} as never)
        const legacyGateway = Object.assign(Object.create(ChatGateway.prototype), { prisma, roles }) as {
          assertNotArchived: (id: string) => Promise<unknown>
          assertCanSendInChannel: (id: string, user: string) => Promise<unknown>
        }
        const parent = await tx.message.create({ data: { channelId: channel.id, authorId: owner.id, content: 'Parent' } })
        for (const entry of [
          { name: 'text', content: 'Plain text' }, { name: 'mention', content: `@${target.username}` },
          { name: 'reply', content: 'A reply', reply: parent.id }, { name: 'thread', content: 'Thread reply', thread: parent.id }
        ]) {
          queries = 0
          await legacyGateway.assertNotArchived(channel.id)
          await legacyGateway.assertCanSendInChannel(channel.id, sender.id)
          await messages.createMessage(channel.id, sender.id, entry.content, entry.reply, undefined, entry.thread)
          const legacyQueries = queries
          queries = 0
          const result = await messages.withSendAuthorization(channel.id, sender.id, operation => messages.createMessage(
            channel.id, sender.id, entry.content, entry.reply, undefined, entry.thread, undefined, undefined, undefined, operation))
          expect(result.content).toBe(entry.content)
          expect(queries).toBeLessThanOrEqual(legacyQueries - 5)
        }
        for (const content of [`@${target.username.toUpperCase()}`, '@"Target Name"', '@"Server Target"']) {
          queries = 0
          expect((await reads.resolveMentions(content, server.id, sender.id, [], 0n)).userIds).toEqual([target.id])
          expect(queries).toBe(1)
        }
        expect((await reads.resolveMentions('@everyone', server.id, sender.id, [], 0n)).userIds).toEqual([])
        expect((await reads.resolveMentions('@everyone', server.id, sender.id, [], Permission.MENTION_EVERYONE)).userIds).toHaveLength(users.length - 1)
        expect((await reads.resolveMentions('@here', server.id, sender.id, [target.id], Permission.MENTION_EVERYONE)).userIds).toEqual([target.id])
        expect((await reads.resolveMentions('@Moderators', server.id, sender.id, [], Permission.MENTION_EVERYONE)).userIds).toEqual([roleMember.id])
        await tx.user.update({ where: { id: target.id }, data: { displayName: 'Moderators' } })
        expect((await reads.resolveMentions('@"Moderators"', server.id, sender.id, [], Permission.MENTION_EVERYONE)).userIds).toEqual([target.id])

        // One admitted SEND snapshot may finish; a new attempt must see the revocation.
        await messages.withSendAuthorization(channel.id, sender.id, async operation => {
          await tx.role.update({ where: { id: everyone.id }, data: { permissions: Permission.VIEW_CHANNEL } })
          await messages.createMessage(channel.id, sender.id, 'Already admitted', undefined, undefined, undefined, undefined, undefined, undefined, operation)
        })
        await expect(messages.withSendAuthorization(channel.id, sender.id, async () => undefined)).rejects.toThrow(ForbiddenException)
        await tx.role.update({ where: { id: everyone.id }, data: { permissions: Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES } })
        await tx.serverMember.update({ where: { userId_serverId: { userId: sender.id, serverId: server.id } }, data: { mutedUntil: new Date(Date.now() + 60000) } })
        await expect(messages.withSendAuthorization(channel.id, sender.id, async () => undefined)).rejects.toThrow('timed out')
        await tx.serverMember.update({ where: { userId_serverId: { userId: sender.id, serverId: server.id } }, data: { mutedUntil: null } })
        await tx.channel.update({ where: { id: channel.id }, data: { isArchived: true } })
        await expect(messages.withSendAuthorization(channel.id, sender.id, async () => undefined)).rejects.toThrow('archived')
        await tx.channel.update({ where: { id: channel.id }, data: { isArchived: false } })
        await tx.channelPermissionOverride.create({ data: { channelId: channel.id, roleId: everyone.id, deny: Permission.VIEW_CHANNEL } })
        await expect(messages.withSendAuthorization(channel.id, sender.id, async () => undefined)).rejects.toThrow(ForbiddenException)
        await tx.channelPermissionOverride.deleteMany({ where: { channelId: channel.id } })
        const created = await new MessagesController(messages, events).send(channel.id, { ...sender, email: 'fixture@invalid.test' }, { content: 'REST send' })
        expect(created.content).toBe('REST send')
        await tx.serverMember.delete({ where: { userId_serverId: { userId: users.at(-1)!.id, serverId: server.id } } })
        await expect(messages.withSendAuthorization(channel.id, users.at(-1)!.id, async () => undefined)).rejects.toThrow(ForbiddenException)
        const voice = await tx.channel.create({ data: { serverId: server.id, name: 'voice', type: 'voice' } })
        await expect(messages.withSendAuthorization(voice.id, sender.id, async () => undefined)).rejects.toThrow('text or forum')
        let finishDelivery!: () => void
        const delivery = new Promise<void>(resolve => { finishDelivery = resolve })
        const emit = jest.fn()
        const automod = { checkMessage: jest.fn().mockResolvedValue({ allowed: true }) }
        const gateway = Object.assign(Object.create(ChatGateway.prototype), {
          messages, automod, socketVoiceChannel: new Map(), voiceActivity: new Map(),
          messageNotificationsContext: () => ({
            prisma, roles, readState: reads, getOnlineUserIds: () => [], isUserActivelyEngaged: () => true,
            emitToChannel: emit, linkPreviews: { generatePreviews: async () => [] },
            inApp: { recordChannelMessage: async () => { finishDelivery() } }
          })
        }) as ChatGateway
        const client = { id: 'socket', data: { user: sender } } as never
        const persist = jest.spyOn(messages, 'createMessage')
        expect((await gateway.onMessageSend(client, { channelId: channel.id, content: 'WebSocket send' })).ok).toBe(true)
        await delivery
        expect(emit).toHaveBeenCalledTimes(1)
        automod.checkMessage.mockResolvedValueOnce({ allowed: false })
        expect((await gateway.onMessageSend(client, { channelId: channel.id, content: 'Blocked' })).ok).toBe(false)
        expect(persist).toHaveBeenCalledTimes(1)
        expect(emit).toHaveBeenCalledTimes(1)
        throw rollback
      }, { timeout: 30000 })).rejects.toBe(rollback)
    } finally { await db.$disconnect(); await pool.end() }
  }, 40000)
})
