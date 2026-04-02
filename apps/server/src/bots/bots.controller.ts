import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common'
import { CurrentUser } from '../auth/current-user.decorator'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { BotRateLimiterGuard } from './bot-rate-limiter'
import { BotsService } from './bots.service'
import { AddBotToServerDto, CreateBotDto, SyncCommandsDto, UpdateBotDto } from './dto'

@Controller()
@UseGuards(BotRateLimiterGuard)
export class BotsController {
  constructor(private readonly bots: BotsService) {}

  @Post('bots')
  @UseGuards(UnifiedAuthGuard)
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateBotDto
  ) {
    return this.bots.createBot(user.id, dto.username, dto.displayName, dto.description, dto.public)
  }

  @Get('bots')
  @UseGuards(UnifiedAuthGuard)
  listOwn(@CurrentUser() user: { id: string }) {
    return this.bots.listOwnBots(user.id)
  }

  @Get('bots/search')
  @UseGuards(UnifiedAuthGuard)
  search(
    @Query('q') query: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.bots.searchBots(query ?? '', user.id)
  }

  @Get('bots/:id')
  @UseGuards(UnifiedAuthGuard)
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.bots.getBot(id, user.id)
  }

  @Patch('bots/:id')
  @UseGuards(UnifiedAuthGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateBotDto
  ) {
    return this.bots.updateBot(id, user.id, dto)
  }

  @Delete('bots/:id')
  @UseGuards(UnifiedAuthGuard)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string }
  ) {
    await this.bots.deleteBot(id, user.id)
  }

  @Post('bots/:id/regenerate-token')
  @UseGuards(UnifiedAuthGuard)
  regenerateToken(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.bots.regenerateToken(id, user.id)
  }

  @Post('servers/:serverId/bots')
  @UseGuards(UnifiedAuthGuard)
  addToServer(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: AddBotToServerDto
  ) {
    return this.bots.addBotToServer(serverId, user.id, dto.username)
  }

  @Delete('servers/:serverId/bots/:botUserId')
  @UseGuards(UnifiedAuthGuard)
  async removeFromServer(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('botUserId', ParseUUIDPipe) botUserId: string,
    @CurrentUser() user: { id: string }
  ) {
    await this.bots.removeBotFromServer(serverId, user.id, botUserId)
  }

  @Get('servers/:serverId/bots')
  @UseGuards(UnifiedAuthGuard)
  listServerBots(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.bots.listServerBots(serverId, user.id)
  }

  @Put('bots/@me/commands')
  @UseGuards(UnifiedAuthGuard)
  syncCommands(
    @CurrentUser() user: { id: string; botAppId?: string },
    @Body() dto: SyncCommandsDto
  ) {
    const botAppId = user.botAppId
    if (!botAppId) {
      throw new ForbiddenException('This endpoint is only available for bot tokens')
    }
    return this.bots.syncCommands(botAppId, dto.commands)
  }

  @Get('servers/:serverId/bot-commands')
  @UseGuards(UnifiedAuthGuard)
  getServerBotCommands(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string },
    @Query('channelId') channelId?: string
  ) {
    return this.bots.getServerBotCommands(serverId, channelId, user.id)
  }

  @Get('bots/user/:botUserId/commands')
  @UseGuards(UnifiedAuthGuard)
  getBotUserCommands(
    @Param('botUserId', ParseUUIDPipe) botUserId: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.bots.getBotUserCommands(botUserId, user.id)
  }
}
