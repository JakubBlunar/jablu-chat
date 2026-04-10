import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { InAppNotificationsService } from './in-app-notifications.service'

@Controller('notifications')
@UseGuards(UnifiedAuthGuard)
export class InAppNotificationsController {
  constructor(private readonly notifications: InAppNotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: { id: string },
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string
  ) {
    const take = limit ? parseInt(limit, 10) : undefined
    return this.notifications.list(user.id, take, cursor)
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: { id: string }) {
    return this.notifications.unreadCount(user.id).then((count) => ({ count }))
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: { id: string }) {
    return this.notifications.markAllRead(user.id)
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.id, id)
  }
}
