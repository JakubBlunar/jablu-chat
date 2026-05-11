import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { XpService } from './xp.service'

@Controller('servers/:serverId')
@UseGuards(UnifiedAuthGuard)
export class XpController {
  constructor(private readonly xp: XpService) {}

  @Get('xp/leaderboard')
  leaderboard(
    @Param('serverId', new ParseUUIDPipe()) serverId: string,
    @CurrentUser() user: { id: string },
    @Query('limit') limitStr?: string
  ) {
    const limit = limitStr ? Number(limitStr) : undefined
    return this.xp.getLeaderboard(
      serverId,
      user.id,
      Number.isFinite(limit) ? (limit as number) : undefined
    )
  }

  @Get('members/:userId/xp')
  async memberProgress(
    @Param('serverId', new ParseUUIDPipe()) serverId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string
  ) {
    return this.xp.getMemberProgress(serverId, userId)
  }

  @Get('xp/me')
  async selfProgress(
    @Param('serverId', new ParseUUIDPipe()) serverId: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.xp.getMemberProgress(serverId, user.id)
  }
}
