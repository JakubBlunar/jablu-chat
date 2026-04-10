import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
  forwardRef
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { CronJob } from 'cron'
import { v4 as uuidv4 } from 'uuid'
import { EventBusService } from '../events/event-bus.service'
import { FriendsService } from '../friends/friends.service'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { UploadsService } from '../uploads/uploads.service'
import { MailService } from './mail.service'
import { assertValidIanaTimeZone } from '../push/push-user-allow'

const PROFILE_SELECT = {
  id: true,
  username: true,
  displayName: true,
  email: true,
  avatarUrl: true,
  bio: true,
  status: true,
  manualStatus: true,
  manualStatusExpiresAt: true,
  customStatus: true,
  dmPrivacy: true,
  pushSuppressAll: true,
  pushQuietHoursEnabled: true,
  pushQuietHoursTz: true,
  pushQuietHoursStartMin: true,
  pushQuietHoursEndMin: true,
  lastSeenAt: true,
  createdAt: true
} as const

export type StatusDurationPreset = '15m' | '1h' | '8h' | '24h' | '3d' | 'forever'

/** Visible for unit tests — maps preset to DB expiry (null = no auto-expiry). */
export function computeManualStatusExpiresAt(preset: StatusDurationPreset, now: Date): Date | null {
  if (preset === 'forever') return null
  const msByPreset: Record<Exclude<StatusDurationPreset, 'forever'>, number> = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '8h': 8 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '3d': 3 * 24 * 60 * 60 * 1000
  }
  return new Date(now.getTime() + msByPreset[preset])
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly uploads: UploadsService,
    private readonly redis: RedisService,
    @Inject(forwardRef(() => FriendsService))
    private readonly friendsService: FriendsService,
    private readonly events: EventBusService
  ) {}

  private async invalidateJwtCache(userId: string) {
    try {
      await this.redis.client.del(`user:jwt:${userId}`)
    } catch {
      /* best effort */
    }
  }

  onModuleInit() {
    const job = new CronJob('0 4 * * *', async () => {
      const count = await this.cleanupExpiredTokens()
      if (count > 0) {
        this.logger.log(`Cleaned up ${count} expired refresh tokens`)
      }
    })
    job.start()
    this.logger.log('Expired token cleanup cron registered (daily at 4am)')
  }

  async register(
    username: string,
    email: string,
    password: string,
    inviteCode?: string,
    userAgent?: string,
    ipAddress?: string
  ) {
    const mode = this.config.get<string>('REGISTRATION_MODE', 'open')

    let invite: {
      id: string
      email: string
      serverId: string | null
      used: boolean
      expiresAt: Date | null
    } | null = null

    if (mode === 'invite') {
      if (!inviteCode) {
        throw new BadRequestException('An invite code is required to register')
      }
      invite = await this.prisma.registrationInvite.findUnique({
        where: { code: inviteCode.toUpperCase().trim() },
        select: { id: true, email: true, serverId: true, used: true, expiresAt: true }
      })

      if (!invite) {
        throw new BadRequestException('Invalid invite code')
      }

      if (invite.used) {
        throw new BadRequestException('This invite code has already been used')
      }
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        throw new BadRequestException('This invite code has expired')
      }
      if (invite.email.toLowerCase() !== email.toLowerCase()) {
        throw new BadRequestException('This invite code is not for this email address')
      }
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] }
    })
    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException('Email already in use')
      }
      throw new ConflictException('Username already taken')
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await this.prisma.user.create({
      data: { username, email, passwordHash, displayName: username },
      select: PROFILE_SELECT
    })

    if (invite) {
      await this.prisma.registrationInvite.update({
        where: { id: invite.id },
        data: { used: true, usedAt: new Date(), usedById: user.id }
      })

      if (invite.serverId) {
        try {
          const srv = await this.prisma.server.findUnique({
            where: { id: invite.serverId },
            select: { onboardingEnabled: true }
          })
          const member = await this.prisma.serverMember.create({
            data: { userId: user.id, serverId: invite.serverId, onboardingCompleted: !srv?.onboardingEnabled },
            include: {
              user: {
                select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, status: true }
              }
            }
          })
          this.events.emit('member:joined', { serverId: invite.serverId, member })
        } catch {
          /* already a member */
        }
      }
    }

    const tokens = await this.generateTokens(user.id, userAgent, ipAddress)
    return { ...tokens, user }
  }

  getRegistrationMode() {
    const mode = this.config.get<string>('REGISTRATION_MODE', 'open')
    return { mode }
  }

  async login(email: string, password: string, userAgent?: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user) {
      throw new UnauthorizedException('Invalid email or password')
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password')
    }

    const tokens = await this.generateTokens(user.id, userAgent, ipAddress)
    const profile = await this.loadProfileAfterAuth(user.id)
    return { ...tokens, user: profile! }
  }

  async refreshToken(refreshToken: string, userAgent?: string, ipAddress?: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true }
    })

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        await this.prisma.refreshToken.delete({ where: { id: stored.id } })
      }
      throw new UnauthorizedException('Invalid or expired refresh token')
    }

    const tokens = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.delete({ where: { id: stored.id } })
      return this.generateTokensTx(tx, stored.userId, userAgent, ipAddress)
    })

    const profile = await this.loadProfileAfterAuth(stored.userId)
    return { ...tokens, user: profile! }
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.delete({ where: { token: refreshToken } }).catch(() => {})
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user) {
      return
    }

    await this.prisma.passwordReset.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true }
    })

    const token = uuidv4()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await this.prisma.passwordReset.create({
      data: { userId: user.id, token, expiresAt }
    })

    const serverHost = this.config.get<string>('SERVER_HOST', 'localhost')
    const tlsMode = this.config.get<string>('TLS_MODE', 'off')
    const protocol = tlsMode === 'off' ? 'http' : 'https'
    const resetUrl = `${protocol}://${serverHost}/reset-password?token=${token}`

    await this.mail.sendPasswordReset(user.email, user.username, resetUrl)
  }

  async resetPassword(token: string, newPassword: string) {
    const reset = await this.prisma.passwordReset.findUnique({
      where: { token }
    })

    if (!reset || reset.used || reset.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token')
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)

    await this.prisma.$transaction([
      this.prisma.passwordReset.update({
        where: { id: reset.id },
        data: { used: true }
      }),
      this.prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash }
      }),
      this.prisma.refreshToken.deleteMany({
        where: { userId: reset.userId }
      })
    ])
  }

  async getProfile(userId: string) {
    const user = await this.loadProfileAfterAuth(userId)
    if (!user) {
      throw new UnauthorizedException('User not found')
    }
    return user
  }

  /** Loads profile and clears timed manual presence if its expiry is in the past. */
  private async loadProfileAfterAuth(userId: string) {
    let user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT
    })
    if (!user) return null
    if (
      user.manualStatus &&
      user.manualStatusExpiresAt != null &&
      user.manualStatusExpiresAt <= new Date()
    ) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          manualStatus: null,
          manualStatusExpiresAt: null,
          status: 'offline'
        }
      })
      user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: PROFILE_SELECT
      })
    }
    return user
  }

  async updateProfile(userId: string, data: { displayName?: string; bio?: string }) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: PROFILE_SELECT
    })
    this.events.emit('user:profile', { userId, ...data })
    return user
  }

  async updatePushPrefs(
    userId: string,
    dto: {
      pushSuppressAll?: boolean
      pushQuietHoursEnabled?: boolean
      pushQuietHoursTz?: string | null
      pushQuietHoursStartMin?: number
      pushQuietHoursEndMin?: number
    }
  ) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        pushSuppressAll: true,
        pushQuietHoursEnabled: true,
        pushQuietHoursTz: true,
        pushQuietHoursStartMin: true,
        pushQuietHoursEndMin: true
      }
    })
    if (!current) {
      throw new UnauthorizedException('User not found')
    }

    const nextEnabled = dto.pushQuietHoursEnabled ?? current.pushQuietHoursEnabled
    let nextTz =
      dto.pushQuietHoursTz !== undefined ? dto.pushQuietHoursTz : current.pushQuietHoursTz

    if (nextEnabled) {
      const tz = (nextTz?.trim() || 'UTC').trim()
      try {
        assertValidIanaTimeZone(tz)
      } catch {
        throw new BadRequestException('Invalid timezone')
      }
      nextTz = tz
    } else {
      nextTz = null
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        pushSuppressAll: dto.pushSuppressAll ?? current.pushSuppressAll,
        pushQuietHoursEnabled: nextEnabled,
        pushQuietHoursTz: nextEnabled ? nextTz : null,
        pushQuietHoursStartMin: dto.pushQuietHoursStartMin ?? current.pushQuietHoursStartMin,
        pushQuietHoursEndMin: dto.pushQuietHoursEndMin ?? current.pushQuietHoursEndMin
      },
      select: PROFILE_SELECT
    })
    return user
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    try {
      const current = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { avatarUrl: true }
      })
      if (current?.avatarUrl) {
        this.uploads.deleteFile(current.avatarUrl)
      }

      const avatarUrl = await this.uploads.saveAvatar(file)
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl },
        select: PROFILE_SELECT
      })
      this.events.emit('user:profile', { userId, avatarUrl })
      return user
    } catch (err) {
      this.logger.error(`Avatar upload failed for user ${userId}: ${err}`)
      throw err
    }
  }

  async deleteAvatar(userId: string) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true }
    })
    if (current?.avatarUrl) {
      this.uploads.deleteFile(current.avatarUrl)
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: PROFILE_SELECT
    })
    this.events.emit('user:profile', { userId, avatarUrl: null })
    return user
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException('User not found')

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) {
      throw new BadRequestException('Current password is incorrect')
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    })
  }

  async changeEmail(userId: string, email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException('User not found')

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      throw new BadRequestException('Password is incorrect')
    }

    const existing = await this.prisma.user.findUnique({ where: { email } })
    if (existing && existing.id !== userId) {
      throw new ConflictException('Email already in use')
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { email },
      select: PROFILE_SELECT
    })
    await this.invalidateJwtCache(userId)
    return updated
  }

  async updateDmPrivacy(userId: string, dmPrivacy: 'everyone' | 'friends_only') {
    return this.prisma.user.update({
      where: { id: userId },
      data: { dmPrivacy: dmPrivacy as any },
      select: PROFILE_SELECT
    })
  }

  async updateStatus(
    userId: string,
    status: 'online' | 'idle' | 'dnd' | 'offline',
    duration?: StatusDurationPreset
  ) {
    const now = new Date()
    let manualStatus: 'online' | 'idle' | 'dnd' | 'offline' | null = null
    let manualStatusExpiresAt: Date | null = null

    if (status === 'online') {
      manualStatus = null
      manualStatusExpiresAt = null
    } else {
      manualStatus = status
      manualStatusExpiresAt = computeManualStatusExpiresAt(duration ?? '1h', now)
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        status: status as any,
        manualStatus: manualStatus as any,
        manualStatusExpiresAt
      },
      select: PROFILE_SELECT
    })
  }

  async updateCustomStatus(userId: string, customStatus: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { customStatus },
      select: PROFILE_SELECT
    })
  }

  async searchUsers(query: string, currentUserId?: string) {
    const q = query.trim()
    if (!q || q.length < 2) return []
    const users = await this.prisma.user.findMany({
      where: {
        username: { contains: q, mode: 'insensitive' }
      },
      select: { id: true, username: true, displayName: true, avatarUrl: true, dmPrivacy: true },
      take: 40
    })

    if (!currentUserId) {
      return users.map(({ dmPrivacy: _dp, ...rest }) => rest)
    }

    const friendIds = await this.friendsService.getFriendIds(currentUserId)

    return users
      .filter((u) => {
        if (u.id === currentUserId) return false
        if (u.dmPrivacy === 'friends_only' && !friendIds.has(u.id)) return false
        return true
      })
      .slice(0, 20)
      .map(({ dmPrivacy: _dp, ...rest }) => rest)
  }

  async getSessions(userId: string) {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        lastUsedAt: true,
        createdAt: true
      },
      orderBy: { lastUsedAt: 'desc' }
    })
    return tokens
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { id: sessionId, userId }
    })
  }

  async findTokenByValue(token: string, userId: string) {
    return this.prisma.refreshToken.findFirst({
      where: { token, userId },
      select: { id: true }
    })
  }

  async revokeAllSessions(userId: string, exceptTokenId?: string) {
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId,
        ...(exceptTokenId ? { NOT: { id: exceptTokenId } } : {})
      }
    })
  }

  async cleanupExpiredTokens() {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    })
    return result.count
  }

  private async generateTokens(userId: string, userAgent?: string, ipAddress?: string) {
    return this.generateTokensTx(this.prisma, userId, userAgent, ipAddress)
  }

  private async generateTokensTx(
    tx: { refreshToken: { create: (...args: any[]) => any } },
    userId: string,
    userAgent?: string,
    ipAddress?: string
  ) {
    const accessToken = this.jwt.sign({ sub: userId })

    const refreshTokenValue = uuidv4()
    const refreshExpiresAt = new Date(
      Date.now() + 90 * 24 * 60 * 60 * 1000 // 90 days
    )

    await tx.refreshToken.create({
      data: {
        token: refreshTokenValue,
        userId,
        expiresAt: refreshExpiresAt,
        userAgent: userAgent?.slice(0, 512),
        ipAddress: ipAddress?.slice(0, 64),
        lastUsedAt: new Date()
      }
    })

    return { accessToken, refreshToken: refreshTokenValue }
  }
}
