import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ChannelType } from '../prisma-client'
import * as crypto from 'crypto'
import { MailService } from '../auth/mail.service'
import { CleanupService, StorageStats } from '../cleanup/cleanup.service'
import { EventBusService } from '../events/event-bus.service'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { RedisService } from '../redis/redis.service'
import { RolesService } from '../roles/roles.service'
import { UploadsService } from '../uploads/uploads.service'
import { AdminAuthGuard } from './admin-auth.guard'
import { AdminRateLimiter } from './admin-rate-limiter'
import { AdminTokenStore } from './admin-token-store'
import {
  AdminAddServerMemberDto,
  AdminCreateInviteDto,
  AdminCreateRoleDto,
  AdminCreateServerDto,
  AdminLoginDto,
  AdminUpdateMemberRolesDto,
  AdminUpdateRoleDto,
  AdminUpdateUserDto
} from './dto'

function serializeAudit(audit: Record<string, unknown>) {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(audit)) {
    result[key] = typeof value === 'bigint' ? value.toString() : value
  }
  return result
}

@Controller('admin')
export class AdminController {
  private readonly superadminUsername: string
  private readonly superadminPassword: string

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly uploads: UploadsService,
    private readonly cleanup: CleanupService,
    private readonly push: PushService,
    private readonly mail: MailService,
    private readonly rateLimiter: AdminRateLimiter,
    private readonly tokenStore: AdminTokenStore,
    private readonly redis: RedisService,
    private readonly events: EventBusService,
    private readonly roles: RolesService
  ) {
    this.superadminUsername = config.get<string>('SUPERADMIN_USERNAME', '')
    this.superadminPassword = config.get<string>('SUPERADMIN_PASSWORD', '')
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: AdminLoginDto, @Req() req: { ip?: string; headers: Record<string, string | undefined> }) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip ?? 'unknown'

    const check = this.rateLimiter.check(ip)
    if (!check.allowed) {
      return { ok: false, retryAfter: check.retryAfter }
    }

    if (!this.superadminPassword || !this.superadminUsername) {
      return { ok: false }
    }

    const inputUser = Buffer.from(dto.username)
    const expectedUser = Buffer.from(this.superadminUsername)
    const userValid = inputUser.length === expectedUser.length && crypto.timingSafeEqual(inputUser, expectedUser)

    const inputPass = Buffer.from(dto.password)
    const expectedPass = Buffer.from(this.superadminPassword)
    const passValid = inputPass.length === expectedPass.length && crypto.timingSafeEqual(inputPass, expectedPass)

    const valid = userValid && passValid

    if (!valid) {
      const result = this.rateLimiter.recordFailure(ip)
      return { ok: false, retryAfter: result.retryAfter }
    }

    this.rateLimiter.resetOnSuccess(ip)
    const token = this.tokenStore.create(ip)
    return { ok: true, token }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Headers('x-admin-token') token?: string) {
    if (token) this.tokenStore.revoke(token)
  }

  // ─── Servers ───────────────────────────────────────────────

  @Get('servers')
  @UseGuards(AdminAuthGuard)
  async listServers() {
    return this.prisma.server.findMany({
      include: {
        _count: { select: { members: true, channels: true } },
        owner: { select: { id: true, username: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  @Post('servers')
  @UseGuards(AdminAuthGuard)
  async createServer(@Body() dto: AdminCreateServerDto) {
    const owner = await this.prisma.user.findUnique({
      where: { id: dto.ownerUserId }
    })
    if (!owner) {
      throw new BadRequestException('User not found')
    }

    const server = await this.prisma.server.create({
      data: {
        name: dto.name,
        ownerId: dto.ownerUserId,
        channels: {
          create: [
            { name: 'general', type: ChannelType.text, position: 0 },
            { name: 'General', type: ChannelType.voice, position: 1 }
          ]
        }
      }
    })
    const { ownerRoleId } = await this.roles.createDefaultRoles(server.id, dto.ownerUserId)
    await this.prisma.serverMember.create({
      data: { userId: dto.ownerUserId, serverId: server.id }
    })
    await this.prisma.serverMemberRole.create({
      data: { userId: dto.ownerUserId, serverId: server.id, roleId: ownerRoleId }
    })
    return this.prisma.server.findUnique({
      where: { id: server.id },
      include: {
        _count: { select: { members: true, channels: true } },
        owner: { select: { id: true, username: true } }
      }
    })
  }

  @Delete('servers/:id')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteServer(@Param('id', ParseUUIDPipe) id: string) {
    await this.cleanupAndDeleteServer(id)
  }

  @Get('servers/:id/members')
  @UseGuards(AdminAuthGuard)
  async listServerMembers(@Param('id', ParseUUIDPipe) id: string) {
    const server = await this.prisma.server.findUnique({ where: { id } })
    if (!server) throw new NotFoundException('Server not found')

    return this.prisma.serverMember.findMany({
      where: { serverId: id },
      include: {
        user: {
          select: { id: true, username: true, email: true, avatarUrl: true }
        },
        roles: { include: { role: true } }
      },
      orderBy: { joinedAt: 'asc' }
    })
  }

  @Post('servers/:id/members')
  @UseGuards(AdminAuthGuard)
  async addServerMember(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminAddServerMemberDto) {
    const server = await this.prisma.server.findUnique({ where: { id } })
    if (!server) throw new NotFoundException('Server not found')

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId }
    })
    if (!user) throw new BadRequestException('User not found')

    const existing = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: dto.userId, serverId: id } }
    })
    if (existing) throw new BadRequestException('User is already a member')

    const member = await this.prisma.serverMember.create({
      data: { userId: dto.userId, serverId: id },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, email: true, avatarUrl: true, bio: true, status: true }
        },
        roles: { include: { role: true } }
      }
    })
    this.events.emit('member:joined', { serverId: id, member })
    return member
  }

  @Delete('servers/:id/members/:userId')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeServerMember(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    const server = await this.prisma.server.findUnique({ where: { id } })
    if (!server) throw new NotFoundException('Server not found')

    if (server.ownerId === userId) {
      throw new BadRequestException('Cannot remove the server owner')
    }

    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: id } }
    })
    if (!member) throw new NotFoundException('Member not found')

    await this.prisma.serverMember.delete({
      where: { userId_serverId: { userId, serverId: id } }
    })
    this.events.emit('member:removed', { serverId: id, userId })
  }

  @Patch('servers/:id/members/:userId/roles')
  @UseGuards(AdminAuthGuard)
  async updateMemberRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AdminUpdateMemberRolesDto
  ) {
    const server = await this.prisma.server.findUnique({ where: { id } })
    if (!server) throw new NotFoundException('Server not found')

    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: id } }
    })
    if (!member) throw new NotFoundException('Member not found')

    const validRoles = await this.prisma.role.findMany({
      where: { id: { in: dto.roleIds }, serverId: id, isDefault: false }
    })
    if (validRoles.length !== dto.roleIds.length) {
      throw new BadRequestException('Some roles not found in this server')
    }

    await this.prisma.$transaction([
      this.prisma.serverMemberRole.deleteMany({ where: { userId, serverId: id } }),
      ...dto.roleIds.map((roleId) =>
        this.prisma.serverMemberRole.create({ data: { userId, serverId: id, roleId } })
      )
    ])

    const memberRoles = await this.roles.loadMemberRolesWire(id, userId)
    this.events.emit('member:updated', {
      serverId: id,
      userId,
      roleIds: memberRoles.map((r) => r.id),
      roles: memberRoles
    })

    const members = await this.prisma.serverMember.findMany({
      where: { serverId: id },
      include: {
        user: { select: { id: true, username: true, email: true, avatarUrl: true } },
        roles: { include: { role: true } }
      },
      orderBy: { joinedAt: 'asc' }
    })

    return { members, owner: server }
  }

  // ─── Server Roles (Admin CRUD) ─────────────────────────────

  @Get('servers/:id/roles')
  @UseGuards(AdminAuthGuard)
  async listServerRoles(@Param('id', ParseUUIDPipe) id: string) {
    const server = await this.prisma.server.findUnique({ where: { id } })
    if (!server) throw new NotFoundException('Server not found')
    return this.roles.getRoles(id)
  }

  @Post('servers/:id/roles')
  @UseGuards(AdminAuthGuard)
  async createServerRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminCreateRoleDto
  ) {
    const server = await this.prisma.server.findUnique({ where: { id } })
    if (!server) throw new NotFoundException('Server not found')

    const maxPos = await this.prisma.role.aggregate({
      where: { serverId: id },
      _max: { position: true }
    })
    const position = (maxPos._max.position ?? 0) + 1

    const role = await this.prisma.role.create({
      data: {
        serverId: id,
        name: dto.name,
        color: dto.color ?? null,
        position,
        permissions: dto.permissions ? BigInt(dto.permissions) : 0n
      }
    })
    const wire = this.roles.mapToWire(role)
    this.events.emit('role:created', { serverId: id, role: wire })
    return wire
  }

  @Patch('servers/:id/roles/reorder')
  @UseGuards(AdminAuthGuard)
  async reorderServerRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { roleIds: string[] }
  ) {
    const roles = await this.prisma.role.findMany({
      where: { id: { in: body.roleIds }, serverId: id },
      select: { id: true }
    })
    if (roles.length !== body.roleIds.length) {
      throw new BadRequestException('Some role IDs do not belong to this server')
    }
    await this.prisma.$transaction(
      body.roleIds.map((rid, i) =>
        this.prisma.role.update({ where: { id: rid }, data: { position: body.roleIds.length - i } })
      )
    )
    const updatedRoles = await this.roles.getRoles(id)
    this.events.emit('roles:reordered', { serverId: id, roles: updatedRoles })
    return updatedRoles
  }

  @Patch('servers/:id/roles/:roleId')
  @UseGuards(AdminAuthGuard)
  async updateServerRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: AdminUpdateRoleDto
  ) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, serverId: id } })
    if (!role) throw new NotFoundException('Role not found')

    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.permissions !== undefined && { permissions: BigInt(dto.permissions) }),
        ...(dto.position !== undefined && { position: dto.position }),
        ...(dto.selfAssignable !== undefined && { selfAssignable: dto.selfAssignable }),
        ...(dto.isAdmin !== undefined && { isAdmin: dto.isAdmin })
      }
    })
    const wire = this.roles.mapToWire(updated)
    this.events.emit('role:updated', { serverId: id, role: wire })
    return wire
  }

  @Delete('servers/:id/roles/:roleId')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteServerRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string
  ) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, serverId: id } })
    if (!role) throw new NotFoundException('Role not found')
    if (role.isDefault) throw new BadRequestException('Cannot delete the default role')

    await this.prisma.$transaction([
      this.prisma.serverMemberRole.deleteMany({ where: { serverId: id, roleId } }),
      this.prisma.role.delete({ where: { id: roleId } })
    ])
    this.events.emit('role:deleted', { serverId: id, roleId })
  }

  // ─── Users ─────────────────────────────────────────────────

  @Get('users')
  @UseGuards(AdminAuthGuard)
  async listUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        bio: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            serverMemberships: true,
            messages: true
          }
        }
      },
      orderBy: { username: 'asc' }
    })
  }

  @Patch('users/:id')
  @UseGuards(AdminAuthGuard)
  async updateUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminUpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) throw new NotFoundException('User not found')

    if (dto.username && dto.username !== user.username) {
      const existing = await this.prisma.user.findUnique({
        where: { username: dto.username }
      })
      if (existing) throw new BadRequestException('Username already taken')
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email }
      })
      if (existing) throw new BadRequestException('Email already in use')
    }

    const data: Record<string, unknown> = {}
    if (dto.username !== undefined) data.username = dto.username
    if (dto.displayName !== undefined) data.displayName = dto.displayName || null
    if (dto.email !== undefined) data.email = dto.email
    if (dto.bio !== undefined) data.bio = dto.bio || null

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        bio: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            serverMemberships: true,
            messages: true
          }
        }
      }
    })

    if (dto.username !== undefined || dto.email !== undefined) {
      try {
        await this.redis.client.del(`user:jwt:${id}`)
      } catch {
        /* best effort */
      }
    }

    return updated
  }

  @Delete('users/:id')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, avatarUrl: true }
    })
    if (!user) throw new NotFoundException('User not found')

    if (user.avatarUrl) {
      this.uploads.deleteFile(user.avatarUrl)
    }

    const ownedServers = await this.prisma.server.findMany({
      where: { ownerId: id },
      select: { id: true }
    })
    for (const srv of ownedServers) {
      await this.cleanupAndDeleteServer(srv.id)
    }

    await this.prisma.user.delete({ where: { id } })
  }

  // ─── Registration Invites ─────────────────────────────────

  @Get('invites')
  @UseGuards(AdminAuthGuard)
  async listInvites() {
    return this.prisma.registrationInvite.findMany({
      include: {
        server: { select: { id: true, name: true } },
        usedBy: { select: { id: true, username: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  @Post('invites')
  @UseGuards(AdminAuthGuard)
  async createInvite(@Body() dto: AdminCreateInviteDto) {
    if (dto.serverId) {
      const server = await this.prisma.server.findUnique({
        where: { id: dto.serverId }
      })
      if (!server) throw new BadRequestException('Server not found')
    }

    const code = crypto.randomBytes(4).toString('hex').toUpperCase()
    const email = dto.email.toLowerCase().trim()

    const invite = await this.prisma.registrationInvite.create({
      data: {
        code,
        email,
        serverId: dto.serverId ?? null
      },
      include: {
        server: { select: { id: true, name: true } },
        usedBy: { select: { id: true, username: true } }
      }
    })

    const serverHost = this.config.get<string>('SERVER_HOST', 'localhost')
    const tlsMode = this.config.get<string>('TLS_MODE', 'off')
    const protocol = tlsMode === 'off' ? 'http' : 'https'
    const registerUrl = `${protocol}://${serverHost}/register?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`

    void this.mail.sendInvite(email, code, registerUrl)

    return invite
  }

  @Delete('invites/:id')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteInvite(@Param('id', ParseUUIDPipe) id: string) {
    const invite = await this.prisma.registrationInvite.findUnique({
      where: { id }
    })
    if (!invite) throw new NotFoundException('Invite not found')
    await this.prisma.registrationInvite.delete({ where: { id } })
  }

  @Get('settings/registration')
  @UseGuards(AdminAuthGuard)
  getRegistrationMode() {
    const mode = this.config.get<string>('REGISTRATION_MODE', 'open')
    return { mode }
  }

  // ─── Storage ─────────────────────────────────────────────

  @Get('storage')
  @UseGuards(AdminAuthGuard)
  async getStorageStats(): Promise<StorageStats> {
    return this.cleanup.getStorageStats()
  }

  @Get('storage/audits')
  @UseGuards(AdminAuthGuard)
  async listAudits() {
    const audits = await this.cleanup.getAudits()
    return audits.map(serializeAudit)
  }

  @Post('storage/audit')
  @UseGuards(AdminAuthGuard)
  async runAudit() {
    const audit = await this.cleanup.runAudit()
    return serializeAudit(audit as unknown as Record<string, unknown>)
  }

  @Post('storage/cleanup/:id')
  @UseGuards(AdminAuthGuard)
  async executeCleanup(@Param('id', ParseUUIDPipe) id: string) {
    try {
      const audit = await this.cleanup.executeCleanup(id)
      return serializeAudit(audit as unknown as Record<string, unknown>)
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Cleanup failed')
    }
  }

  @Delete('storage/audits/:id')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAudit(@Param('id', ParseUUIDPipe) id: string) {
    try {
      await this.cleanup.deleteAudit(id)
    } catch {
      throw new NotFoundException('Audit not found')
    }
  }

  // ─── Stats ──────────────────────────────────────────────

  @Get('stats')
  @UseGuards(AdminAuthGuard)
  async getStats(@Query('days') daysStr?: string) {
    const days = Math.min(Math.max(parseInt(daysStr ?? '30', 10) || 30, 1), 365)
    const since = new Date()
    since.setDate(since.getDate() - days)

    const [totalMessages, recentMessages, totalUsers, totalServers] = await Promise.all([
      this.prisma.message.count(),
      this.prisma.message.count({
        where: { createdAt: { gte: since } }
      }),
      this.prisma.user.count(),
      this.prisma.server.count()
    ])

    const topChannels = await this.prisma.message.groupBy({
      by: ['channelId'],
      where: { createdAt: { gte: since }, channelId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5
    })

    const channelIds = topChannels.map((c) => c.channelId).filter((id): id is string => id !== null)
    const channels = await this.prisma.channel.findMany({
      where: { id: { in: channelIds } },
      select: { id: true, name: true, server: { select: { name: true } } }
    })
    const channelMap = new Map(channels.map((c) => [c.id, c]))

    const topUsers = await this.prisma.message.groupBy({
      by: ['authorId'],
      where: { createdAt: { gte: since }, authorId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5
    })

    const userIds = topUsers.map((u) => u.authorId).filter((id): id is string => id !== null)
    const usersList = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, displayName: true }
    })
    const userMap = new Map(usersList.map((u) => [u.id, u]))

    return {
      days,
      totalMessages,
      recentMessages,
      totalUsers,
      totalServers,
      topChannels: topChannels.map((c) => {
        const ch = channelMap.get(c.channelId!)
        return {
          channelId: c.channelId,
          name: ch?.name ?? 'Deleted',
          serverName: ch?.server?.name ?? 'Unknown',
          count: c._count.id
        }
      }),
      topUsers: topUsers.map((u) => {
        const usr = userMap.get(u.authorId!)
        return {
          userId: u.authorId,
          username: usr?.username ?? 'Deleted',
          displayName: usr?.displayName ?? null,
          count: u._count.id
        }
      })
    }
  }

  // ─── Audit Logs ───────────────────────────────────────────

  @Get('audit-logs')
  @UseGuards(AdminAuthGuard)
  async listAuditLogs(
    @Query('serverId') serverId?: string,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string
  ) {
    const limit = Math.min(Math.max(parseInt(limitStr ?? '50', 10) || 50, 1), 100)

    const where: Record<string, unknown> = {}
    if (serverId) where.serverId = serverId
    if (cursor) where.createdAt = { lt: new Date(cursor) }

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actor: { select: { id: true, username: true, displayName: true } },
        server: { select: { id: true, name: true } }
      }
    })

    return {
      logs,
      nextCursor: logs.length === limit ? logs[logs.length - 1].createdAt.toISOString() : null
    }
  }

  // ─── User Sessions ──────────────────────────────────────

  @Get('users/:id/sessions')
  @UseGuards(AdminAuthGuard)
  async listUserSessions(@Param('id', ParseUUIDPipe) userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')
    return this.prisma.refreshToken.findMany({
      where: { userId },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        lastUsedAt: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  @Delete('users/:id/sessions/:sessionId')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Param('id', ParseUUIDPipe) userId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string
  ) {
    const token = await this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId }
    })
    if (!token) throw new NotFoundException('Session not found')
    await this.prisma.refreshToken.delete({ where: { id: sessionId } })
  }

  @Delete('users/:id/sessions')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAllSessions(@Param('id', ParseUUIDPipe) userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } })
  }

  // ─── Message Moderation ──────────────────────────────────

  @Get('messages')
  @UseGuards(AdminAuthGuard)
  async searchMessages(
    @Query('q') query?: string,
    @Query('channelId') channelId?: string,
    @Query('authorId') authorId?: string,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string
  ) {
    const limit = Math.min(Math.max(parseInt(limitStr ?? '50', 10) || 50, 1), 100)

    const where: Record<string, unknown> = { deleted: false }
    if (channelId) where.channelId = channelId
    if (authorId) where.authorId = authorId
    if (query) where.content = { contains: query, mode: 'insensitive' }
    if (cursor) where.createdAt = { lt: new Date(cursor) }

    const messages = await this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        author: { select: { id: true, username: true, displayName: true } },
        channel: {
          select: {
            id: true,
            name: true,
            server: { select: { id: true, name: true } }
          }
        }
      }
    })

    return {
      messages,
      nextCursor: messages.length === limit ? messages[messages.length - 1].createdAt : null
    }
  }

  @Delete('messages/:id')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMessage(@Param('id', ParseUUIDPipe) id: string) {
    const msg = await this.prisma.message.findUnique({ where: { id } })
    if (!msg) throw new NotFoundException('Message not found')
    await this.prisma.message.update({
      where: { id },
      data: { deleted: true, content: null }
    })
    if (msg.channelId) {
      this.events.emit('admin:message:delete', { messageId: id, channelId: msg.channelId })
    } else if (msg.directConversationId) {
      this.events.emit('admin:dm:delete', { messageId: id, conversationId: msg.directConversationId })
    }
  }

  // ─── Deleted Messages ───────────────────────────────────

  @Get('messages/deleted-stats')
  @UseGuards(AdminAuthGuard)
  async getDeletedMessageStats() {
    const messageCount = await this.prisma.message.count({ where: { deleted: true } })

    const attachmentAgg = await this.prisma.attachment.aggregate({
      where: { message: { deleted: true } },
      _count: { id: true },
      _sum: { sizeBytes: true }
    })

    return {
      messageCount,
      attachmentCount: attachmentAgg._count.id,
      totalSizeBytes: attachmentAgg._sum.sizeBytes ?? 0
    }
  }

  @Post('messages/purge-deleted')
  @UseGuards(AdminAuthGuard)
  async purgeDeletedMessages() {
    let purgedMessages = 0
    let purgedAttachments = 0
    let freedBytes = 0
    const batchSize = 100

    while (true) {
      const batch = await this.prisma.message.findMany({
        where: { deleted: true },
        take: batchSize,
        select: {
          id: true,
          attachments: {
            select: { url: true, thumbnailUrl: true, sizeBytes: true }
          }
        }
      })

      if (batch.length === 0) break

      for (const msg of batch) {
        for (const att of msg.attachments) {
          this.uploads.deleteFile(att.url)
          if (att.thumbnailUrl) this.uploads.deleteFile(att.thumbnailUrl)
          freedBytes += att.sizeBytes
          purgedAttachments++
        }
      }

      await this.prisma.message.deleteMany({
        where: { id: { in: batch.map((m) => m.id) } }
      })

      purgedMessages += batch.length
    }

    return { purgedMessages, purgedAttachments, freedBytes }
  }

  // ─── Webhooks Management ─────────────────────────────────

  @Get('webhooks')
  @UseGuards(AdminAuthGuard)
  async listWebhooks() {
    return this.prisma.webhook.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        channel: {
          select: {
            id: true,
            name: true,
            server: { select: { id: true, name: true } }
          }
        },
        createdBy: { select: { id: true, username: true } }
      }
    })
  }

  @Delete('webhooks/:id')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWebhook(@Param('id', ParseUUIDPipe) id: string) {
    const wh = await this.prisma.webhook.findUnique({ where: { id } })
    if (!wh) throw new NotFoundException('Webhook not found')
    await this.prisma.webhook.delete({ where: { id } })
  }

  // ─── Helpers ───────────────────────────────────────────────

  private async cleanupAndDeleteServer(serverId: string) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId }
    })
    if (!server) return

    if (server.iconUrl) {
      this.uploads.deleteFile(server.iconUrl)
    }

    const channelIds = await this.prisma.channel
      .findMany({ where: { serverId }, select: { id: true } })
      .then((chs) => chs.map((c) => c.id))

    const attachments = await this.prisma.attachment.findMany({
      where: { message: { channelId: { in: channelIds } } },
      select: { url: true, thumbnailUrl: true }
    })
    for (const a of attachments) {
      this.uploads.deleteFile(a.url)
      if (a.thumbnailUrl) this.uploads.deleteFile(a.thumbnailUrl)
    }

    const emojis = await this.prisma.customEmoji.findMany({
      where: { serverId },
      select: { imageUrl: true }
    })
    for (const e of emojis) {
      this.uploads.deleteFile(e.imageUrl)
    }

    await this.prisma.server.delete({ where: { id: serverId } })
  }

  @Post('push')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  async sendPush(@Body() body: { title: string; body: string; userIds?: string[] }) {
    if (!body.title || !body.body) {
      throw new BadRequestException('Title and body are required')
    }

    const payload = { title: body.title, body: body.body }

    if (body.userIds && body.userIds.length > 0) {
      await this.push.sendToUsers(body.userIds, payload)
      return { sent: body.userIds.length }
    }

    await this.push.sendToAll(payload)
    const count = await this.prisma.pushSubscription.count()
    return { sent: count }
  }
}
