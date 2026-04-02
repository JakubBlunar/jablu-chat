import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { EventBusService } from '../events/event-bus.service'
import { PollsService } from './polls.service'

class CreatePollDto {
  question!: string
  options!: string[]
  multiSelect?: boolean
  expiresAt?: string
}

class VotePollDto {
  optionId!: string
}

@Controller()
@UseGuards(UnifiedAuthGuard)
export class PollsController {
  constructor(
    private readonly polls: PollsService,
    private readonly events: EventBusService
  ) {}

  @Post('channels/:channelId/polls')
  async createPoll(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreatePollDto
  ) {
    const result = await this.polls.createPoll(
      channelId,
      user.id,
      dto.question,
      dto.options,
      dto.multiSelect ?? false,
      dto.expiresAt
    )
    this.events.emit('rest:message:created', { channelId, message: result })
    return result
  }

  @Post('polls/:pollId/vote')
  async votePoll(
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: VotePollDto
  ) {
    const result = await this.polls.votePoll(pollId, dto.optionId, user.id)
    if (result.channelId) {
      this.events.emit('rest:poll:voted', { channelId: result.channelId, poll: result.poll })
    }
    return result
  }

  @Get('polls/:pollId')
  getPoll(
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.polls.getPoll(pollId, user.id)
  }
}
