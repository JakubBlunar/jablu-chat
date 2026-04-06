import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common'
import {
  Permission,
  DANGEROUS_PERMISSIONS,
  DEFAULT_OWNER_PERMISSIONS,
  DEFAULT_EVERYONE_PERMISSIONS,
} from '@chat/shared'
import { RolesService } from './roles.service'
import { PrismaService } from '../prisma/prisma.service'
import { EventBusService } from '../events/event-bus.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

describe('RolesService', () => {
  let service: RolesService
  let prisma: MockPrismaService
  let events: { emit: jest.Mock }

  const serverId = 'server-1'
  const ownerId = 'owner-1'
  const userId = 'user-1'

  beforeEach(async () => {
    prisma = createMockPrismaService()
    events = { emit: jest.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventBusService, useValue: events },
      ],
    }).compile()

    service = module.get(RolesService)
  })

  describe('getMemberPermissions', () => {
    it('returns ALL permissions for server owner', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })

      const perms = await service.getMemberPermissions(serverId, ownerId)
      expect(perms).toBe(DEFAULT_OWNER_PERMISSIONS)
    })

    it('returns role permissions for regular member', async () => {
      const rolePerms = Permission.SEND_MESSAGES | Permission.MANAGE_MESSAGES
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'someone-else' })
      prisma.serverMember.findUnique.mockResolvedValue({
        roles: [{ role: { permissions: rolePerms } }],
      })
      prisma.role.findFirst.mockResolvedValue({ permissions: 0n })

      const perms = await service.getMemberPermissions(serverId, userId)
      expect(perms).toBe(rolePerms)
    })

    it('throws NotFoundException when server not found', async () => {
      prisma.server.findUnique.mockResolvedValue(null)

      await expect(
        service.getMemberPermissions('nonexistent', userId),
      ).rejects.toThrow(NotFoundException)
    })

    it('throws ForbiddenException when not a member', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'someone-else' })
      prisma.serverMember.findUnique.mockResolvedValue(null)

      await expect(
        service.getMemberPermissions(serverId, userId),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  describe('getChannelPermissions', () => {
    it('returns OWNER perms when member has ADMINISTRATOR', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'other' })
      prisma.serverMember.findUnique.mockResolvedValue({
        roles: [{ role: { permissions: Permission.ADMINISTRATOR } }],
      })
      prisma.role.findFirst.mockResolvedValue({ permissions: 0n })

      const perms = await service.getChannelPermissions(serverId, 'ch-1', userId)
      expect(perms).toBe(DEFAULT_OWNER_PERMISSIONS)
    })

    it('returns role perms when no channel override exists', async () => {
      const rolePerms = Permission.SEND_MESSAGES
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'other' })
      prisma.serverMember.findUnique.mockResolvedValue({
        roles: [{ role: { permissions: rolePerms } }],
      })
      prisma.role.findFirst.mockResolvedValue({ permissions: 0n, id: 'everyone-role' })
      prisma.serverMemberRole.findMany.mockResolvedValue([{ roleId: 'role-1' }])
      prisma.channelPermissionOverride.findMany.mockResolvedValue([])

      const perms = await service.getChannelPermissions(serverId, 'ch-1', userId)
      expect(perms).toBe(rolePerms)
    })

    it('applies channel override allow/deny', async () => {
      const rolePerms = Permission.SEND_MESSAGES
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'other' })
      prisma.serverMember.findUnique.mockResolvedValue({
        roles: [{ role: { permissions: rolePerms } }],
      })
      prisma.role.findFirst.mockResolvedValue({ permissions: 0n, id: 'everyone-role' })
      prisma.serverMemberRole.findMany.mockResolvedValue([{ roleId: 'role-1' }])
      prisma.channelPermissionOverride.findMany.mockResolvedValue([{
        allow: Permission.MANAGE_MESSAGES,
        deny: Permission.SEND_MESSAGES,
      }])

      const perms = await service.getChannelPermissions(serverId, 'ch-1', userId)
      expect(perms & Permission.MANAGE_MESSAGES).toBeTruthy()
      expect(perms & Permission.SEND_MESSAGES).toBeFalsy()
    })
  })

  describe('requirePermission', () => {
    it('does not throw when permission is present', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })

      await expect(
        service.requirePermission(serverId, ownerId, Permission.MANAGE_ROLES),
      ).resolves.toBeDefined()
    })

    it('throws ForbiddenException when permission is missing', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'other' })
      prisma.serverMember.findUnique.mockResolvedValue({
        roles: [{ role: { permissions: Permission.SEND_MESSAGES } }],
      })
      prisma.role.findFirst.mockResolvedValue({ permissions: 0n })

      await expect(
        service.requirePermission(serverId, userId, Permission.MANAGE_ROLES),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  describe('requireChannelPermission', () => {
    it('does not throw when channel permission is present', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'other' })
      prisma.serverMember.findUnique.mockResolvedValue({
        roles: [{ role: { permissions: Permission.SEND_MESSAGES } }],
      })
      prisma.role.findFirst.mockResolvedValue({ permissions: 0n, id: 'everyone-role' })
      prisma.serverMemberRole.findMany.mockResolvedValue([{ roleId: 'role-1' }])
      prisma.channelPermissionOverride.findMany.mockResolvedValue([])

      await expect(
        service.requireChannelPermission(serverId, 'ch-1', userId, Permission.SEND_MESSAGES),
      ).resolves.toBeDefined()
    })

    it('throws ForbiddenException when channel permission denied', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'other' })
      prisma.serverMember.findUnique.mockResolvedValue({
        roles: [{ role: { permissions: Permission.SEND_MESSAGES } }],
      })
      prisma.role.findFirst.mockResolvedValue({ permissions: 0n, id: 'everyone-role' })
      prisma.serverMemberRole.findMany.mockResolvedValue([{ roleId: 'role-1' }])
      prisma.channelPermissionOverride.findMany.mockResolvedValue([{
        allow: 0n,
        deny: Permission.SEND_MESSAGES,
      }])

      await expect(
        service.requireChannelPermission(serverId, 'ch-1', userId, Permission.SEND_MESSAGES),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  describe('createDefaultRoles', () => {
    it('creates owner and everyone roles', async () => {
      prisma.role.create
        .mockResolvedValueOnce({ id: 'owner-role' })
        .mockResolvedValueOnce({ id: 'everyone-role' })

      const result = await service.createDefaultRoles(serverId, ownerId)
      expect(result).toEqual({ ownerRoleId: 'owner-role', everyoneRoleId: 'everyone-role' })
      expect(prisma.role.create).toHaveBeenCalledTimes(2)

      const ownerCall = prisma.role.create.mock.calls[0][0]
      expect(ownerCall.data.name).toBe('Owner')
      expect(ownerCall.data.permissions).toBe(DEFAULT_OWNER_PERMISSIONS)

      const everyoneCall = prisma.role.create.mock.calls[1][0]
      expect(everyoneCall.data.name).toBe('@everyone')
      expect(everyoneCall.data.isDefault).toBe(true)
      expect(everyoneCall.data.permissions).toBe(DEFAULT_EVERYONE_PERMISSIONS)
    })
  })

  describe('getDefaultRoleId', () => {
    it('returns the default role id', async () => {
      prisma.role.findFirst.mockResolvedValue({ id: 'default-role-id' })

      const id = await service.getDefaultRoleId(serverId)
      expect(id).toBe('default-role-id')
    })

    it('throws NotFoundException when no default role', async () => {
      prisma.role.findFirst.mockResolvedValue(null)

      await expect(service.getDefaultRoleId(serverId)).rejects.toThrow(NotFoundException)
    })
  })

  describe('createRole', () => {
    beforeEach(() => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })
    })

    it('creates a role at position 1', async () => {
      const createdRole = {
        id: 'new-role', serverId, name: 'Moderator', color: '#ff0000', position: 1,
        permissions: DEFAULT_EVERYONE_PERMISSIONS, isDefault: false,
        selfAssignable: false, isAdmin: false, createdAt: new Date(),
      }
      prisma.role.create.mockResolvedValue(createdRole)
      prisma.role.findMany.mockResolvedValue([])

      const result = await service.createRole(serverId, ownerId, { name: 'Moderator', color: '#ff0000' })
      expect(result.name).toBe('Moderator')
      expect(result.permissions).toBe(DEFAULT_EVERYONE_PERMISSIONS.toString())
      expect(prisma.role.create.mock.calls[0][0].data.position).toBe(1)
    })

    it('throws ForbiddenException without MANAGE_ROLES', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'other' })
      prisma.serverMember.findUnique.mockResolvedValue({
        roles: [{ role: { permissions: Permission.SEND_MESSAGES } }],
      })
      prisma.role.findFirst.mockResolvedValue({ permissions: 0n })

      await expect(
        service.createRole(serverId, userId, { name: 'Test' }),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  describe('updateRole', () => {
    beforeEach(() => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })
    })

    it('updates role fields', async () => {
      prisma.role.findFirst.mockResolvedValue({
        id: 'role-1', serverId, position: 3, selfAssignable: false, permissions: 0n,
      })
      prisma.serverMemberRole.findMany.mockResolvedValue([
        { roleId: 'owner-role', role: { id: 'owner-role', position: 100 } },
      ])
      const updated = {
        id: 'role-1', serverId, name: 'Updated', color: '#00ff00', position: 3,
        permissions: Permission.SEND_MESSAGES | Permission.MANAGE_MESSAGES,
        isDefault: false, selfAssignable: false, isAdmin: false, createdAt: new Date(),
      }
      prisma.role.update.mockResolvedValue(updated)

      const result = await service.updateRole(serverId, 'role-1', ownerId, {
        name: 'Updated',
        color: '#00ff00',
      })
      expect(result.name).toBe('Updated')
    })

    it('throws NotFoundException when role not found', async () => {
      prisma.role.findFirst.mockResolvedValue(null)

      await expect(
        service.updateRole(serverId, 'missing', ownerId, { name: 'Test' }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('deleteRole', () => {
    beforeEach(() => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })
      prisma.role.findFirst.mockResolvedValue({ id: 'role-to-delete', serverId, isDefault: false })
      prisma.$transaction.mockResolvedValue(undefined)
    })

    it('deletes role and reassigns members to default', async () => {
      prisma.role.findFirst.mockResolvedValueOnce({
        id: 'role-to-delete', serverId, isDefault: false, position: 3,
      })
      prisma.serverMemberRole.findMany
        .mockResolvedValueOnce([
          { roleId: 'owner-role', role: { id: 'owner-role', position: 100 } },
        ])
        .mockResolvedValueOnce([])

      await service.deleteRole(serverId, 'role-to-delete', ownerId)
      expect(prisma.$transaction).toHaveBeenCalled()
    })

    it('throws BadRequestException when trying to delete the default role', async () => {
      prisma.role.findFirst.mockResolvedValue({ id: 'default-role', serverId, isDefault: true })

      await expect(
        service.deleteRole(serverId, 'default-role', ownerId),
      ).rejects.toThrow(BadRequestException)
    })

    it('throws NotFoundException when role not found', async () => {
      prisma.role.findFirst.mockResolvedValue(null)

      await expect(
        service.deleteRole(serverId, 'missing', ownerId),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('reorderRoles', () => {
    beforeEach(() => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })
      prisma.$transaction.mockResolvedValue(undefined)
    })

    it('reorders roles by updating positions', async () => {
      prisma.role.findMany
        .mockResolvedValueOnce([
          { id: 'r1', position: 5, isDefault: false },
          { id: 'r2', position: 3, isDefault: false },
          { id: 'r3', position: 1, isDefault: false },
        ])
        .mockResolvedValueOnce([
          { id: 'r1', serverId, name: 'R1', color: null, position: 3, permissions: 0n, isDefault: false, selfAssignable: false, isAdmin: false, createdAt: new Date() },
          { id: 'r2', serverId, name: 'R2', color: null, position: 2, permissions: 0n, isDefault: false, selfAssignable: false, isAdmin: false, createdAt: new Date() },
          { id: 'r3', serverId, name: 'R3', color: null, position: 1, permissions: 0n, isDefault: false, selfAssignable: false, isAdmin: false, createdAt: new Date() },
        ])
      prisma.serverMemberRole.findMany.mockResolvedValueOnce([
        { roleId: 'owner-role', role: { id: 'owner-role', position: 100 } },
      ])

      await service.reorderRoles(serverId, ownerId, ['r1', 'r2', 'r3'])
      expect(prisma.$transaction).toHaveBeenCalled()
    })

    it('throws BadRequestException when role IDs mismatch', async () => {
      prisma.role.findMany.mockResolvedValue([{ id: 'r1' }])

      await expect(
        service.reorderRoles(serverId, ownerId, ['r1', 'r2']),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('requireMembership', () => {
    it('returns server and membership when valid', async () => {
      const server = { id: serverId, ownerId }
      const membership = { userId, serverId }
      prisma.server.findUnique.mockResolvedValue(server)
      prisma.serverMember.findUnique.mockResolvedValue(membership)

      const result = await service.requireMembership(serverId, userId)
      expect(result).toEqual({ server, membership })
    })

    it('throws NotFoundException when server not found', async () => {
      prisma.server.findUnique.mockResolvedValue(null)

      await expect(
        service.requireMembership('missing', userId),
      ).rejects.toThrow(NotFoundException)
    })

    it('throws ForbiddenException when not a member', async () => {
      prisma.server.findUnique.mockResolvedValue({ id: serverId })
      prisma.serverMember.findUnique.mockResolvedValue(null)

      await expect(
        service.requireMembership(serverId, userId),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  describe('upsertChannelOverride', () => {
    beforeEach(() => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })
    })

    it('creates override and emits event', async () => {
      prisma.channel.findFirst.mockResolvedValue({ id: 'ch-1', serverId })
      prisma.role.findFirst.mockResolvedValue({ id: 'role-1', serverId })
      prisma.channelPermissionOverride.upsert.mockResolvedValue({
        id: 'ov-1',
        channelId: 'ch-1',
        roleId: 'role-1',
        allow: 64n,
        deny: 0n,
      })

      const result = await service.upsertChannelOverride(serverId, 'ch-1', 'role-1', ownerId, '64', '0')
      expect(result.allow).toBe('64')
      expect(result.deny).toBe('0')
      expect(events.emit).toHaveBeenCalledWith('channel:permissions:updated', {
        serverId, channelId: 'ch-1', roleId: 'role-1',
      })
    })

    it('throws NotFoundException when channel not found', async () => {
      prisma.channel.findFirst.mockResolvedValue(null)

      await expect(
        service.upsertChannelOverride(serverId, 'missing', 'role-1', ownerId, '64', '0'),
      ).rejects.toThrow(NotFoundException)
    })
  })

  // ──────────────── Security guard tests ────────────────

  describe('getOwnerRoleId', () => {
    it('returns the roleId of the owner\'s highest-position role', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })
      prisma.serverMemberRole.findMany.mockResolvedValue([
        { roleId: 'owner-role', role: { id: 'owner-role', position: 100 } },
        { roleId: 'role-low', role: { id: 'role-low', position: 2 } },
      ])

      const result = await service.getOwnerRoleId(serverId)
      expect(result).toBe('owner-role')
    })

    it('returns null when server does not exist', async () => {
      prisma.server.findUnique.mockResolvedValue(null)

      const result = await service.getOwnerRoleId(serverId)
      expect(result).toBeNull()
    })

    it('returns null when owner has no assigned roles', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })
      prisma.serverMemberRole.findMany.mockResolvedValue([])

      const result = await service.getOwnerRoleId(serverId)
      expect(result).toBeNull()
    })
  })

  describe('getActorTopPosition', () => {
    it('returns the maximum position among assigned roles', async () => {
      prisma.serverMemberRole.findMany.mockResolvedValue([
        { role: { position: 3 } },
        { role: { position: 7 } },
        { role: { position: 1 } },
      ])

      const pos = await service.getActorTopPosition(serverId, userId)
      expect(pos).toBe(7)
    })

    it('returns 0 when actor has no assigned roles', async () => {
      prisma.serverMemberRole.findMany.mockResolvedValue([])

      const pos = await service.getActorTopPosition(serverId, userId)
      expect(pos).toBe(0)
    })
  })

  describe('createRole - security', () => {
    const ACTOR_PERMS = Permission.MANAGE_ROLES | Permission.SEND_MESSAGES | Permission.VIEW_CHANNEL

    it('non-owner cannot grant permissions above their own', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'someone-else' })
      prisma.serverMember.findUnique.mockResolvedValue({
        roles: [{ role: { permissions: ACTOR_PERMS } }],
      })
      prisma.role.findFirst.mockResolvedValueOnce({ permissions: 0n })

      await expect(
        service.createRole(serverId, userId, {
          name: 'Hacker',
          permissions: Permission.ADMINISTRATOR.toString(),
        }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('non-owner with ADMINISTRATOR can grant any permissions', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'someone-else' })
      prisma.serverMember.findUnique.mockResolvedValue({
        roles: [{ role: { permissions: Permission.ADMINISTRATOR } }],
      })
      prisma.role.findFirst.mockResolvedValueOnce({ permissions: 0n })

      const createdRole = {
        id: 'new-role', serverId, name: 'Admin2', color: null, position: 1,
        permissions: Permission.ADMINISTRATOR, isDefault: false,
        selfAssignable: false, isAdmin: false, createdAt: new Date(),
      }
      prisma.role.create.mockResolvedValue(createdRole)
      prisma.role.findMany.mockResolvedValue([])

      const result = await service.createRole(serverId, userId, {
        name: 'Admin2',
        permissions: Permission.ADMINISTRATOR.toString(),
      })
      expect(result.name).toBe('Admin2')
    })

    it('inserts new role at position 1 and shifts existing roles', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })

      const createdRole = {
        id: 'new-role', serverId, name: 'Test', color: null, position: 1,
        permissions: DEFAULT_EVERYONE_PERMISSIONS, isDefault: false,
        selfAssignable: false, isAdmin: false, createdAt: new Date(),
      }
      prisma.role.create.mockResolvedValue(createdRole)
      prisma.role.findMany.mockResolvedValue([])

      await service.createRole(serverId, ownerId, { name: 'Test' })

      expect(prisma.role.updateMany).toHaveBeenCalledWith({
        where: { serverId, isDefault: false, position: { gte: 1 } },
        data: { position: { increment: 1 } },
      })
      expect(prisma.role.create.mock.calls[0][0].data.position).toBe(1)
    })
  })

  describe('updateRole - security', () => {
    const ACTOR_PERMS = Permission.MANAGE_ROLES | Permission.SEND_MESSAGES | Permission.VIEW_CHANNEL

    function mockNonOwnerForUpdate(targetRole: any, actorTopPos: number) {
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'someone-else' })
      prisma.serverMember.findUnique.mockResolvedValue({
        roles: [{ role: { permissions: ACTOR_PERMS } }],
      })
      prisma.role.findFirst
        .mockResolvedValueOnce({ permissions: 0n })
        .mockResolvedValueOnce(targetRole)
      prisma.serverMemberRole.findMany.mockResolvedValueOnce([
        { role: { position: actorTopPos } },
      ])
    }

    it('non-owner cannot edit a role at or above their position', async () => {
      mockNonOwnerForUpdate(
        { id: 'high-role', serverId, position: 8, selfAssignable: false, permissions: 0n },
        5,
      )

      await expect(
        service.updateRole(serverId, 'high-role', userId, { name: 'Renamed' }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('non-owner cannot promote a role to or above their position', async () => {
      mockNonOwnerForUpdate(
        { id: 'low-role', serverId, position: 2, selfAssignable: false, permissions: 0n },
        5,
      )

      await expect(
        service.updateRole(serverId, 'low-role', userId, { position: 5 }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('non-owner cannot modify the Owner role', async () => {
      mockNonOwnerForUpdate(
        { id: 'owner-role', serverId, position: 3, selfAssignable: false, permissions: 0n },
        5,
      )
      prisma.serverMemberRole.findMany.mockResolvedValueOnce([
        { roleId: 'owner-role', role: { id: 'owner-role', position: 100 } },
      ])

      await expect(
        service.updateRole(serverId, 'owner-role', userId, { name: 'Renamed' }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('non-owner cannot grant permissions they do not have', async () => {
      mockNonOwnerForUpdate(
        { id: 'low-role', serverId, position: 2, selfAssignable: false, permissions: 0n },
        5,
      )
      prisma.serverMemberRole.findMany.mockResolvedValueOnce([
        { roleId: 'other-role', role: { id: 'other-role', position: 100 } },
      ])

      await expect(
        service.updateRole(serverId, 'low-role', userId, {
          permissions: Permission.ADMINISTRATOR.toString(),
        }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('rejects making a role selfAssignable when it has dangerous permissions', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })
      prisma.role.findFirst.mockResolvedValueOnce({
        id: 'admin-role', serverId, position: 50,
        selfAssignable: false, permissions: Permission.ADMINISTRATOR,
      })
      prisma.serverMemberRole.findMany.mockResolvedValueOnce([
        { roleId: 'owner-role', role: { id: 'owner-role', position: 100 } },
      ])

      await expect(
        service.updateRole(serverId, 'admin-role', ownerId, { selfAssignable: true }),
      ).rejects.toThrow(BadRequestException)
    })

    it('rejects granting dangerous permissions to a selfAssignable role', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })
      prisma.role.findFirst.mockResolvedValueOnce({
        id: 'self-role', serverId, position: 50,
        selfAssignable: true, permissions: Permission.SEND_MESSAGES,
      })
      prisma.serverMemberRole.findMany.mockResolvedValueOnce([
        { roleId: 'owner-role', role: { id: 'owner-role', position: 100 } },
      ])

      await expect(
        service.updateRole(serverId, 'self-role', ownerId, {
          permissions: Permission.ADMINISTRATOR.toString(),
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('owner can edit the Owner role', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })
      prisma.role.findFirst.mockResolvedValueOnce({
        id: 'owner-role', serverId, position: 100,
        selfAssignable: false, permissions: DEFAULT_OWNER_PERMISSIONS,
      })
      prisma.serverMemberRole.findMany.mockResolvedValueOnce([
        { roleId: 'owner-role', role: { id: 'owner-role', position: 100 } },
      ])

      const updated = {
        id: 'owner-role', serverId, name: 'Super Owner', color: '#gold',
        position: 100, permissions: DEFAULT_OWNER_PERMISSIONS, isDefault: false,
        selfAssignable: false, isAdmin: true, createdAt: new Date(),
      }
      prisma.role.update.mockResolvedValue(updated)

      const result = await service.updateRole(serverId, 'owner-role', ownerId, {
        name: 'Super Owner',
      })
      expect(result.name).toBe('Super Owner')
    })
  })

  describe('deleteRole - security', () => {
    const ACTOR_PERMS = Permission.MANAGE_ROLES | Permission.SEND_MESSAGES | Permission.VIEW_CHANNEL

    it('non-owner cannot delete a role at or above their position', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'someone-else' })
      prisma.serverMember.findUnique.mockResolvedValue({
        roles: [{ role: { permissions: ACTOR_PERMS } }],
      })
      prisma.role.findFirst
        .mockResolvedValueOnce({ permissions: 0n })
        .mockResolvedValueOnce({ id: 'high-role', serverId, position: 8, isDefault: false })
      prisma.serverMemberRole.findMany.mockResolvedValueOnce([
        { role: { position: 5 } },
      ])

      await expect(
        service.deleteRole(serverId, 'high-role', userId),
      ).rejects.toThrow(ForbiddenException)
    })

    it('non-owner cannot delete the Owner role', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'someone-else' })
      prisma.serverMember.findUnique.mockResolvedValue({
        roles: [{ role: { permissions: ACTOR_PERMS } }],
      })
      prisma.role.findFirst
        .mockResolvedValueOnce({ permissions: 0n })
        .mockResolvedValueOnce({ id: 'owner-role', serverId, position: 3, isDefault: false })
      prisma.serverMemberRole.findMany
        .mockResolvedValueOnce([{ role: { position: 5 } }])
        .mockResolvedValueOnce([
          { roleId: 'owner-role', role: { id: 'owner-role', position: 100 } },
        ])

      await expect(
        service.deleteRole(serverId, 'owner-role', userId),
      ).rejects.toThrow(ForbiddenException)
    })

    it('owner can delete any non-default role', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })
      prisma.role.findFirst.mockResolvedValueOnce({
        id: 'some-role', serverId, position: 50, isDefault: false,
      })
      prisma.serverMemberRole.findMany
        .mockResolvedValueOnce([
          { roleId: 'owner-role', role: { id: 'owner-role', position: 100 } },
        ])
        .mockResolvedValueOnce([])
      prisma.$transaction.mockResolvedValue(undefined)

      await service.deleteRole(serverId, 'some-role', ownerId)
      expect(prisma.$transaction).toHaveBeenCalled()
      expect(events.emit).toHaveBeenCalledWith('role:deleted', {
        serverId,
        roleId: 'some-role',
      })
    })
  })

  describe('reorderRoles - security', () => {
    const ACTOR_PERMS = Permission.MANAGE_ROLES | Permission.SEND_MESSAGES | Permission.VIEW_CHANNEL

    it('non-owner cannot reorder roles at or above their position', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'someone-else' })
      prisma.serverMember.findUnique.mockResolvedValue({
        roles: [{ role: { permissions: ACTOR_PERMS } }],
      })
      prisma.role.findFirst.mockResolvedValueOnce({ permissions: 0n })
      prisma.role.findMany.mockResolvedValueOnce([
        { id: 'r1', position: 8, isDefault: false },
        { id: 'r2', position: 2, isDefault: false },
      ])
      prisma.serverMemberRole.findMany
        .mockResolvedValueOnce([
          { roleId: 'owner-role', role: { id: 'owner-role', position: 100 } },
        ])
        .mockResolvedValueOnce([{ role: { position: 5 } }])

      await expect(
        service.reorderRoles(serverId, userId, ['r1', 'r2']),
      ).rejects.toThrow(ForbiddenException)
    })

    it('non-owner cannot include the Owner role in a reorder', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'someone-else' })
      prisma.serverMember.findUnique.mockResolvedValue({
        roles: [{ role: { permissions: ACTOR_PERMS } }],
      })
      prisma.role.findFirst.mockResolvedValueOnce({ permissions: 0n })
      prisma.role.findMany.mockResolvedValueOnce([
        { id: 'owner-role', position: 3, isDefault: false },
        { id: 'r2', position: 2, isDefault: false },
      ])
      prisma.serverMemberRole.findMany
        .mockResolvedValueOnce([
          { roleId: 'owner-role', role: { id: 'owner-role', position: 100 } },
        ])
        .mockResolvedValueOnce([{ role: { position: 5 } }])

      await expect(
        service.reorderRoles(serverId, userId, ['owner-role', 'r2']),
      ).rejects.toThrow(ForbiddenException)
    })

    it('owner can reorder any roles', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })
      prisma.role.findMany
        .mockResolvedValueOnce([
          { id: 'r1', position: 5, isDefault: false },
          { id: 'r2', position: 3, isDefault: false },
        ])
        .mockResolvedValueOnce([
          {
            id: 'r2', serverId, name: 'R2', color: null, position: 2,
            permissions: 0n, isDefault: false, selfAssignable: false,
            isAdmin: false, createdAt: new Date(),
          },
          {
            id: 'r1', serverId, name: 'R1', color: null, position: 1,
            permissions: 0n, isDefault: false, selfAssignable: false,
            isAdmin: false, createdAt: new Date(),
          },
        ])
      prisma.serverMemberRole.findMany.mockResolvedValueOnce([
        { roleId: 'owner-role', role: { id: 'owner-role', position: 100 } },
      ])
      prisma.$transaction.mockResolvedValue(undefined)

      await service.reorderRoles(serverId, ownerId, ['r1', 'r2'])
      expect(prisma.$transaction).toHaveBeenCalled()
      expect(events.emit).toHaveBeenCalledWith(
        'roles:reordered',
        expect.objectContaining({ serverId }),
      )
    })
  })

  describe('getVisibleChannelIdsForServers', () => {
    it('returns empty map for empty server list', async () => {
      const m = await service.getVisibleChannelIdsForServers(userId, [])
      expect(m.size).toBe(0)
      expect(prisma.server.findMany).not.toHaveBeenCalled()
    })

    it('returns all channel ids for server owner', async () => {
      prisma.server.findMany.mockResolvedValue([{ id: serverId, ownerId: userId }])
      prisma.channel.findMany.mockResolvedValue([
        { id: 'ch-a', serverId },
        { id: 'ch-b', serverId },
      ])
      prisma.serverMember.findMany.mockResolvedValue([])
      prisma.role.findMany.mockResolvedValue([])

      const m = await service.getVisibleChannelIdsForServers(userId, [serverId])
      expect(m.get(serverId)).toEqual(expect.arrayContaining(['ch-a', 'ch-b']))
      expect(m.get(serverId)).toHaveLength(2)
      expect(prisma.channelPermissionOverride.findMany).not.toHaveBeenCalled()
    })

    it('returns all channel ids for member with ADMINISTRATOR', async () => {
      prisma.server.findMany.mockResolvedValue([{ id: serverId, ownerId: 'other' }])
      prisma.channel.findMany.mockResolvedValue([
        { id: 'c1', serverId },
        { id: 'c2', serverId },
      ])
      prisma.serverMember.findMany.mockResolvedValue([
        {
          serverId,
          roles: [{ role: { permissions: Permission.ADMINISTRATOR } }],
        },
      ])
      prisma.role.findMany.mockResolvedValue([])

      const m = await service.getVisibleChannelIdsForServers(userId, [serverId])
      expect(m.get(serverId)).toEqual(expect.arrayContaining(['c1', 'c2']))
      expect(m.get(serverId)).toHaveLength(2)
      expect(prisma.channelPermissionOverride.findMany).not.toHaveBeenCalled()
    })
  })
})
