import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsEnum } from 'class-validator';
import { NotifLevel } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

class SetNotifPrefDto {
  @IsEnum(NotifLevel)
  level!: NotifLevel;
}

@Controller('notif-prefs')
@UseGuards(AuthGuard('jwt'))
export class BulkNotifPrefsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('mine')
  async getAll(@CurrentUser() user: { id: string }) {
    const prefs = await this.prisma.channelNotifPref.findMany({
      where: { userId: user.id },
    });
    const map: Record<string, string> = {};
    for (const p of prefs) map[p.channelId] = p.level;
    return { prefs: map };
  }
}

@Controller('channels/:channelId/notifications')
@UseGuards(AuthGuard('jwt'))
export class NotifPrefsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string },
  ) {
    const pref = await this.prisma.channelNotifPref.findUnique({
      where: { userId_channelId: { userId: user.id, channelId } },
    });
    return { level: pref?.level ?? 'all' };
  }

  @Put()
  async set(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SetNotifPrefDto,
  ) {
    const pref = await this.prisma.channelNotifPref.upsert({
      where: { userId_channelId: { userId: user.id, channelId } },
      update: { level: dto.level },
      create: { userId: user.id, channelId, level: dto.level },
    });
    return pref;
  }

  @Delete()
  async reset(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string },
  ) {
    await this.prisma.channelNotifPref
      .delete({
        where: { userId_channelId: { userId: user.id, channelId } },
      })
      .catch(() => {});
    return { level: 'all' };
  }
}
