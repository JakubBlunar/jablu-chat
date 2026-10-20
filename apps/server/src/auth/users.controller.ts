import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common'
import { IsArray } from 'class-validator'
import { isServerLayout, reconcileServerLayout } from '@chat/shared'
import { UnifiedAuthGuard } from './unified-auth.guard'
import { PrismaService } from '../prisma/prisma.service'
import { CurrentUser } from './current-user.decorator'

export class UpdateServerLayoutDto {
  @IsArray()
  entries: unknown[]
}

@Controller('users')
@UseGuards(UnifiedAuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('@me/server-layout')
  async getServerLayout(@CurrentUser() user: { id: string }) {
    const [account, memberships] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { serverLayout: true } }),
      this.prisma.serverMember.findMany({
        where: { userId: user.id }, select: { serverId: true }, orderBy: { server: { name: 'asc' } }
      })
    ])
    if (!isServerLayout(account.serverLayout)) throw new BadRequestException('Invalid stored server layout')
    return reconcileServerLayout(account.serverLayout, memberships.map((m) => m.serverId))
  }

  @Put('@me/server-layout')
  async updateServerLayout(@CurrentUser() user: { id: string }, @Body() dto: UpdateServerLayoutDto) {
    if (!isServerLayout(dto.entries)) throw new BadRequestException('Invalid server layout')
    const memberships = await this.prisma.serverMember.findMany({
      where: { userId: user.id }, select: { serverId: true }, orderBy: { server: { name: 'asc' } }
    })
    const allowed = new Set(memberships.map((m) => m.serverId))
    for (const entry of dto.entries) {
      const ids = entry.type === 'server' ? [entry.serverId] : entry.serverIds
      if (ids.some((id) => !allowed.has(id))) throw new BadRequestException('Layout contains a server you have not joined')
    }
    const entries = reconcileServerLayout(dto.entries, memberships.map((m) => m.serverId))
    await this.prisma.user.update({ where: { id: user.id }, data: { serverLayout: entries } })
    return entries
  }

  @Get(':id/mutual-servers')
  async getMutualServers(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) targetId: string) {
    const myMemberships = await this.prisma.serverMember.findMany({
      where: { userId: user.id },
      select: { serverId: true }
    })

    const mutualServers = await this.prisma.server.findMany({
      where: {
        id: { in: myMemberships.map((m) => m.serverId) },
        members: { some: { userId: targetId } }
      },
      select: {
        id: true,
        name: true,
        iconUrl: true,
      },
      orderBy: { name: 'asc' }
    })

    return { servers: mutualServers }
  }

  @Get(':id/mutual-friends')
  async getMutualFriends(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) targetId: string) {
    const myFriends = await this.prisma.friendship.findMany({
      where: { status: 'accepted', OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
      select: { requesterId: true, addresseeId: true }
    })
    const myFriendIds = new Set(myFriends.map((f) => f.requesterId === user.id ? f.addresseeId : f.requesterId))

    const targetFriends = await this.prisma.friendship.findMany({
      where: { status: 'accepted', OR: [{ requesterId: targetId }, { addresseeId: targetId }] },
      select: { requesterId: true, addresseeId: true }
    })
    const targetFriendIds = new Set(targetFriends.map((f) => f.requesterId === targetId ? f.addresseeId : f.requesterId))

    const mutualIds = [...myFriendIds].filter((id) => targetFriendIds.has(id))

    if (mutualIds.length === 0) return { friends: [] }

    const users = await this.prisma.user.findMany({
      where: { id: { in: mutualIds } },
      select: { id: true, username: true, displayName: true, avatarUrl: true, status: true }
    })
    return { friends: users }
  }
}
