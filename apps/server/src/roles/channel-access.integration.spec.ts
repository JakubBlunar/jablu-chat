import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { ConfigService } from '@nestjs/config'
import { ConflictException } from '@nestjs/common'
import { Permission, explainChannelAccess, hasPermission } from '@chat/shared'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from './roles.service'
import { ChannelAccessService } from './channel-access.service'
import type { EventBusService } from '../events/event-bus.service'

const databaseTests = process.env.CHANNEL_ACCESS_DB_TEST === '1' ? describe : describe.skip

databaseTests('channel access with PostgreSQL', () => {
  let prisma: PrismaService
  let service: ChannelAccessService
  let roles: RolesService
  let ownerId: string
  let memberId: string
  let serverId: string
  let channelId: string
  let everyoneId: string
  let teamId: string
  const userIds: string[] = []

  beforeAll(async () => {
    loadEnv({
      path: [
        resolve(process.cwd(), '../../.env.local'),
        resolve(process.cwd(), '../../.env.development'),
        resolve(process.cwd(), '../../.env')
      ],
      quiet: true
    })
    const url = process.env.DATABASE_URL!
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
      throw new Error('This test requires a local PostgreSQL database')
    prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }))
    await prisma.onModuleInit()
    const events = { emit: jest.fn() } as unknown as EventBusService
    roles = new RolesService(prisma, events)
    service = new ChannelAccessService(prisma, roles, events)
    for (const label of ['owner', 'member']) {
      const name = `access-qa-${label}-${randomUUID()}`
      const user = await prisma.user.create({
        data: { username: name, email: `${name}@example.invalid`, passwordHash: 'test-only-no-login' }
      })
      userIds.push(user.id)
    }
    ;[ownerId, memberId] = userIds
    const server = await prisma.server.create({ data: { name: 'Channel access transaction QA', ownerId } })
    serverId = server.id
    const everyone = await prisma.role.create({
      data: {
        serverId,
        name: '@everyone',
        isDefault: true,
        permissions: Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES
      }
    })
    everyoneId = everyone.id
    const team = await prisma.role.create({ data: { serverId, name: 'Team', permissions: 0n } })
    teamId = team.id
    await prisma.serverMember.createMany({
      data: [
        { userId: ownerId, serverId },
        { userId: memberId, serverId }
      ]
    })
    await prisma.serverMemberRole.create({ data: { userId: memberId, serverId, roleId: teamId } })
    channelId = (await prisma.channel.create({ data: { serverId, name: 'access-qa', type: 'text' } })).id
  }, 30000)

  afterAll(async () => {
    if (!prisma) return
    if (serverId) await prisma.server.delete({ where: { id: serverId } })
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.onModuleDestroy()
  })

  it('matches the actual enforced permissions after saving and rejects stale replacement', async () => {
    const original = await service.getContext(serverId, channelId, ownerId)
    const overrides = [
      { roleId: everyoneId, allow: '0', deny: Permission.VIEW_CHANNEL.toString() },
      { roleId: teamId, allow: Permission.VIEW_CHANNEL.toString(), deny: Permission.SEND_MESSAGES.toString() }
    ]
    await service.save(serverId, channelId, ownerId, { overrides, expectedOverrides: original.overrides })
    const context = await service.getContext(serverId, channelId, ownerId)
    const member = context.members.find((row) => row.userId === memberId)!
    expect(explainChannelAccess(context, member, context.overrides).permissions).toBe(
      await roles.getChannelPermissions(serverId, channelId, memberId)
    )
    expect(explainChannelAccess(context, member, context.overrides).status).toBe('readOnly')
    await expect(service.save(serverId, channelId, ownerId, { overrides: [], expectedOverrides: [] })).rejects.toThrow(
      ConflictException
    )
    expect(await prisma.channelPermissionOverride.count({ where: { channelId } })).toBe(2)
  })

  it('allows one concurrent writer and rejects the other without mixing their rules', async () => {
    const { overrides: expectedOverrides } = await service.getContext(serverId, channelId, ownerId)
    const candidates = [
      [{ roleId: everyoneId, allow: Permission.VIEW_CHANNEL.toString(), deny: '0' }],
      [{ roleId: teamId, allow: '0', deny: Permission.VIEW_CHANNEL.toString() }]
    ]
    const results = await Promise.allSettled(
      candidates.map((overrides) => service.save(serverId, channelId, ownerId, { overrides, expectedOverrides }))
    )
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(ConflictException)
    const rows = await prisma.channelPermissionOverride.findMany({ where: { channelId } })
    expect(rows).toHaveLength(1)
    const winning = candidates[results.findIndex((result) => result.status === 'fulfilled')][0]
    expect(rows[0]).toMatchObject({ roleId: winning.roleId, allow: BigInt(winning.allow), deny: BigInt(winning.deny) })
    expect(
      hasPermission(await roles.getChannelPermissions(serverId, channelId, ownerId), Permission.VIEW_CHANNEL)
    ).toBe(true)
  })
})
