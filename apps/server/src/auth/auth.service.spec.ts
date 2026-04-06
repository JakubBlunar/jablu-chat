import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { AuthService, computeManualStatusExpiresAt } from './auth.service'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { UploadsService } from '../uploads/uploads.service'
import { EventBusService } from '../events/event-bus.service'
import { FriendsService } from '../friends/friends.service'
import { MailService } from './mail.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'
import { createMockRedisService, MockRedisService } from '../__mocks__/redis.mock'

jest.mock('bcryptjs')
jest.mock('uuid', () => ({ v4: () => 'mock-uuid-1234' }))

const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>

describe('AuthService', () => {
  let service: AuthService
  let prisma: MockPrismaService
  let redis: MockRedisService
  let jwt: { sign: jest.Mock }
  let config: { get: jest.Mock }
  let mail: { sendPasswordReset: jest.Mock }
  let uploads: { saveAvatar: jest.Mock; deleteFile: jest.Mock }
  let events: { emit: jest.Mock }
  let friends: { getFriendIds: jest.Mock }

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    displayName: 'testuser',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    avatarUrl: null,
    bio: null,
    status: 'online',
    customStatus: null,
    dmPrivacy: 'everyone',
    lastSeenAt: null,
    createdAt: new Date('2024-01-01'),
  }

  const mockProfile = {
    id: 'user-1',
    username: 'testuser',
    displayName: 'testuser',
    email: 'test@example.com',
    avatarUrl: null,
    bio: null,
    status: 'online',
    manualStatus: null,
    manualStatusExpiresAt: null,
    customStatus: null,
    dmPrivacy: 'everyone',
    lastSeenAt: null,
    createdAt: new Date('2024-01-01'),
  }

  beforeEach(async () => {
    prisma = createMockPrismaService()
    redis = createMockRedisService()
    jwt = { sign: jest.fn().mockReturnValue('access-token-123') }
    config = { get: jest.fn().mockReturnValue('open') }
    mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) }
    uploads = { saveAvatar: jest.fn(), deleteFile: jest.fn() }
    events = { emit: jest.fn() }
    friends = { getFriendIds: jest.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: MailService, useValue: mail },
        { provide: UploadsService, useValue: uploads },
        { provide: RedisService, useValue: redis },
        { provide: FriendsService, useValue: friends },
        { provide: EventBusService, useValue: events },
      ],
    }).compile()

    service = module.get(AuthService)
  })

  afterEach(() => jest.restoreAllMocks())

  describe('register', () => {
    beforeEach(() => {
      mockBcrypt.hash.mockImplementation(async () => 'hashed-pw')
      prisma.user.findFirst.mockResolvedValue(null)
      prisma.user.create.mockResolvedValue(mockProfile)
      prisma.refreshToken.create.mockResolvedValue({})
    })

    it('creates a user and returns tokens in open mode', async () => {
      config.get.mockReturnValue('open')

      const result = await service.register('newuser', 'new@example.com', 'Password1!')
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          username: 'newuser',
          email: 'new@example.com',
          passwordHash: 'hashed-pw',
          displayName: 'newuser',
        },
        select: expect.any(Object),
      })
      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(result).toHaveProperty('user')
    })

    it('throws ConflictException when email already exists', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...mockUser, email: 'new@example.com' })

      await expect(
        service.register('other', 'new@example.com', 'Password1!'),
      ).rejects.toThrow(ConflictException)
    })

    it('throws ConflictException when username already exists', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...mockUser, email: 'different@example.com', username: 'taken' })

      await expect(
        service.register('taken', 'unique@example.com', 'Password1!'),
      ).rejects.toThrow(ConflictException)
    })

    it('requires invite code in invite mode', async () => {
      config.get.mockReturnValue('invite')

      await expect(
        service.register('newuser', 'new@example.com', 'Password1!'),
      ).rejects.toThrow(BadRequestException)
    })

    it('rejects invalid invite code', async () => {
      config.get.mockReturnValue('invite')
      prisma.registrationInvite.findUnique.mockResolvedValue(null)

      await expect(
        service.register('newuser', 'new@example.com', 'Password1!', 'BADCODE'),
      ).rejects.toThrow(BadRequestException)
    })

    it('rejects used invite code', async () => {
      config.get.mockReturnValue('invite')
      prisma.registrationInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        email: 'new@example.com',
        serverId: null,
        used: true,
        expiresAt: null,
      })

      await expect(
        service.register('newuser', 'new@example.com', 'Password1!', 'USED'),
      ).rejects.toThrow(BadRequestException)
    })

    it('rejects expired invite code', async () => {
      config.get.mockReturnValue('invite')
      prisma.registrationInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        email: 'new@example.com',
        serverId: null,
        used: false,
        expiresAt: new Date('2020-01-01'),
      })

      await expect(
        service.register('newuser', 'new@example.com', 'Password1!', 'EXPIRED'),
      ).rejects.toThrow(BadRequestException)
    })

    it('rejects invite code for wrong email', async () => {
      config.get.mockReturnValue('invite')
      prisma.registrationInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        email: 'other@example.com',
        serverId: null,
        used: false,
        expiresAt: null,
      })

      await expect(
        service.register('newuser', 'new@example.com', 'Password1!', 'CODE'),
      ).rejects.toThrow(BadRequestException)
    })

    it('accepts valid invite and marks it used', async () => {
      config.get.mockReturnValue('invite')
      prisma.registrationInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        email: 'new@example.com',
        serverId: null,
        used: false,
        expiresAt: null,
      })
      prisma.registrationInvite.update.mockResolvedValue({})

      const result = await service.register('newuser', 'new@example.com', 'Password1!', 'VALID')
      expect(prisma.registrationInvite.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: expect.objectContaining({ used: true }),
      })
      expect(result).toHaveProperty('accessToken')
    })

    it('joins server when invite has serverId', async () => {
      config.get.mockReturnValue('invite')
      prisma.registrationInvite.findUnique.mockResolvedValue({
        id: 'inv-1',
        email: 'new@example.com',
        serverId: 'server-1',
        used: false,
        expiresAt: null,
      })
      prisma.registrationInvite.update.mockResolvedValue({})
      prisma.role.findFirst.mockResolvedValue({ id: 'role-1' })
      prisma.serverMember.create.mockResolvedValue({ userId: 'user-1', serverId: 'server-1', user: mockProfile })

      await service.register('newuser', 'new@example.com', 'Password1!', 'WITHSERVER')
      expect(prisma.serverMember.create).toHaveBeenCalled()
      expect(events.emit).toHaveBeenCalledWith('member:joined', expect.any(Object))
    })
  })

  describe('login', () => {
    beforeEach(() => {
      prisma.refreshToken.create.mockResolvedValue({})
    })

    it('returns tokens and profile on valid credentials', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(mockUser) // first call: find by email
        .mockResolvedValueOnce(mockProfile) // second call: select profile
      mockBcrypt.compare.mockImplementation(async () => true)

      const result = await service.login('test@example.com', 'correct-password')
      expect(result.accessToken).toBeDefined()
      expect(result.refreshToken).toBeDefined()
      expect(result.user).toBeDefined()
    })

    it('throws UnauthorizedException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null)

      await expect(
        service.login('nobody@example.com', 'pass'),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('throws UnauthorizedException when password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser)
      mockBcrypt.compare.mockImplementation(async () => false)

      await expect(
        service.login('test@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('refreshToken', () => {
    const storedToken = {
      id: 'tok-1',
      token: 'refresh-123',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 86400000),
      user: mockUser,
    }

    beforeEach(() => {
      prisma.refreshToken.create.mockResolvedValue({})
    })

    it('rotates tokens on valid refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(storedToken)
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          refreshToken: { delete: jest.fn(), create: jest.fn() },
        }
        return fn(tx)
      })
      prisma.user.findUnique.mockResolvedValue(mockProfile)

      const result = await service.refreshToken('refresh-123')
      expect(result.accessToken).toBeDefined()
      expect(result.user).toBeDefined()
    })

    it('throws on expired refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...storedToken,
        expiresAt: new Date('2020-01-01'),
      })
      prisma.refreshToken.delete.mockResolvedValue({})

      await expect(
        service.refreshToken('expired-token'),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('throws on non-existent refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null)

      await expect(
        service.refreshToken('nonexistent'),
      ).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('changePassword', () => {
    it('updates password when current password is correct', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser)
      mockBcrypt.compare.mockImplementation(async () => true)
      mockBcrypt.hash.mockImplementation(async () => 'new-hashed-pw')
      prisma.user.update.mockResolvedValue({})

      await service.changePassword('user-1', 'old-pass', 'new-pass')
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: 'new-hashed-pw' },
      })
    })

    it('throws BadRequestException when current password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser)
      mockBcrypt.compare.mockImplementation(async () => false)

      await expect(
        service.changePassword('user-1', 'wrong', 'new-pass'),
      ).rejects.toThrow(BadRequestException)
    })

    it('throws UnauthorizedException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null)

      await expect(
        service.changePassword('missing', 'old', 'new'),
      ).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('changeEmail', () => {
    it('updates email when password is correct', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(mockUser) // find by id
        .mockResolvedValueOnce(null) // check email uniqueness
      mockBcrypt.compare.mockImplementation(async () => true)
      prisma.user.update.mockResolvedValue({ ...mockProfile, email: 'newemail@example.com' })
      redis.client.del.mockResolvedValue(1)

      const result = await service.changeEmail('user-1', 'newemail@example.com', 'password')
      expect(prisma.user.update).toHaveBeenCalled()
      expect(result.email).toBe('newemail@example.com')
    })

    it('throws BadRequestException when password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser)
      mockBcrypt.compare.mockImplementation(async () => false)

      await expect(
        service.changeEmail('user-1', 'new@test.com', 'wrong'),
      ).rejects.toThrow(BadRequestException)
    })

    it('throws ConflictException when email is taken', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce({ id: 'user-2', email: 'taken@test.com' })
      mockBcrypt.compare.mockImplementation(async () => true)

      await expect(
        service.changeEmail('user-1', 'taken@test.com', 'password'),
      ).rejects.toThrow(ConflictException)
    })
  })

  describe('forgotPassword', () => {
    it('creates reset token and sends email', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser)
      prisma.passwordReset.updateMany.mockResolvedValue({ count: 0 })
      prisma.passwordReset.create.mockResolvedValue({})
      config.get.mockImplementation((key: string, def: string) => {
        if (key === 'SERVER_HOST') return 'example.com'
        if (key === 'TLS_MODE') return 'off'
        return def
      })

      await service.forgotPassword('test@example.com')
      expect(prisma.passwordReset.create).toHaveBeenCalled()
      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        'test@example.com',
        'testuser',
        expect.stringContaining('http://example.com/reset-password?token='),
      )
    })

    it('does nothing silently when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null)

      await service.forgotPassword('nobody@example.com')
      expect(prisma.passwordReset.create).not.toHaveBeenCalled()
      expect(mail.sendPasswordReset).not.toHaveBeenCalled()
    })
  })

  describe('resetPassword', () => {
    it('resets password with valid token', async () => {
      prisma.passwordReset.findUnique.mockResolvedValue({
        id: 'reset-1',
        token: 'valid-token',
        userId: 'user-1',
        used: false,
        expiresAt: new Date(Date.now() + 3600000),
      })
      mockBcrypt.hash.mockImplementation(async () => 'new-hash')
      prisma.$transaction.mockResolvedValue(undefined)

      await service.resetPassword('valid-token', 'newPassword123')
      expect(prisma.$transaction).toHaveBeenCalled()
    })

    it('throws on invalid token', async () => {
      prisma.passwordReset.findUnique.mockResolvedValue(null)

      await expect(
        service.resetPassword('invalid', 'newpass'),
      ).rejects.toThrow(BadRequestException)
    })

    it('throws on used token', async () => {
      prisma.passwordReset.findUnique.mockResolvedValue({
        id: 'reset-1',
        token: 'used-token',
        userId: 'user-1',
        used: true,
        expiresAt: new Date(Date.now() + 3600000),
      })

      await expect(
        service.resetPassword('used-token', 'newpass'),
      ).rejects.toThrow(BadRequestException)
    })

    it('throws on expired token', async () => {
      prisma.passwordReset.findUnique.mockResolvedValue({
        id: 'reset-1',
        token: 'expired-token',
        userId: 'user-1',
        used: false,
        expiresAt: new Date('2020-01-01'),
      })

      await expect(
        service.resetPassword('expired-token', 'newpass'),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('getProfile', () => {
    it('returns user profile', async () => {
      prisma.user.findUnique.mockResolvedValue(mockProfile)

      const result = await service.getProfile('user-1')
      expect(result).toEqual(mockProfile)
    })

    it('throws when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null)

      await expect(service.getProfile('missing')).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('updateProfile', () => {
    it('updates and emits event', async () => {
      const updated = { ...mockProfile, displayName: 'New Name' }
      prisma.user.update.mockResolvedValue(updated)

      const result = await service.updateProfile('user-1', { displayName: 'New Name' })
      expect(result.displayName).toBe('New Name')
      expect(events.emit).toHaveBeenCalledWith('user:profile', {
        userId: 'user-1',
        displayName: 'New Name',
      })
    })
  })

  describe('sessions', () => {
    it('getSessions returns active sessions', async () => {
      const sessions = [{ id: 's1', userAgent: 'Chrome', ipAddress: '1.2.3.4', lastUsedAt: new Date(), createdAt: new Date() }]
      prisma.refreshToken.findMany.mockResolvedValue(sessions)

      const result = await service.getSessions('user-1')
      expect(result).toEqual(sessions)
    })

    it('revokeSession deletes specific session', async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 })

      await service.revokeSession('user-1', 'session-1')
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { id: 'session-1', userId: 'user-1' },
      })
    })

    it('revokeAllSessions deletes all except specified', async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 })

      await service.revokeAllSessions('user-1', 'keep-this')
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', NOT: { id: 'keep-this' } },
      })
    })
  })

  describe('getRegistrationMode', () => {
    it('returns the configured mode', () => {
      config.get.mockReturnValue('invite')
      expect(service.getRegistrationMode()).toEqual({ mode: 'invite' })
    })
  })

  describe('computeManualStatusExpiresAt', () => {
    it('returns null for forever', () => {
      expect(computeManualStatusExpiresAt('forever', new Date('2026-06-15T12:00:00Z'))).toBeNull()
    })

    it('adds 1 hour for 1h', () => {
      const now = new Date('2026-06-15T12:00:00Z')
      const e = computeManualStatusExpiresAt('1h', now)!
      expect(e.getTime() - now.getTime()).toBe(3600_000)
    })

    it('adds 15 minutes for 15m', () => {
      const now = new Date('2026-06-15T12:00:00Z')
      const e = computeManualStatusExpiresAt('15m', now)!
      expect(e.getTime() - now.getTime()).toBe(15 * 60_000)
    })

    it('adds 3 days for 3d', () => {
      const now = new Date('2026-06-15T12:00:00Z')
      const e = computeManualStatusExpiresAt('3d', now)!
      expect(e.getTime() - now.getTime()).toBe(3 * 24 * 3600_000)
    })
  })

  describe('updateStatus', () => {
    it('clears manual fields when setting online', async () => {
      prisma.user.update.mockResolvedValue({
        ...mockProfile,
        status: 'online',
        manualStatus: null,
        manualStatusExpiresAt: null,
      })

      await service.updateStatus('user-1', 'online')

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: {
            status: 'online',
            manualStatus: null,
            manualStatusExpiresAt: null,
          },
        }),
      )
    })

    it('stores manual status and expiry for dnd', async () => {
      prisma.user.update.mockResolvedValue({
        ...mockProfile,
        status: 'dnd',
        manualStatus: 'dnd',
        manualStatusExpiresAt: new Date('2026-06-15T13:00:00Z'),
      })

      await service.updateStatus('user-1', 'dnd', '1h')

      const arg = prisma.user.update.mock.calls[0][0]
      expect(arg.data.manualStatus).toBe('dnd')
      expect(arg.data.manualStatusExpiresAt).toBeInstanceOf(Date)
      expect(arg.data.status).toBe('dnd')
    })
  })

  describe('logout', () => {
    it('deletes the refresh token', async () => {
      prisma.refreshToken.delete.mockResolvedValue({})
      await service.logout('refresh-token')
      expect(prisma.refreshToken.delete).toHaveBeenCalledWith({
        where: { token: 'refresh-token' },
      })
    })

    it('does not throw if token does not exist', async () => {
      prisma.refreshToken.delete.mockRejectedValue(new Error('Not found'))
      await expect(service.logout('nonexistent')).resolves.toBeUndefined()
    })
  })
})
