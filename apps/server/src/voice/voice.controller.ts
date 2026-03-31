import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  ServiceUnavailableException,
  UseGuards
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ChannelType } from '@prisma/client'
import { Permission } from '@chat/shared'
import { CurrentUser } from '../auth/current-user.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { VoiceService } from './voice.service'

@Controller('voice')
@UseGuards(AuthGuard('jwt'))
export class VoiceController {
  constructor(
    private readonly voice: VoiceService,
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
  ) {}

  @Post('token/:channelId')
  async getToken(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string; username: string }
  ) {
    if (!this.voice.isConfigured) {
      throw new ServiceUnavailableException('Voice is not configured')
    }

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId }
    })
    if (!channel || channel.type !== ChannelType.voice) {
      throw new ForbiddenException('Not a voice channel')
    }

    await this.roles.requireChannelPermission(channel.serverId, channelId, user.id, Permission.VIEW_CHANNEL)

    const result = await this.voice.generateToken(user.id, user.username, channelId)
    return result
  }

  @Get('status')
  status() {
    return { configured: this.voice.isConfigured }
  }

  @Get('volumes')
  async getVolumes(@CurrentUser() user: { id: string }) {
    const rows = await this.prisma.userVolumeSetting.findMany({
      where: { listenerId: user.id }
    })
    const map: Record<string, number> = {}
    for (const r of rows) {
      map[r.targetUserId] = r.volume
    }
    return map
  }

  @Put('volumes/:targetUserId')
  async setVolume(
    @CurrentUser() user: { id: string },
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
    @Body() body: { volume: number }
  ) {
    const raw = typeof body.volume === 'number' && Number.isFinite(body.volume) ? body.volume : 100
    const vol = Math.round(Math.max(0, Math.min(200, raw)))
    if (vol === 100) {
      await this.prisma.userVolumeSetting.deleteMany({
        where: { listenerId: user.id, targetUserId }
      })
    } else {
      await this.prisma.userVolumeSetting.upsert({
        where: {
          listenerId_targetUserId: {
            listenerId: user.id,
            targetUserId
          }
        },
        create: { listenerId: user.id, targetUserId, volume: vol },
        update: { volume: vol }
      })
    }
    return { targetUserId, volume: vol }
  }

  @Delete('volumes/:targetUserId')
  async resetVolume(
    @CurrentUser() user: { id: string },
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string
  ) {
    await this.prisma.userVolumeSetting.deleteMany({
      where: { listenerId: user.id, targetUserId }
    })
    return { targetUserId, volume: 100 }
  }
}
