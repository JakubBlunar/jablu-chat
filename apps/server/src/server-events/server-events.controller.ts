import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { createEventSchema, updateEventSchema } from '@chat/shared'
import { CurrentUser } from '../auth/current-user.decorator'
import { ServerEventsService } from './server-events.service'

@Controller('servers/:serverId/events')
@UseGuards(AuthGuard('jwt'))
export class ServerEventsController {
  constructor(private readonly serverEvents: ServerEventsService) {}

  @Post()
  async create(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown
  ) {
    const parsed = createEventSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors)
    return this.serverEvents.create(serverId, user.id, parsed.data)
  }

  @Get()
  list(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string },
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('afterId') afterId?: string
  ) {
    return this.serverEvents.list(serverId, user.id, limit ? parseInt(limit, 10) || 10 : 10, cursor, afterId)
  }

  @Get(':eventId')
  getOne(
    @Param('serverId', ParseUUIDPipe) _serverId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.serverEvents.getOne(eventId, user.id)
  }

  @Put(':eventId')
  async update(
    @Param('serverId', ParseUUIDPipe) _serverId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: { id: string },
    @Body() body: unknown
  ) {
    const parsed = updateEventSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors)
    return this.serverEvents.update(eventId, user.id, parsed.data)
  }

  @Post(':eventId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('serverId', ParseUUIDPipe) _serverId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.serverEvents.cancel(eventId, user.id)
  }

  @Post(':eventId/interest')
  @HttpCode(HttpStatus.OK)
  toggleInterest(
    @Param('serverId', ParseUUIDPipe) _serverId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.serverEvents.toggleInterest(eventId, user.id)
  }

  @Get(':eventId/interested')
  getInterested(
    @Param('serverId', ParseUUIDPipe) _serverId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.serverEvents.getInterestedUsers(eventId, user.id)
  }
}
