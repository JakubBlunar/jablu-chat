import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { CurrentUser } from '../auth/current-user.decorator'
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
@UseGuards(AuthGuard('jwt'))
export class PollsController {
  constructor(private readonly polls: PollsService) {}

  @Post('channels/:channelId/polls')
  createPoll(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreatePollDto
  ) {
    return this.polls.createPoll(
      channelId,
      user.id,
      dto.question,
      dto.options,
      dto.multiSelect ?? false,
      dto.expiresAt
    )
  }

  @Post('polls/:pollId/vote')
  votePoll(
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: VotePollDto
  ) {
    return this.polls.votePoll(pollId, dto.optionId, user.id)
  }

  @Get('polls/:pollId')
  getPoll(
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.polls.getPoll(pollId, user.id)
  }
}
