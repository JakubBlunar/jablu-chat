import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Permission } from '@chat/shared'
import crypto from 'node:crypto'
import { EventBusService } from '../events/event-bus.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { AuditLogService } from '../servers/audit-log.service'

const createdByUserSelect = {
  id: true,
  username: true,
  email: true,
  avatarUrl: true
} as const

function generateInviteCode(): string {
  return crypto.randomBytes(6).toString('base64url').slice(0, 8)
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly events: EventBusService,
    private readonly roles: RolesService
  ) {}

  private async getServerOrThrow(serverId: string) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId }
    })
    if (!server) {
      throw new NotFoundException('Server not found')
    }
    return server
  }

  async createInvite(serverId: string, userId: string, maxUses?: number, expiresInMinutes?: number) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_SERVER)

    const expiresAt = expiresInMinutes !== undefined ? new Date(Date.now() + expiresInMinutes * 60 * 1000) : undefined

    for (let attempt = 0; attempt < 20; attempt++) {
      const code = generateInviteCode()
      try {
        const invite = await this.prisma.invite.create({
          data: {
            serverId,
            createdById: userId,
            code,
            maxUses: maxUses ?? null,
            expiresAt: expiresAt ?? null
          },
          include: {
            server: { select: { name: true } }
          }
        })
        await this.auditLog.log(serverId, userId, 'invite.create', 'invite', invite.id, `Code: ${code}`)
        return invite
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          continue
        }
        throw e
      }
    }
    throw new ConflictException('Could not generate a unique invite code')
  }

  async getInvites(serverId: string, userId: string) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_SERVER)
    return this.prisma.invite.findMany({
      where: { serverId },
      include: {
        createdBy: { select: createdByUserSelect }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  async deleteInvite(inviteId: string, userId: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { id: inviteId }
    })
    if (!invite) {
      throw new NotFoundException('Invite not found')
    }
    await this.roles.requirePermission(invite.serverId, userId, Permission.MANAGE_SERVER)
    await this.prisma.invite.delete({ where: { id: inviteId } })
    await this.auditLog.log(invite.serverId, userId, 'invite.delete', 'invite', inviteId, `Code: ${invite.code}`)
  }

  async resolveVanity(code: string) {
    const server = await this.prisma.server.findUnique({
      where: { vanityCode: code },
      select: {
        id: true,
        name: true,
        iconUrl: true,
        _count: { select: { members: true } }
      }
    })
    if (!server) throw new NotFoundException('Server not found')
    const { _count, ...rest } = server
    return { ...rest, memberCount: _count.members }
  }

  async joinVanity(code: string, userId: string) {
    const server = await this.prisma.server.findUnique({
      where: { vanityCode: code },
      select: { id: true, onboardingEnabled: true }
    })
    if (!server) throw new NotFoundException('Server not found')

    const existing = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: server.id } }
    })
    if (existing) throw new ConflictException('You are already a member of this server')

    const member = await this.prisma.serverMember.create({
      data: { userId, serverId: server.id, onboardingCompleted: !server.onboardingEnabled },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, status: true } }
      }
    })
    this.events.emit('member:joined', { serverId: server.id, member })

    return this.prisma.server.findUnique({
      where: { id: server.id },
      include: {
        channels: { orderBy: { position: 'asc' } },
        members: {
          include: { user: { select: { id: true, username: true, email: true, avatarUrl: true } } },
          orderBy: { joinedAt: 'asc' }
        }
      }
    })
  }

  async useInvite(code: string, userId: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: { server: true }
    })
    if (!invite) {
      throw new NotFoundException('Invalid invite code')
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new ForbiddenException('This invite has expired')
    }
    if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
      throw new ForbiddenException('This invite has reached its use limit')
    }

    const existing = await this.prisma.serverMember.findUnique({
      where: {
        userId_serverId: { userId, serverId: invite.serverId }
      }
    })
    if (existing) {
      throw new ConflictException('You are already a member of this server')
    }

    await this.prisma.$transaction([
      this.prisma.serverMember.create({
        data: {
          userId,
          serverId: invite.serverId,
          onboardingCompleted: !invite.server.onboardingEnabled
        }
      }),
      this.prisma.invite.update({
        where: { id: invite.id },
        data: { useCount: { increment: 1 } }
      })
    ])

    const newMember = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: invite.serverId } },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, status: true }
        }
      }
    })
    if (newMember) {
      this.events.emit('member:joined', { serverId: invite.serverId, member: newMember })
    }

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
                avatarUrl: true
              }
            }
          },
          orderBy: { joinedAt: 'asc' }
        }
      }
    })
    if (!server) {
      throw new NotFoundException('Server not found')
    }
    return server
  }
}
