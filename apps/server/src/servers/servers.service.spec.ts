import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '../prisma-client'
import { ServersService } from './servers.service'
import { PrismaService } from '../prisma/prisma.service'
import { EventBusService } from '../events/event-bus.service'
import { UploadsService } from '../uploads/uploads.service'
import { AuditLogService } from './audit-log.service'
import { RolesService } from '../roles/roles.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

describe('ServersService', () => {
  let service: ServersService
  let prisma: MockPrismaService
  let events: { emit: jest.Mock }
  let uploads: { deleteFile: jest.Mock; saveAvatar: jest.Mock; saveEmoji: jest.Mock }
  let auditLog: { log: jest.Mock }
  let roles: {
    requirePermission: jest.Mock
    createDefaultRoles: jest.Mock
    getAllChannelPermissions: jest.Mock
    getActorTopPosition: jest.Mock
    getOwnerRoleId: jest.Mock
    loadMemberRolesWire: jest.Mock
  }

  const serverId = 'server-1'
  const userId = 'user-1'
  const server = { id: serverId, ownerId: userId, name: 'Test', iconUrl: null, vanityCode: null }

  beforeEach(async () => {
    prisma = createMockPrismaService()
    events = { emit: jest.fn() }
    uploads = { deleteFile: jest.fn(), saveAvatar: jest.fn(), saveEmoji: jest.fn() }
    auditLog = { log: jest.fn().mockResolvedValue(undefined) }
    roles = {
      requirePermission: jest.fn().mockResolvedValue(0n),
      createDefaultRoles: jest.fn().mockResolvedValue({ ownerRoleId: 'role-owner' }),
      getAllChannelPermissions: jest.fn().mockResolvedValue({}),
      getActorTopPosition: jest.fn().mockResolvedValue(100),
      getOwnerRoleId: jest.fn().mockResolvedValue('role-owner'),
      loadMemberRolesWire: jest.fn().mockResolvedValue([]),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServersService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventBusService, useValue: events },
        { provide: UploadsService, useValue: uploads },
        { provide: AuditLogService, useValue: auditLog },
        { provide: RolesService, useValue: roles },
      ],
    }).compile()

    service = module.get(ServersService)
  })

  describe('createServer', () => {
    it('creates a server with default channels and owner role', async () => {
      prisma.server.create.mockResolvedValue({ id: 'srv-new' })
      prisma.serverMember.create.mockResolvedValue({})
      prisma.serverMemberRole.create.mockResolvedValue({})
      prisma.server.findUnique.mockResolvedValue({ id: 'srv-new', name: 'My Server' })

      const result = await service.createServer(userId, 'My Server')

      expect(prisma.server.create).toHaveBeenCalled()
      expect(roles.createDefaultRoles).toHaveBeenCalledWith('srv-new', userId)
      expect(result.name).toBe('My Server')
    })
  })

  describe('updateServer', () => {
    it('validates vanity code format', async () => {
      await expect(service.updateServer(serverId, userId, { vanityCode: 'AB' }))
        .rejects.toThrow(BadRequestException)
    })

    it('accepts valid vanity code', async () => {
      prisma.server.update.mockResolvedValue({ ...server, vanityCode: 'cool-server' })
      await service.updateServer(serverId, userId, { vanityCode: 'cool-server' })
      expect(prisma.server.update).toHaveBeenCalled()
    })

    it('returns unchanged server when no data provided', async () => {
      prisma.server.findFirst.mockResolvedValue({
        ...server,
        channels: [{ id: 'ch-1', type: 'text' }],
        categories: [],
        roles: [],
        members: [],
      })
      await service.updateServer(serverId, userId, {})
      expect(prisma.server.update).not.toHaveBeenCalled()
    })

    it('throws ConflictException on vanity code collision (P2002)', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: '6.0.0',
      })
      prisma.server.update.mockRejectedValue(error)

      await expect(service.updateServer(serverId, userId, { vanityCode: 'taken' }))
        .rejects.toThrow(ConflictException)
    })

    it('validates welcome channel is a text channel', async () => {
      prisma.channel.findFirst.mockResolvedValue(null)
      await expect(service.updateServer(serverId, userId, { welcomeChannelId: 'ch-voice' }))
        .rejects.toThrow(BadRequestException)
    })

    it('validates AFK channel is a voice channel', async () => {
      prisma.channel.findFirst.mockResolvedValue(null)
      await expect(service.updateServer(serverId, userId, { afkChannelId: 'ch-text' }))
        .rejects.toThrow(BadRequestException)
    })
  })

  describe('kickMember', () => {
    it('kicks a member and emits event', async () => {
      prisma.server.findUnique.mockResolvedValue(server)
      prisma.serverMember.findUnique.mockResolvedValue({ userId: 'target' })
      prisma.messageBookmark.deleteMany.mockResolvedValue({})
      prisma.serverMember.delete.mockResolvedValue({})

      await service.kickMember(serverId, userId, 'target')

      expect(events.emit).toHaveBeenCalledWith('member:removed', { serverId, userId: 'target' })
    })

    it('cannot kick the server owner', async () => {
      prisma.server.findUnique.mockResolvedValue(server)
      await expect(service.kickMember(serverId, 'other-admin', userId))
        .rejects.toThrow(ForbiddenException)
    })

    it('cannot kick yourself', async () => {
      prisma.server.findUnique.mockResolvedValue(server)
      await expect(service.kickMember(serverId, userId, userId))
        .rejects.toThrow(ForbiddenException)
    })

    it('throws NotFoundException for non-member target', async () => {
      prisma.server.findUnique.mockResolvedValue(server)
      prisma.serverMember.findUnique.mockResolvedValue(null)
      await expect(service.kickMember(serverId, userId, 'ghost'))
        .rejects.toThrow(NotFoundException)
    })
  })

  describe('banMember', () => {
    it('bans a member with reason', async () => {
      prisma.server.findUnique.mockResolvedValue(server)
      prisma.serverBan.findUnique.mockResolvedValue(null)
      prisma.$transaction.mockResolvedValue(undefined)

      await service.banMember(serverId, userId, 'target', 'spamming')

      expect(events.emit).toHaveBeenCalledWith('member:removed', { serverId, userId: 'target' })
    })

    it('cannot ban the server owner', async () => {
      prisma.server.findUnique.mockResolvedValue(server)
      await expect(service.banMember(serverId, 'other', userId))
        .rejects.toThrow(ForbiddenException)
    })

    it('throws when user is already banned', async () => {
      prisma.server.findUnique.mockResolvedValue(server)
      prisma.serverBan.findUnique.mockResolvedValue({ id: 'ban-1' })
      await expect(service.banMember(serverId, userId, 'target'))
        .rejects.toThrow(BadRequestException)
    })
  })

  describe('unbanMember', () => {
    it('removes the ban', async () => {
      prisma.serverBan.findUnique.mockResolvedValue({ id: 'ban-1' })
      prisma.serverBan.delete.mockResolvedValue({})

      await service.unbanMember(serverId, userId, 'target')
      expect(prisma.serverBan.delete).toHaveBeenCalledWith({ where: { id: 'ban-1' } })
    })

    it('throws NotFoundException when no ban exists', async () => {
      prisma.serverBan.findUnique.mockResolvedValue(null)
      await expect(service.unbanMember(serverId, userId, 'target'))
        .rejects.toThrow(NotFoundException)
    })
  })

  describe('joinServer', () => {
    it('creates membership and emits event', async () => {
      prisma.server.findUnique.mockResolvedValue(server)
      prisma.serverBan.findUnique.mockResolvedValue(null)
      prisma.serverMember.findUnique.mockResolvedValue(null)
      prisma.server.findUniqueOrThrow.mockResolvedValue({ onboardingEnabled: false })
      prisma.serverMember.create.mockResolvedValue({
        userId, serverId, roles: [], onboardingCompleted: true,
      })
      prisma.role.findFirst.mockResolvedValue(null)

      await service.joinServer(serverId, userId)
      expect(events.emit).toHaveBeenCalledWith('member:joined', expect.objectContaining({ serverId }))
    })

    it('returns existing membership if already a member', async () => {
      prisma.server.findUnique.mockResolvedValue(server)
      prisma.serverBan.findUnique.mockResolvedValue(null)
      const existing = { userId, serverId }
      prisma.serverMember.findUnique.mockResolvedValue(existing)

      const result = await service.joinServer(serverId, userId)
      expect(result).toBe(existing)
      expect(events.emit).not.toHaveBeenCalled()
    })

    it('throws ForbiddenException when user is banned', async () => {
      prisma.server.findUnique.mockResolvedValue(server)
      prisma.serverBan.findUnique.mockResolvedValue({ id: 'ban-1' })
      await expect(service.joinServer(serverId, userId)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('leaveServer', () => {
    it('removes membership and emits event', async () => {
      prisma.server.findUnique.mockResolvedValue({ ...server, ownerId: 'someone-else' })
      prisma.serverMember.findUnique.mockResolvedValue({ userId, serverId })
      prisma.messageBookmark.deleteMany.mockResolvedValue({})
      prisma.serverMember.delete.mockResolvedValue({})

      await service.leaveServer(serverId, userId)
      expect(events.emit).toHaveBeenCalledWith('member:removed', { serverId, userId })
    })

    it('owner cannot leave', async () => {
      prisma.server.findUnique.mockResolvedValue(server)
      prisma.serverMember.findUnique.mockResolvedValue({ userId, serverId })
      await expect(service.leaveServer(serverId, userId)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('deleteServer', () => {
    it('only allows the owner to delete', async () => {
      prisma.server.findUnique.mockResolvedValue(server)
      await expect(service.deleteServer(serverId, 'not-owner')).rejects.toThrow(ForbiddenException)
    })

    it('cleans up attachments and emojis', async () => {
      prisma.server.findUnique.mockResolvedValue({ ...server, iconUrl: '/icons/test.png' })
      prisma.channel.findMany.mockResolvedValue([{ id: 'ch-1' }])
      prisma.attachment.findMany.mockResolvedValue([{ url: '/a.png', thumbnailUrl: '/t.png' }])
      prisma.customEmoji.findMany.mockResolvedValue([{ imageUrl: '/e.png' }])
      prisma.server.delete.mockResolvedValue({})

      await service.deleteServer(serverId, userId)

      expect(uploads.deleteFile).toHaveBeenCalledWith('/icons/test.png')
      expect(uploads.deleteFile).toHaveBeenCalledWith('/a.png')
      expect(uploads.deleteFile).toHaveBeenCalledWith('/t.png')
      expect(uploads.deleteFile).toHaveBeenCalledWith('/e.png')
    })
  })

  describe('timeoutMember', () => {
    it('sets mutedUntil and emits event', async () => {
      prisma.server.findUnique.mockResolvedValue({ ...server, ownerId: 'someone-else' })
      prisma.serverMember.findUnique.mockResolvedValue({ userId: 'target', serverId })
      prisma.serverMember.update.mockResolvedValue({})

      const result = await service.timeoutMember(serverId, userId, 'target', 600)

      expect(result.mutedUntil).toBeDefined()
      expect(events.emit).toHaveBeenCalledWith('member:updated', expect.objectContaining({ serverId, userId: 'target' }))
    })
  })

  describe('uploadEmoji', () => {
    const file = { buffer: Buffer.from('img'), mimetype: 'image/png' } as any

    it('validates emoji name length', async () => {
      await expect(service.uploadEmoji(serverId, userId, file, 'a'))
        .rejects.toThrow(BadRequestException)
    })

    it('rejects duplicate emoji name', async () => {
      prisma.customEmoji.findUnique.mockResolvedValue({ id: 'existing' })
      await expect(service.uploadEmoji(serverId, userId, file, 'wave'))
        .rejects.toThrow(BadRequestException)
    })

    it('enforces 50-emoji limit', async () => {
      prisma.customEmoji.findUnique.mockResolvedValue(null)
      prisma.customEmoji.count.mockResolvedValue(50)
      await expect(service.uploadEmoji(serverId, userId, file, 'wave'))
        .rejects.toThrow(BadRequestException)
    })

    it('creates emoji and emits event', async () => {
      prisma.customEmoji.findUnique.mockResolvedValue(null)
      prisma.customEmoji.count.mockResolvedValue(10)
      uploads.saveEmoji.mockResolvedValue('/emojis/wave.png')
      prisma.customEmoji.create.mockResolvedValue({ id: 'e-1', name: 'wave', imageUrl: '/emojis/wave.png' })

      const result = await service.uploadEmoji(serverId, userId, file, 'wave')
      expect(result.name).toBe('wave')
      expect(events.emit).toHaveBeenCalledWith('server:updated', { serverId })
    })
  })
})
