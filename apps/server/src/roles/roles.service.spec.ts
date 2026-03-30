import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common'
import {
  Permission,
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
        role: { permissions: rolePerms },
      })

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
        role: { permissions: Permission.ADMINISTRATOR },
        roleId: 'admin-role',
      })

      const perms = await service.getChannelPermissions(serverId, 'ch-1', userId)
      expect(perms).toBe(DEFAULT_OWNER_PERMISSIONS)
    })

    it('returns role perms when no channel override exists', async () => {
      const rolePerms = Permission.SEND_MESSAGES
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'other' })
      prisma.serverMember.findUnique.mockResolvedValue({
        role: { permissions: rolePerms },
        roleId: 'role-1',
      })
      prisma.channelPermissionOverride.findUnique.mockResolvedValue(null)

      const perms = await service.getChannelPermissions(serverId, 'ch-1', userId)
      expect(perms).toBe(rolePerms)
    })

    it('applies channel override allow/deny', async () => {
      const rolePerms = Permission.SEND_MESSAGES
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'other' })
      prisma.serverMember.findUnique.mockResolvedValue({
        role: { permissions: rolePerms },
        roleId: 'role-1',
      })
      prisma.channelPermissionOverride.findUnique.mockResolvedValue({
        allow: Permission.MANAGE_MESSAGES,
        deny: Permission.SEND_MESSAGES,
      })

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
        role: { permissions: Permission.SEND_MESSAGES },
      })

      await expect(
        service.requirePermission(serverId, userId, Permission.MANAGE_ROLES),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  describe('requireChannelPermission', () => {
    it('does not throw when channel permission is present', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'other' })
      prisma.serverMember.findUnique.mockResolvedValue({
        role: { permissions: Permission.SEND_MESSAGES },
        roleId: 'role-1',
      })
      prisma.channelPermissionOverride.findUnique.mockResolvedValue(null)

      await expect(
        service.requireChannelPermission(serverId, 'ch-1', userId, Permission.SEND_MESSAGES),
      ).resolves.toBeDefined()
    })

    it('throws ForbiddenException when channel permission denied', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'other' })
      prisma.serverMember.findUnique.mockResolvedValue({
        role: { permissions: Permission.SEND_MESSAGES },
        roleId: 'role-1',
      })
      prisma.channelPermissionOverride.findUnique.mockResolvedValue({
        allow: 0n,
        deny: Permission.SEND_MESSAGES,
      })

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
      prisma.role.aggregate.mockResolvedValue({ _max: { position: 5 } })
    })

    it('creates a role with the next position', async () => {
      const createdRole = {
        id: 'new-role',
        serverId,
        name: 'Moderator',
        color: '#ff0000',
        position: 6,
        permissions: DEFAULT_EVERYONE_PERMISSIONS,
        isDefault: false,
        createdAt: new Date(),
      }
      prisma.role.create.mockResolvedValue(createdRole)

      const result = await service.createRole(serverId, ownerId, { name: 'Moderator', color: '#ff0000' })
      expect(result.name).toBe('Moderator')
      expect(result.permissions).toBe(DEFAULT_EVERYONE_PERMISSIONS.toString())
      expect(prisma.role.create.mock.calls[0][0].data.position).toBe(6)
    })

    it('throws ForbiddenException without MANAGE_ROLES', async () => {
      prisma.server.findUnique.mockResolvedValue({ ownerId: 'other' })
      prisma.serverMember.findUnique.mockResolvedValue({
        role: { permissions: Permission.SEND_MESSAGES },
      })

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
      prisma.role.findFirst.mockResolvedValue({ id: 'role-1', serverId })
      const updated = {
        id: 'role-1',
        serverId,
        name: 'Updated',
        color: '#00ff00',
        position: 3,
        permissions: Permission.SEND_MESSAGES | Permission.MANAGE_MESSAGES,
        isDefault: false,
        createdAt: new Date(),
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
      prisma.role.findFirst
        .mockResolvedValueOnce({ id: 'role-to-delete', serverId, isDefault: false })
        .mockResolvedValueOnce({ id: 'default-role' }) // getDefaultRoleId

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

  describe('assignRole', () => {
    beforeEach(() => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })
    })

    it('assigns role to member', async () => {
      prisma.role.findFirst.mockResolvedValue({ id: 'role-1', serverId })
      prisma.serverMember.findUnique.mockResolvedValue({ userId, serverId })
      prisma.serverMember.update.mockResolvedValue({ userId, serverId, roleId: 'role-1' })

      const result = await service.assignRole(serverId, userId, 'role-1', ownerId)
      expect(prisma.serverMember.update).toHaveBeenCalled()
    })

    it('throws NotFoundException when role not found', async () => {
      prisma.role.findFirst.mockResolvedValue(null)

      await expect(
        service.assignRole(serverId, userId, 'missing-role', ownerId),
      ).rejects.toThrow(NotFoundException)
    })

    it('throws NotFoundException when member not found', async () => {
      prisma.role.findFirst.mockResolvedValue({ id: 'role-1', serverId })
      prisma.serverMember.findUnique.mockResolvedValue(null)

      await expect(
        service.assignRole(serverId, 'nonmember', 'role-1', ownerId),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('reorderRoles', () => {
    beforeEach(() => {
      prisma.server.findUnique.mockResolvedValue({ ownerId })
      prisma.$transaction.mockResolvedValue(undefined)
    })

    it('reorders roles by updating positions', async () => {
      prisma.role.findMany.mockResolvedValue([
        { id: 'r1' }, { id: 'r2' }, { id: 'r3' },
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
})
