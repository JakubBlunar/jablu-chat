import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import {
  Permission,
  canonicalChannelRules,
  explainChannelAccess,
  getChannelRuleState,
  setChannelRuleState,
  type ChannelAccessContext
} from '@chat/shared'
import { createMockPrismaService } from '../__mocks__/prisma.mock'
import { ChannelAccessService } from './channel-access.service'
import type { RolesService } from './roles.service'
import type { PrismaService } from '../prisma/prisma.service'
import type { EventBusService } from '../events/event-bus.service'

const everyone = '00000000-0000-4000-8000-000000000001'
const team = '00000000-0000-4000-8000-000000000002'
const view = Permission.VIEW_CHANNEL
const send = Permission.SEND_MESSAGES

describe('channel access inspection and atomic save', () => {
  const setup = () => {
    const prisma = createMockPrismaService()
    prisma.$transaction.mockImplementation((callback) => callback(prisma))
    const roles = {
      requirePermission: jest.fn().mockResolvedValue(0n),
      mapToWire: jest.fn((role) => ({ ...role, permissions: role.permissions.toString() }))
    }
    const events = { emit: jest.fn() }
    const service = new ChannelAccessService(
      prisma as unknown as PrismaService,
      roles as unknown as RolesService,
      events as unknown as EventBusService
    )
    prisma.channel.findFirst.mockResolvedValue({ id: 'channel' })
    prisma.channelPermissionOverride.findMany.mockResolvedValue([])
    prisma.role.findMany.mockResolvedValue([])
    return { service, prisma, roles, events }
  }

  it('restricts inspection and saves to Manage Roles before reading or changing data', async () => {
    const { service, roles, prisma } = setup()
    roles.requirePermission.mockRejectedValue(new ForbiddenException())
    await expect(service.getContext('server', 'channel', 'actor')).rejects.toThrow(ForbiddenException)
    await expect(service.save('server', 'channel', 'actor', { overrides: [], expectedOverrides: [] })).rejects.toThrow(
      ForbiddenException
    )
    expect(roles.requirePermission).toHaveBeenCalledWith('server', 'actor', Permission.MANAGE_ROLES)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a channel from another server', async () => {
    const { service, prisma } = setup()
    prisma.channel.findFirst.mockResolvedValue(null)
    await expect(service.getContext('server', 'other-channel', 'actor')).rejects.toThrow(NotFoundException)
    expect(prisma.channel.findFirst).toHaveBeenCalledWith({
      where: { id: 'other-channel', serverId: 'server' },
      select: { id: true }
    })
  })

  it('loads every server member with minimal profile data and serializes permission bits', async () => {
    const { service, prisma } = setup()
    prisma.server.findUniqueOrThrow.mockResolvedValue({ ownerId: 'owner' })
    prisma.role.findMany.mockResolvedValue([{ id: everyone, permissions: view | send }])
    prisma.channelPermissionOverride.findMany.mockResolvedValue([{ roleId: everyone, allow: 0n, deny: view }])
    prisma.serverMember.findMany.mockResolvedValue([
      {
        userId: 'offline-member',
        displayName: 'Server name',
        roles: [{ roleId: team }],
        user: { username: 'member', displayName: 'Global name', avatarUrl: null }
      }
    ])
    const context = await service.getContext('server', 'channel', 'actor')
    expect(context.overrides).toEqual([{ roleId: everyone, allow: '0', deny: view.toString() }])
    expect(context.members[0]).toEqual({
      userId: 'offline-member',
      displayName: 'Server name',
      username: 'member',
      avatarUrl: null,
      roleIds: [team]
    })
    expect(prisma.serverMember.findMany.mock.calls[0][0].where).toEqual({ serverId: 'server' })
    expect(prisma.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'RepeatableRead' })
  })

  it.each([
    { overrides: [{ roleId: team, allow: 'not-a-number', deny: '0' }], expectedOverrides: [] },
    { overrides: [{ roleId: team, allow: '-1', deny: '0' }], expectedOverrides: [] },
    { overrides: [{ roleId: team, allow: '9223372036854775808', deny: '0' }], expectedOverrides: [] },
    {
      overrides: [
        { roleId: team, allow: '0', deny: '0' },
        { roleId: team, allow: '0', deny: '0' }
      ],
      expectedOverrides: []
    },
    { overrides: [] }
  ])('rejects invalid saves before starting a transaction: %j', async (body) => {
    const { service, prisma } = setup()
    await expect(service.save('server', 'channel', 'actor', body)).rejects.toThrow(BadRequestException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects stale drafts without mutation or an update event', async () => {
    const { service, prisma, events } = setup()
    prisma.channelPermissionOverride.findMany.mockResolvedValue([{ roleId: everyone, allow: view, deny: 0n }])
    await expect(service.save('server', 'channel', 'actor', { overrides: [], expectedOverrides: [] })).rejects.toThrow(
      ConflictException
    )
    expect(prisma.channelPermissionOverride.deleteMany).not.toHaveBeenCalled()
    expect(events.emit).not.toHaveBeenCalled()
  })

  it('rejects roles from another server before applying the replacement', async () => {
    const { service, prisma } = setup()
    await expect(
      service.save('server', 'channel', 'actor', {
        overrides: [{ roleId: team, allow: view.toString(), deny: '0' }],
        expectedOverrides: []
      })
    ).rejects.toThrow(BadRequestException)
    expect(prisma.channelPermissionOverride.deleteMany).not.toHaveBeenCalled()
  })

  it('replaces all rules in one serializable transaction, preserving other bits, then emits one event', async () => {
    const { service, prisma, events } = setup()
    const otherBit = Permission.MANAGE_MESSAGES
    prisma.role.findMany.mockResolvedValue([{ id: team }])
    const overrides = [{ roleId: team, allow: (view | otherBit).toString(), deny: send.toString() }]
    await service.save('server', 'channel', 'actor', { overrides, expectedOverrides: [] })
    expect(prisma.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' })
    expect(prisma.channelPermissionOverride.createMany).toHaveBeenCalledWith({
      data: [{ channelId: 'channel', roleId: team, allow: view | otherBit, deny: send }]
    })
    expect(events.emit).toHaveBeenCalledTimes(1)
    expect(events.emit).toHaveBeenCalledWith('channel:permissions:updated', {
      serverId: 'server',
      channelId: 'channel'
    })
  })

  it('does not emit success if the transaction fails', async () => {
    const { service, prisma, events } = setup()
    prisma.channelPermissionOverride.deleteMany.mockRejectedValue(new Error('Database unavailable'))
    await expect(service.save('server', 'channel', 'actor', { overrides: [], expectedOverrides: [] })).rejects.toThrow(
      'Database unavailable'
    )
    expect(events.emit).not.toHaveBeenCalled()
  })
})

describe('shared channel access explanations', () => {
  const context: ChannelAccessContext = {
    ownerId: 'owner',
    members: [],
    overrides: [],
    roles: [
      { id: everyone, name: '@everyone', permissions: (view | send).toString(), isDefault: true },
      { id: team, name: 'Team', permissions: '0', isDefault: false },
      { id: 'admin', name: 'Admin', permissions: Permission.ADMINISTRATOR.toString(), isDefault: false }
    ] as ChannelAccessContext['roles']
  }
  const member = { userId: 'member', username: 'member', displayName: null, avatarUrl: null, roleIds: [team] }
  const rules = [
    { roleId: everyone, allow: '0', deny: view.toString() },
    { roleId: team, allow: view.toString(), deny: send.toString() }
  ]

  it('includes the implicit everyone role and explains conflicting roles using the enforcement resolver', () => {
    const result = explainChannelAccess(context, member, rules)
    expect(result.status).toBe('readOnly')
    expect(result.view.allowedBy.map((role) => role.id)).toEqual([team])
    expect(result.view.deniedBy.map((role) => role.id)).toEqual([everyone])
    expect(explainChannelAccess(context, { ...member, roleIds: [] }, rules).status).toBe('hidden')
    expect(explainChannelAccess(context, member, []).status).toBe('readWrite')
  })

  it('always preserves owner/administrator access and never reports hidden members as able to send', () => {
    expect(explainChannelAccess(context, { ...member, userId: 'owner' }, rules).bypass).toBe('owner')
    expect(explainChannelAccess(context, { ...member, roleIds: ['admin'] }, rules).status).toBe('readWrite')
    expect(explainChannelAccess(context, { ...member, roleIds: [] }, rules).canSend).toBe(false)
    // Legacy/API-created rules can contain Administrator as well as the UI's view/send bits.
    expect(
      explainChannelAccess(context, member, [
        { roleId: team, allow: Permission.ADMINISTRATOR.toString(), deny: view.toString() }
      ]).bypass
    ).toBe('administrator')
  })

  it('distinguishes inherit from deny and preserves unedited/hidden bits', () => {
    const rule = { roleId: team, allow: Permission.MANAGE_MESSAGES.toString(), deny: send.toString() }
    expect(getChannelRuleState(rule, view)).toBe('inherit')
    expect(getChannelRuleState(rule, send)).toBe('deny')
    const next = setChannelRuleState(rule, view, 'allow')
    expect(next).toEqual({ roleId: team, allow: (view | Permission.MANAGE_MESSAGES).toString(), deny: send.toString() })
    expect(setChannelRuleState(next, view, 'inherit')).toEqual(rule)
    expect(canonicalChannelRules(rules)).toBe(canonicalChannelRules([...rules].reverse()))
  })
})
