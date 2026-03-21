import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReadStateService } from './read-state.service';

@Controller()
@UseGuards(AuthGuard('jwt'))
export class ReadStateController {
  constructor(private readonly readState: ReadStateService) {}

  @Get('read-states')
  getAll(@Request() req: { user: { id: string } }) {
    return this.readState.getAllForUser(req.user.id);
  }

  @Put('channels/:id/ack')
  async ackChannel(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) channelId: string,
  ) {
    await this.readState.ackChannel(req.user.id, channelId);
    return { ok: true };
  }

  @Put('dm/:id/ack')
  async ackDm(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) conversationId: string,
  ) {
    await this.readState.ackDm(req.user.id, conversationId);
    return { ok: true };
  }
}
