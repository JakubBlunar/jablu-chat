import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { FriendsService } from './friends.service'
import { EventBusService } from '../events/event-bus.service'

@Controller('friends')
@UseGuards(UnifiedAuthGuard)
export class FriendsController {
  constructor(
    private readonly friends: FriendsService,
    private readonly events: EventBusService
  ) {}

  @Get()
  getFriends(@CurrentUser() user: { id: string }) {
    return this.friends.getFriends(user.id)
  }

  @Get('pending')
  getPending(@CurrentUser() user: { id: string }) {
    return this.friends.getPendingRequests(user.id)
  }

  @Get('status/:userId')
  getStatus(@CurrentUser() user: { id: string }, @Param('userId', ParseUUIDPipe) targetId: string) {
    return this.friends.getFriendshipBetween(user.id, targetId)
  }

  @Post('request')
  async sendRequest(@CurrentUser() user: { id: string }, @Body('userId', ParseUUIDPipe) targetId: string) {
    const friendship = await this.friends.sendRequest(user.id, targetId)
    this.events.emit('friend:request', {
      friendshipId: friendship.id,
      requester: friendship.requester,
      addressee: friendship.addressee
    })
    return { ok: true, friendshipId: friendship.id }
  }

  @Post(':id/accept')
  async accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    const friendship = await this.friends.acceptRequest(id, user.id)
    this.events.emit('friend:accepted', {
      friendshipId: friendship.id,
      requester: friendship.requester,
      addressee: friendship.addressee
    })
    return { ok: true }
  }

  @Delete(':id/decline')
  async decline(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    const result = await this.friends.declineRequest(id, user.id)
    this.events.emit('friend:declined', result)
    return { ok: true }
  }

  @Delete(':id/cancel')
  async cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    const result = await this.friends.cancelRequest(id, user.id)
    this.events.emit('friend:cancelled', result)
    return { ok: true }
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    const result = await this.friends.removeFriend(id, user.id)
    this.events.emit('friend:removed', result)
    return { ok: true }
  }
}
