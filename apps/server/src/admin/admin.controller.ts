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
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelType, ServerRole } from '@prisma/client';
import * as crypto from 'crypto';
import { MailService } from '../auth/mail.service';
import { CleanupService, StorageStats } from '../cleanup/cleanup.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { UploadsService } from '../uploads/uploads.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminRateLimiter } from './admin-rate-limiter';
import { AdminTokenStore } from './admin-token-store';
import {
  AdminAddServerMemberDto,
  AdminCreateInviteDto,
  AdminCreateServerDto,
  AdminLoginDto,
  AdminUpdateMemberRoleDto,
  AdminUpdateUserDto,
} from './dto';

function serializeAudit(audit: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(audit)) {
    result[key] = typeof value === 'bigint' ? value.toString() : value;
  }
  return result;
}

@Controller('admin')
export class AdminController {
  private readonly superadminUsername: string;
  private readonly superadminPassword: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly uploads: UploadsService,
    private readonly cleanup: CleanupService,
    private readonly push: PushService,
    private readonly mail: MailService,
    private readonly rateLimiter: AdminRateLimiter,
    private readonly tokenStore: AdminTokenStore,
  ) {
    this.superadminUsername = config.get<string>('SUPERADMIN_USERNAME', '');
    this.superadminPassword = config.get<string>('SUPERADMIN_PASSWORD', '');
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body() dto: AdminLoginDto,
    @Req() req: { ip?: string; headers: Record<string, string | undefined> },
  ) {
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip ?? 'unknown';

    const check = this.rateLimiter.check(ip);
    if (!check.allowed) {
      return { ok: false, retryAfter: check.retryAfter };
    }

    if (!this.superadminPassword || !this.superadminUsername) {
      return { ok: false };
    }

    const inputUser = Buffer.from(dto.username);
    const expectedUser = Buffer.from(this.superadminUsername);
    const userValid =
      inputUser.length === expectedUser.length &&
      crypto.timingSafeEqual(inputUser, expectedUser);

    const inputPass = Buffer.from(dto.password);
    const expectedPass = Buffer.from(this.superadminPassword);
    const passValid =
      inputPass.length === expectedPass.length &&
      crypto.timingSafeEqual(inputPass, expectedPass);

    const valid = userValid && passValid;

    if (!valid) {
      const result = this.rateLimiter.recordFailure(ip);
      return { ok: false, retryAfter: result.retryAfter };
    }

    this.rateLimiter.resetOnSuccess(ip);
    const token = this.tokenStore.create(ip);
    return { ok: true, token };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(
    @Headers('x-admin-token') token?: string,
  ) {
    if (token) this.tokenStore.revoke(token);
  }

  // ─── Servers ───────────────────────────────────────────────

  @Get('servers')
  @UseGuards(AdminAuthGuard)
  async listServers() {
    return this.prisma.server.findMany({
      include: {
        _count: { select: { members: true, channels: true } },
        owner: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('servers')
  @UseGuards(AdminAuthGuard)
  async createServer(@Body() dto: AdminCreateServerDto) {
    const owner = await this.prisma.user.findUnique({
      where: { id: dto.ownerUserId },
    });
    if (!owner) {
      throw new BadRequestException('User not found');
    }

    return this.prisma.server.create({
      data: {
        name: dto.name,
        ownerId: dto.ownerUserId,
        members: {
          create: { userId: dto.ownerUserId, role: ServerRole.owner },
        },
        channels: {
          create: [
            { name: 'general', type: ChannelType.text, position: 0 },
            { name: 'General', type: ChannelType.voice, position: 1 },
          ],
        },
      },
      include: {
        _count: { select: { members: true, channels: true } },
        owner: { select: { id: true, username: true } },
      },
    });
  }

  @Delete('servers/:id')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteServer(@Param('id', ParseUUIDPipe) id: string) {
    await this.cleanupAndDeleteServer(id);
  }

  @Get('servers/:id/members')
  @UseGuards(AdminAuthGuard)
  async listServerMembers(@Param('id', ParseUUIDPipe) id: string) {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) throw new NotFoundException('Server not found');

    return this.prisma.serverMember.findMany({
      where: { serverId: id },
      include: {
        user: {
          select: { id: true, username: true, email: true, avatarUrl: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  @Post('servers/:id/members')
  @UseGuards(AdminAuthGuard)
  async addServerMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminAddServerMemberDto,
  ) {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) throw new NotFoundException('Server not found');

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) throw new BadRequestException('User not found');

    const existing = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: dto.userId, serverId: id } },
    });
    if (existing) throw new BadRequestException('User is already a member');

    return this.prisma.serverMember.create({
      data: { userId: dto.userId, serverId: id, role: ServerRole.member },
      include: {
        user: {
          select: { id: true, username: true, email: true, avatarUrl: true },
        },
      },
    });
  }

  @Delete('servers/:id/members/:userId')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeServerMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) throw new NotFoundException('Server not found');

    if (server.ownerId === userId) {
      throw new BadRequestException('Cannot remove the server owner');
    }

    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: id } },
    });
    if (!member) throw new NotFoundException('Member not found');

    await this.prisma.serverMember.delete({
      where: { userId_serverId: { userId, serverId: id } },
    });
  }

  @Patch('servers/:id/members/:userId/role')
  @UseGuards(AdminAuthGuard)
  async updateMemberRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AdminUpdateMemberRoleDto,
  ) {
    const validRoles = [ServerRole.owner, ServerRole.admin, ServerRole.member];
    if (!validRoles.includes(dto.role as ServerRole)) {
      throw new BadRequestException('Invalid role');
    }

    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) throw new NotFoundException('Server not found');

    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: id } },
    });
    if (!member) throw new NotFoundException('Member not found');

    const newRole = dto.role as ServerRole;

    if (newRole === ServerRole.owner) {
      await this.prisma.$transaction([
        this.prisma.serverMember.update({
          where: { userId_serverId: { userId: server.ownerId, serverId: id } },
          data: { role: ServerRole.admin },
        }),
        this.prisma.serverMember.update({
          where: { userId_serverId: { userId, serverId: id } },
          data: { role: ServerRole.owner },
        }),
        this.prisma.server.update({
          where: { id },
          data: { ownerId: userId },
        }),
      ]);
    } else {
      if (server.ownerId === userId) {
        throw new BadRequestException(
          'Cannot demote the owner. Transfer ownership first by promoting another member to owner.',
        );
      }
      await this.prisma.serverMember.update({
        where: { userId_serverId: { userId, serverId: id } },
        data: { role: newRole },
      });
    }

    const members = await this.prisma.serverMember.findMany({
      where: { serverId: id },
      include: {
        user: {
          select: { id: true, username: true, email: true, avatarUrl: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const updatedServer = await this.prisma.server.findUnique({
      where: { id },
      select: { ownerId: true, owner: { select: { id: true, username: true } } },
    });

    return { members, owner: updatedServer?.owner, ownerId: updatedServer?.ownerId };
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
            messages: true,
          },
        },
      },
      orderBy: { username: 'asc' },
    });
  }

  @Patch('users/:id')
  @UseGuards(AdminAuthGuard)
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.username && dto.username !== user.username) {
      const existing = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (existing) throw new BadRequestException('Username already taken');
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) throw new BadRequestException('Email already in use');
    }

    const data: Record<string, unknown> = {};
    if (dto.username !== undefined) data.username = dto.username;
    if (dto.displayName !== undefined) data.displayName = dto.displayName || null;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.bio !== undefined) data.bio = dto.bio || null;

    return this.prisma.user.update({
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
            messages: true,
          },
        },
      },
    });
  }

  @Delete('users/:id')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, avatarUrl: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.avatarUrl) {
      this.uploads.deleteFile(user.avatarUrl);
    }

    const ownedServers = await this.prisma.server.findMany({
      where: { ownerId: id },
      select: { id: true },
    });
    for (const srv of ownedServers) {
      await this.cleanupAndDeleteServer(srv.id);
    }

    await this.prisma.user.delete({ where: { id } });
  }

  // ─── Registration Invites ─────────────────────────────────

  @Get('invites')
  @UseGuards(AdminAuthGuard)
  async listInvites() {
    return this.prisma.registrationInvite.findMany({
      include: {
        server: { select: { id: true, name: true } },
        usedBy: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('invites')
  @UseGuards(AdminAuthGuard)
  async createInvite(@Body() dto: AdminCreateInviteDto) {
    if (dto.serverId) {
      const server = await this.prisma.server.findUnique({
        where: { id: dto.serverId },
      });
      if (!server) throw new BadRequestException('Server not found');
    }

    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const email = dto.email.toLowerCase().trim();

    const invite = await this.prisma.registrationInvite.create({
      data: {
        code,
        email,
        serverId: dto.serverId ?? null,
      },
      include: {
        server: { select: { id: true, name: true } },
        usedBy: { select: { id: true, username: true } },
      },
    });

    const serverHost = this.config.get<string>('SERVER_HOST', 'localhost');
    const tlsMode = this.config.get<string>('TLS_MODE', 'off');
    const protocol = tlsMode === 'off' ? 'http' : 'https';
    const registerUrl = `${protocol}://${serverHost}/register?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`;

    void this.mail.sendInvite(email, code, registerUrl);

    return invite;
  }

  @Delete('invites/:id')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteInvite(@Param('id', ParseUUIDPipe) id: string) {
    const invite = await this.prisma.registrationInvite.findUnique({
      where: { id },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    await this.prisma.registrationInvite.delete({ where: { id } });
  }

  @Get('settings/registration')
  @UseGuards(AdminAuthGuard)
  getRegistrationMode() {
    const mode = this.config.get<string>('REGISTRATION_MODE', 'open');
    return { mode };
  }

  // ─── Storage ─────────────────────────────────────────────

  @Get('storage')
  @UseGuards(AdminAuthGuard)
  async getStorageStats(): Promise<StorageStats> {
    return this.cleanup.getStorageStats();
  }

  @Get('storage/audits')
  @UseGuards(AdminAuthGuard)
  async listAudits() {
    const audits = await this.cleanup.getAudits();
    return audits.map(serializeAudit);
  }

  @Post('storage/audit')
  @UseGuards(AdminAuthGuard)
  async runAudit() {
    const audit = await this.cleanup.runAudit();
    return serializeAudit(audit as unknown as Record<string, unknown>);
  }

  @Post('storage/cleanup/:id')
  @UseGuards(AdminAuthGuard)
  async executeCleanup(@Param('id', ParseUUIDPipe) id: string) {
    try {
      const audit = await this.cleanup.executeCleanup(id);
      return serializeAudit(audit as unknown as Record<string, unknown>);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Cleanup failed',
      );
    }
  }

  @Delete('storage/audits/:id')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAudit(@Param('id', ParseUUIDPipe) id: string) {
    try {
      await this.cleanup.deleteAudit(id);
    } catch {
      throw new NotFoundException('Audit not found');
    }
  }

  // ─── Audit Logs ───────────────────────────────────────────

  @Get('audit-logs')
  @UseGuards(AdminAuthGuard)
  async listAuditLogs(
    @Query('serverId') serverId?: string,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = Math.min(Math.max(parseInt(limitStr ?? '50', 10) || 50, 1), 100);

    const where: Record<string, unknown> = {};
    if (serverId) where.serverId = serverId;
    if (cursor) where.createdAt = { lt: new Date(cursor) };

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actor: { select: { id: true, username: true, displayName: true } },
        server: { select: { id: true, name: true } },
      },
    });

    return {
      logs,
      nextCursor: logs.length === limit ? logs[logs.length - 1].createdAt.toISOString() : null,
    };
  }

  // ─── User Sessions ──────────────────────────────────────

  @Get('users/:id/sessions')
  @UseGuards(AdminAuthGuard)
  async listUserSessions(@Param('id', ParseUUIDPipe) userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.refreshToken.findMany({
      where: { userId },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Delete('users/:id/sessions/:sessionId')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Param('id', ParseUUIDPipe) userId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    const token = await this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId },
    });
    if (!token) throw new NotFoundException('Session not found');
    await this.prisma.refreshToken.delete({ where: { id: sessionId } });
  }

  @Delete('users/:id/sessions')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAllSessions(@Param('id', ParseUUIDPipe) userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  // ─── Helpers ───────────────────────────────────────────────

  private async cleanupAndDeleteServer(serverId: string) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });
    if (!server) return;

    if (server.iconUrl) {
      this.uploads.deleteFile(server.iconUrl);
    }

    const channelIds = await this.prisma.channel
      .findMany({ where: { serverId }, select: { id: true } })
      .then((chs) => chs.map((c) => c.id));

    const attachments = await this.prisma.attachment.findMany({
      where: { message: { channelId: { in: channelIds } } },
      select: { url: true, thumbnailUrl: true },
    });
    for (const a of attachments) {
      this.uploads.deleteFile(a.url);
      if (a.thumbnailUrl) this.uploads.deleteFile(a.thumbnailUrl);
    }

    const emojis = await this.prisma.customEmoji.findMany({
      where: { serverId },
      select: { imageUrl: true },
    });
    for (const e of emojis) {
      this.uploads.deleteFile(e.imageUrl);
    }

    await this.prisma.server.delete({ where: { id: serverId } });
  }

  @Post('push')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.OK)
  async sendPush(
    @Body() body: { title: string; body: string; userIds?: string[] },
  ) {
    if (!body.title || !body.body) {
      throw new BadRequestException('Title and body are required');
    }

    const payload = { title: body.title, body: body.body };

    if (body.userIds && body.userIds.length > 0) {
      await this.push.sendToUsers(body.userIds, payload);
      return { sent: body.userIds.length };
    }

    await this.push.sendToAll(payload);
    const count = await this.prisma.pushSubscription.count();
    return { sent: count };
  }
}
