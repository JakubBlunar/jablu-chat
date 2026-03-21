import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelType, ServerRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { AuditLogService } from './audit-log.service';

const memberUserSelect = {
  id: true,
  username: true,
  email: true,
  avatarUrl: true,
  bio: true,
  status: true,
} as const;

@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async getServerOrThrow(serverId: string) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    return server;
  }

  private async requireMembership(serverId: string, userId: string) {
    await this.getServerOrThrow(serverId);
    const membership = await this.prisma.serverMember.findUnique({
      where: {
        userId_serverId: { userId, serverId },
      },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this server');
    }
    return membership;
  }

  private async requireAdminOrOwner(serverId: string, userId: string) {
    const server = await this.getServerOrThrow(serverId);
    if (server.ownerId === userId) {
      return server;
    }
    const membership = await this.prisma.serverMember.findUnique({
      where: {
        userId_serverId: { userId, serverId },
      },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this server');
    }
    if (
      membership.role !== ServerRole.admin &&
      membership.role !== ServerRole.owner
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return server;
  }

  async createServer(userId: string, name: string) {
    return this.prisma.server.create({
      data: {
        name,
        ownerId: userId,
        members: {
          create: { userId, role: ServerRole.owner },
        },
        channels: {
          create: [
            { name: 'general', type: ChannelType.text, position: 0 },
            { name: 'General', type: ChannelType.voice, position: 1 },
          ],
        },
      },
      include: {
        channels: { orderBy: { position: 'asc' } },
        members: {
          include: {
            user: { select: memberUserSelect },
          },
        },
      },
    });
  }

  async getServers(userId: string) {
    const servers = await this.prisma.server.findMany({
      where: {
        members: { some: { userId } },
      },
      include: {
        _count: { select: { members: true } },
      },
      orderBy: { name: 'asc' },
    });
    return servers.map(({ _count, ...server }) => ({
      ...server,
      memberCount: _count.members,
    }));
  }

  async getServer(serverId: string, userId: string) {
    await this.requireMembership(serverId, userId);
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: {
        channels: { orderBy: { position: 'asc' } },
        members: {
          include: {
            user: { select: memberUserSelect },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    return server;
  }

  async updateServer(
    serverId: string,
    userId: string,
    data: { name?: string },
  ) {
    await this.requireAdminOrOwner(serverId, userId);
    if (data.name === undefined) {
      return this.getServer(serverId, userId);
    }
    const result = await this.prisma.server.update({
      where: { id: serverId },
      data: { name: data.name },
      include: {
        channels: { orderBy: { position: 'asc' } },
        members: {
          include: {
            user: { select: memberUserSelect },
          },
        },
      },
    });
    await this.auditLog.log(serverId, userId, 'server.update', 'server', serverId, `Renamed to "${data.name}"`);
    return result;
  }

  async uploadIcon(
    serverId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    const server = await this.requireAdminOrOwner(serverId, userId);
    if (server.iconUrl) {
      this.uploads.deleteFile(server.iconUrl);
    }
    const iconUrl = await this.uploads.saveAvatar(file);
    const result = await this.prisma.server.update({
      where: { id: serverId },
      data: { iconUrl },
    });
    await this.auditLog.log(serverId, userId, 'server.icon.update', 'server', serverId);
    return result;
  }

  async deleteIcon(serverId: string, userId: string) {
    const server = await this.requireAdminOrOwner(serverId, userId);
    if (server.iconUrl) {
      this.uploads.deleteFile(server.iconUrl);
    }
    return this.prisma.server.update({
      where: { id: serverId },
      data: { iconUrl: null },
    });
  }

  async updateMemberRole(
    serverId: string,
    actorId: string,
    targetUserId: string,
    newRole: ServerRole,
  ) {
    const server = await this.getServerOrThrow(serverId);
    if (server.ownerId !== actorId) {
      throw new ForbiddenException('Only the server owner can change member roles');
    }
    if (targetUserId === actorId) {
      throw new ForbiddenException('You cannot change your own role');
    }
    if (newRole === ServerRole.owner) {
      throw new ForbiddenException('Cannot assign the owner role');
    }
    const target = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: targetUserId, serverId } },
    });
    if (!target) {
      throw new NotFoundException('Member not found');
    }
    const result = await this.prisma.serverMember.update({
      where: { userId_serverId: { userId: targetUserId, serverId } },
      data: { role: newRole },
      include: { user: { select: memberUserSelect } },
    });
    await this.auditLog.log(serverId, actorId, 'member.role.update', 'user', targetUserId, `Role changed to ${newRole}`);
    return result;
  }

  async kickMember(serverId: string, actorId: string, targetUserId: string) {
    await this.requireAdminOrOwner(serverId, actorId);
    const server = await this.getServerOrThrow(serverId);
    if (targetUserId === server.ownerId) {
      throw new ForbiddenException('Cannot kick the server owner');
    }
    if (targetUserId === actorId) {
      throw new ForbiddenException('You cannot kick yourself');
    }
    const target = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: targetUserId, serverId } },
    });
    if (!target) {
      throw new NotFoundException('Member not found');
    }
    await this.prisma.serverMember.delete({
      where: { userId_serverId: { userId: targetUserId, serverId } },
    });
    await this.auditLog.log(serverId, actorId, 'member.kick', 'user', targetUserId);
  }

  async deleteServer(serverId: string, userId: string) {
    const server = await this.getServerOrThrow(serverId);
    if (server.ownerId !== userId) {
      throw new ForbiddenException('Only the server owner can delete the server');
    }

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

  async joinServer(serverId: string, userId: string) {
    await this.getServerOrThrow(serverId);
    const existing = await this.prisma.serverMember.findUnique({
      where: {
        userId_serverId: { userId, serverId },
      },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.serverMember.create({
      data: {
        userId,
        serverId,
        role: ServerRole.member,
      },
    });
  }

  async leaveServer(serverId: string, userId: string) {
    const server = await this.getServerOrThrow(serverId);
    const membership = await this.prisma.serverMember.findUnique({
      where: {
        userId_serverId: { userId, serverId },
      },
    });
    if (!membership) {
      throw new NotFoundException('You are not a member of this server');
    }
    if (server.ownerId === userId || membership.role === ServerRole.owner) {
      throw new ForbiddenException('The server owner cannot leave the server');
    }
    await this.prisma.serverMember.delete({
      where: {
        userId_serverId: { userId, serverId },
      },
    });
  }

  async getMembers(serverId: string, userId: string) {
    await this.requireMembership(serverId, userId);
    return this.prisma.serverMember.findMany({
      where: { serverId },
      include: {
        user: { select: memberUserSelect },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }
}
