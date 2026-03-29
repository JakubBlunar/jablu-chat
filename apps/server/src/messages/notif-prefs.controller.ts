import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { IsEnum } from 'class-validator'
import { NotifLevel } from '@prisma/client'
import { CurrentUser } from '../auth/current-user.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'

class SetNotifPrefDto {
  @IsEnum(NotifLevel)
  level!: NotifLevel
}

@Controller('notif-prefs')
@UseGuards(AuthGuard('jwt'))
export class BulkNotifPrefsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('mine')
  async getAll(@CurrentUser() user: { id: string }) {
    const [channelPrefs, memberships] = await Promise.all([
      this.prisma.channelNotifPref.findMany({ where: { userId: user.id } }),
      this.prisma.serverMember.findMany({
        where: { userId: user.id, notifLevel: { not: null } },
        select: { serverId: true, notifLevel: true }
      })
    ])
    const prefs: Record<string, string> = {}
    for (const p of channelPrefs) prefs[p.channelId] = p.level
    const serverPrefs: Record<string, string> = {}
    for (const m of memberships) {
      if (m.notifLevel) serverPrefs[m.serverId] = m.notifLevel
    }
    return { prefs, serverPrefs }
  }
}

@Controller('servers/:serverId/notifications')
@UseGuards(AuthGuard('jwt'))
export class ServerNotifPrefsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@Param('serverId', ParseUUIDPipe) serverId: string, @CurrentUser() user: { id: string }) {
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: user.id, serverId } },
      select: { notifLevel: true }
    })
    return { level: member?.notifLevel ?? 'all' }
  }

  @Put()
  async set(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SetNotifPrefDto
  ) {
    await this.prisma.serverMember.update({
      where: { userId_serverId: { userId: user.id, serverId } },
      data: { notifLevel: dto.level }
    })
    return { level: dto.level }
  }

  @Delete()
  async reset(@Param('serverId', ParseUUIDPipe) serverId: string, @CurrentUser() user: { id: string }) {
    await this.prisma.serverMember.update({
      where: { userId_serverId: { userId: user.id, serverId } },
      data: { notifLevel: null }
    })
    return { level: 'all' }
  }
}

@Controller('channels/:channelId/notifications')
@UseGuards(AuthGuard('jwt'))
export class NotifPrefsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  @Get()
  async get(@Param('channelId', ParseUUIDPipe) channelId: string, @CurrentUser() user: { id: string }) {
    const pref = await this.prisma.channelNotifPref.findUnique({
      where: { userId_channelId: { userId: user.id, channelId } }
    })
    return { level: pref?.level ?? 'all' }
  }

  @Put()
  async set(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SetNotifPrefDto
  ) {
    const pref = await this.prisma.channelNotifPref.upsert({
      where: { userId_channelId: { userId: user.id, channelId } },
      update: { level: dto.level },
      create: { userId: user.id, channelId, level: dto.level }
    })
    await this.redis.client.del(`notifprefs:${channelId}`).catch(() => {})
    return pref
  }

  @Delete()
  async reset(@Param('channelId', ParseUUIDPipe) channelId: string, @CurrentUser() user: { id: string }) {
    await this.prisma.channelNotifPref
      .delete({
        where: { userId_channelId: { userId: user.id, channelId } }
      })
      .catch(() => {})
    await this.redis.client.del(`notifprefs:${channelId}`).catch(() => {})
    return { level: 'all' }
  }
}
