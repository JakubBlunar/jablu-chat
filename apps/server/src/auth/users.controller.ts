import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { UnifiedAuthGuard } from './unified-auth.guard'
import { PrismaService } from '../prisma/prisma.service'
import { CurrentUser } from './current-user.decorator'

@Controller('users')
@UseGuards(UnifiedAuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

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
