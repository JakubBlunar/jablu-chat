import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelType, ServerRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { AdminAuthGuard } from './admin-auth.guard';
import {
  AdminCreateInviteDto,
  AdminCreateServerDto,
  AdminLoginDto,
  AdminUpdateUserDto,
} from './dto';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly uploads: UploadsService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: AdminLoginDto) {
    const password = this.config.get<string>('SUPERADMIN_PASSWORD', '');
    if (!password || dto.password !== password) {
      return { ok: false };
    }
    return { ok: true };
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

  // ─── Users ─────────────────────────────────────────────────

  @Get('users')
  @UseGuards(AdminAuthGuard)
  async listUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
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
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.bio !== undefined) data.bio = dto.bio || null;

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
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

    const code = randomBytes(4).toString('hex').toUpperCase();

    return this.prisma.registrationInvite.create({
      data: {
        code,
        email: dto.email.toLowerCase().trim(),
        serverId: dto.serverId ?? null,
      },
      include: {
        server: { select: { id: true, name: true } },
        usedBy: { select: { id: true, username: true } },
      },
    });
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
}
