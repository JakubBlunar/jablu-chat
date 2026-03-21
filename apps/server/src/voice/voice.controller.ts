import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChannelType } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from './voice.service';

@Controller('voice')
@UseGuards(AuthGuard('jwt'))
export class VoiceController {
  constructor(
    private readonly voice: VoiceService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('token/:channelId')
  async getToken(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string; username: string },
  ) {
    if (!this.voice.isConfigured) {
      throw new ServiceUnavailableException('Voice is not configured');
    }

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });
    if (!channel || channel.type !== ChannelType.voice) {
      throw new ForbiddenException('Not a voice channel');
    }

    const membership = await this.prisma.serverMember.findUnique({
      where: {
        userId_serverId: { userId: user.id, serverId: channel.serverId },
      },
    });
    if (!membership) {
      throw new ForbiddenException('Not a server member');
    }

    const isAdmin =
      membership.role === 'admin' || membership.role === 'owner';

    const result = await this.voice.generateToken(
      user.id,
      user.username,
      channelId,
      isAdmin,
    );
    return { ...result, isAdmin };
  }

  @Get('status')
  status() {
    return { configured: this.voice.isConfigured };
  }
}
