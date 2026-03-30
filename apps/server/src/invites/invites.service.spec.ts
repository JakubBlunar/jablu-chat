import { Test, TestingModule } from '@nestjs/testing'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { InvitesService } from './invites.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { EventBusService } from '../events/event-bus.service'
import { AuditLogService } from '../servers/audit-log.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

describe('InvitesService', () => {
  let service: InvitesService
  let prisma: MockPrismaService
  let roles: { requirePermission: jest.Mock; getDefaultRoleId: jest.Mock }
  let events: { emit: jest.Mock }
  let auditLog: { log: jest.Mock }

  const serverId = 'server-1'
  const userId = 'user-1'

  beforeEach(async () => {
    prisma = createMockPrismaService()
    roles = {
      requirePermission: jest.fn().mockResolvedValue(0n),
      getDefaultRoleId: jest.fn().mockResolvedValue('default-role'),
    }
    events = { emit: jest.fn() }
    auditLog = { log: jest.fn().mockResolvedValue(undefined) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitesService,
        { provide: PrismaService, useValue: prisma },
        { provide: RolesService, useValue: roles },
        { provide: EventBusService, useValue: events },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile()

    service = module.get(InvitesService)
  })

  describe('createInvite', () => {
    it('creates an invite with a generated code', async () => {
      const invite = {
        id: 'inv-1',
        serverId,
        code: 'abcdefgh',
        maxUses: null,
        expiresAt: null,
        createdById: userId,
        server: { name: 'Test Server' },
      }
      prisma.invite.create.mockResolvedValue(invite)

      const result = await service.createInvite(serverId, userId)
      expect(result).toEqual(invite)
      expect(roles.requirePermission).toHaveBeenCalled()
      expect(auditLog.log).toHaveBeenCalled()
    })

    it('sets maxUses when provided', async () => {
      prisma.invite.create.mockResolvedValue({
        id: 'inv-1',
        maxUses: 10,
        expiresAt: null,
        server: { name: 'Test' },
      })

      await service.createInvite(serverId, userId, 10)
      const createCall = prisma.invite.create.mock.calls[0][0]
      expect(createCall.data.maxUses).toBe(10)
    })

    it('sets expiration when expiresInMinutes provided', async () => {
      prisma.invite.create.mockResolvedValue({
        id: 'inv-1',
        maxUses: null,
        expiresAt: new Date(),
        server: { name: 'Test' },
      })

      const before = Date.now()
      await service.createInvite(serverId, userId, undefined, 60)
      const createCall = prisma.invite.create.mock.calls[0][0]
      expect(createCall.data.expiresAt).toBeInstanceOf(Date)
      expect(createCall.data.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 59 * 60000)
    })

    it('retries on unique constraint violation', async () => {
      const { PrismaClientKnownRequestError } = jest.requireActual('@prisma/client/runtime/library') as any
      const uniqueError = new PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '6.0.0',
      })

      prisma.invite.create
        .mockRejectedValueOnce(uniqueError)
        .mockRejectedValueOnce(uniqueError)
        .mockResolvedValue({
          id: 'inv-1',
          code: 'thirdtry',
          server: { name: 'Test' },
        })

      const result = await service.createInvite(serverId, userId)
      expect(prisma.invite.create).toHaveBeenCalledTimes(3)
      expect(result).toBeDefined()
    })

    it('throws ConflictException after 20 failed attempts', async () => {
      const { PrismaClientKnownRequestError } = jest.requireActual('@prisma/client/runtime/library') as any
      const uniqueError = new PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '6.0.0',
      })
      prisma.invite.create.mockRejectedValue(uniqueError)

      await expect(
        service.createInvite(serverId, userId),
      ).rejects.toThrow(ConflictException)
      expect(prisma.invite.create).toHaveBeenCalledTimes(20)
    })
  })

  describe('getInvites', () => {
    it('returns all invites for a server', async () => {
      const invites = [
        { id: 'inv-1', code: 'abc', createdBy: { id: userId, username: 'user', email: 'u@e.com', avatarUrl: null } },
      ]
      prisma.invite.findMany.mockResolvedValue(invites)

      const result = await service.getInvites(serverId, userId)
      expect(result).toEqual(invites)
      expect(roles.requirePermission).toHaveBeenCalled()
    })
  })

  describe('deleteInvite', () => {
    it('deletes an invite and logs it', async () => {
      prisma.invite.findUnique.mockResolvedValue({ id: 'inv-1', serverId, code: 'abc123' })
      prisma.invite.delete.mockResolvedValue({})

      await service.deleteInvite('inv-1', userId)
      expect(prisma.invite.delete).toHaveBeenCalledWith({ where: { id: 'inv-1' } })
      expect(auditLog.log).toHaveBeenCalled()
    })

    it('throws NotFoundException when invite not found', async () => {
      prisma.invite.findUnique.mockResolvedValue(null)

      await expect(
        service.deleteInvite('missing', userId),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('resolveVanity', () => {
    it('returns server info with member count', async () => {
      prisma.server.findUnique.mockResolvedValue({
        id: serverId,
        name: 'Test Server',
        iconUrl: null,
        _count: { members: 42 },
      })

      const result = await service.resolveVanity('test')
      expect(result).toEqual({
        id: serverId,
        name: 'Test Server',
        iconUrl: null,
        memberCount: 42,
      })
    })

    it('throws NotFoundException when vanity code not found', async () => {
      prisma.server.findUnique.mockResolvedValue(null)

      await expect(service.resolveVanity('nope')).rejects.toThrow(NotFoundException)
    })
  })

  describe('joinVanity', () => {
    it('joins a server by vanity code', async () => {
      prisma.server.findUnique
        .mockResolvedValueOnce({ id: serverId }) // vanity lookup
        .mockResolvedValueOnce({ id: serverId, channels: [], members: [] }) // final return
      prisma.serverMember.findUnique.mockResolvedValue(null)
      prisma.serverMember.create.mockResolvedValue({
        userId,
        serverId,
        user: { id: userId, username: 'test', displayName: 'Test', avatarUrl: null, bio: null, status: 'online' },
      })

      const result = await service.joinVanity('test', userId)
      expect(prisma.serverMember.create).toHaveBeenCalled()
      expect(events.emit).toHaveBeenCalledWith('member:joined', expect.any(Object))
    })

    it('throws NotFoundException when vanity code not found', async () => {
      prisma.server.findUnique.mockResolvedValue(null)

      await expect(
        service.joinVanity('nonexistent', userId),
      ).rejects.toThrow(NotFoundException)
    })

    it('throws ConflictException when already a member', async () => {
      prisma.server.findUnique.mockResolvedValue({ id: serverId })
      prisma.serverMember.findUnique.mockResolvedValue({ userId, serverId })

      await expect(
        service.joinVanity('test', userId),
      ).rejects.toThrow(ConflictException)
    })
  })

  describe('useInvite', () => {
    const invite = {
      id: 'inv-1',
      code: 'abc123',
      serverId,
      expiresAt: null,
      maxUses: null,
      useCount: 0,
      server: { id: serverId, name: 'Test' },
    }

    it('joins server via invite code', async () => {
      prisma.invite.findUnique.mockResolvedValue(invite)
      prisma.serverMember.findUnique
        .mockResolvedValueOnce(null) // not already a member
        .mockResolvedValueOnce({ userId, serverId, user: { id: userId } }) // after join
      prisma.$transaction.mockResolvedValue(undefined)
      prisma.server.findUnique.mockResolvedValue({
        id: serverId,
        name: 'Test',
        channels: [],
        members: [],
      })

      const result = await service.useInvite('abc123', userId)
      expect(result).toBeDefined()
      expect(prisma.$transaction).toHaveBeenCalled()
      expect(events.emit).toHaveBeenCalledWith('member:joined', expect.any(Object))
    })

    it('throws NotFoundException for invalid invite code', async () => {
      prisma.invite.findUnique.mockResolvedValue(null)

      await expect(
        service.useInvite('invalid', userId),
      ).rejects.toThrow(NotFoundException)
    })

    it('throws ForbiddenException when invite is expired', async () => {
      prisma.invite.findUnique.mockResolvedValue({
        ...invite,
        expiresAt: new Date('2020-01-01'),
      })

      await expect(
        service.useInvite('abc123', userId),
      ).rejects.toThrow(ForbiddenException)
    })

    it('throws ForbiddenException when use limit reached', async () => {
      prisma.invite.findUnique.mockResolvedValue({
        ...invite,
        maxUses: 5,
        useCount: 5,
      })

      await expect(
        service.useInvite('abc123', userId),
      ).rejects.toThrow(ForbiddenException)
    })

    it('throws ConflictException when already a member', async () => {
      prisma.invite.findUnique.mockResolvedValue(invite)
      prisma.serverMember.findUnique.mockResolvedValue({ userId, serverId })

      await expect(
        service.useInvite('abc123', userId),
      ).rejects.toThrow(ConflictException)
    })
  })
})
