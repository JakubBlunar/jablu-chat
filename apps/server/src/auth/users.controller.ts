import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { PrismaService } from '../prisma/prisma.service'
import { CurrentUser } from './current-user.decorator'

@Controller('users')
@UseGuards(AuthGuard('jwt'))
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
        channels: {
          where: { type: 'text' },
          select: { id: true, name: true },
          orderBy: { position: 'asc' }
        }
      },
      orderBy: { name: 'asc' }
    })

    return { servers: mutualServers }
  }
}
