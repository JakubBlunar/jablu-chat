import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ServerRole } from '@prisma/client';
import crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const createdByUserSelect = {
  id: true,
  username: true,
  email: true,
  avatarUrl: true,
} as const;

function generateInviteCode(): string {
  return crypto.randomBytes(6).toString('base64url').slice(0, 8);
}

@Injectable()
export class InvitesService {
  constructor(private readonly prisma: PrismaService) {}

  private async getServerOrThrow(serverId: string) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    return server;
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

  async createInvite(
    serverId: string,
    userId: string,
    maxUses?: number,
    expiresInHours?: number,
  ) {
    await this.requireAdminOrOwner(serverId, userId);

    const expiresAt =
      expiresInHours !== undefined
        ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
        : undefined;

    for (let attempt = 0; attempt < 20; attempt++) {
      const code = generateInviteCode();
      try {
        return await this.prisma.invite.create({
          data: {
            serverId,
            createdById: userId,
            code,
            maxUses: maxUses ?? null,
            expiresAt: expiresAt ?? null,
          },
          include: {
            server: { select: { name: true } },
          },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          continue;
        }
        throw e;
      }
    }
    throw new ConflictException('Could not generate a unique invite code');
  }

  async getInvites(serverId: string, userId: string) {
    await this.requireAdminOrOwner(serverId, userId);
    return this.prisma.invite.findMany({
      where: { serverId },
      include: {
        createdBy: { select: createdByUserSelect },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteInvite(inviteId: string, userId: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { id: inviteId },
    });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    await this.requireAdminOrOwner(invite.serverId, userId);
    await this.prisma.invite.delete({ where: { id: inviteId } });
  }

  async useInvite(code: string, userId: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: { server: true },
    });
    if (!invite) {
      throw new NotFoundException('Invalid invite code');
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new ForbiddenException('This invite has expired');
    }
    if (
      invite.maxUses !== null &&
      invite.useCount >= invite.maxUses
    ) {
      throw new ForbiddenException('This invite has reached its use limit');
    }

    const existing = await this.prisma.serverMember.findUnique({
      where: {
        userId_serverId: { userId, serverId: invite.serverId },
      },
    });
    if (existing) {
      throw new ConflictException('You are already a member of this server');
    }

    await this.prisma.$transaction([
      this.prisma.serverMember.create({
        data: {
          userId,
          serverId: invite.serverId,
          role: ServerRole.member,
        },
      }),
      this.prisma.invite.update({
        where: { id: invite.id },
        data: { useCount: { increment: 1 } },
      }),
    ]);

    const server = await this.prisma.server.findUnique({
      where: { id: invite.serverId },
      include: {
        channels: { orderBy: { position: 'asc' } },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                avatarUrl: true,
              },
            },
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
}
