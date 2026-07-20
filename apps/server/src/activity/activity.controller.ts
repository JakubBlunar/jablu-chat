import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards
} from '@nestjs/common'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { ActivityService } from './activity.service'
import {
  UpdateActivitySettingsDto,
  UpdateRegisteredGameDto,
  UploadActivityIconDto,
  UpsertRegisteredGameDto
} from './dto'

@Controller('activity')
@UseGuards(UnifiedAuthGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get('settings')
  getSettings(@CurrentUser() user: { id: string }) {
    return this.activity.getSettings(user.id)
  }

  @Patch('settings')
  updateSettings(@CurrentUser() user: { id: string }, @Body() dto: UpdateActivitySettingsDto) {
    return this.activity.updateSettings(user.id, dto)
  }

  @Get('games')
  listGames(@CurrentUser() user: { id: string }) {
    return this.activity.listGames(user.id)
  }

  @Post('games')
  upsertGame(@CurrentUser() user: { id: string }, @Body() dto: UpsertRegisteredGameDto) {
    return this.activity.upsertGame(user.id, dto)
  }

  @Patch('games/:id')
  updateGame(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRegisteredGameDto
  ) {
    return this.activity.updateGame(user.id, id, dto)
  }

  @Delete('games/:id')
  async deleteGame(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string) {
    await this.activity.deleteGame(user.id, id)
    return { ok: true }
  }

  @Get('detectables')
  getDetectables() {
    return this.activity.getDetectables()
  }

  @Get('steam/:appId')
  resolveSteam(@Param('appId') appId: string) {
    return this.activity.resolveSteam(appId)
  }

  @Post('icon')
  saveIcon(@Body() dto: UploadActivityIconDto) {
    return this.activity.saveIcon(dto.dataUrl, dto.key)
  }
}
