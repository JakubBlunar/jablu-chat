import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateDmDto, CreateGroupDmDto } from './dto';
import { DmService } from './dm.service';

@Controller('dm')
@UseGuards(AuthGuard('jwt'))
export class DmController {
  constructor(private readonly dm: DmService) {}

  @Get()
  listConversations(@CurrentUser() user: { id: string }) {
    return this.dm.getConversations(user.id);
  }

  @Post()
  createDm(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateDmDto,
  ) {
    return this.dm.findOrCreateDm(user.id, dto.recipientId);
  }

  @Post('group')
  createGroupDm(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateGroupDmDto,
  ) {
    return this.dm.createGroupDm(user.id, dto.memberIds, dto.groupName);
  }

  @Get(':id')
  getConversation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.dm.getConversation(id, user.id);
  }

  @Get(':id/messages')
  getMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('around') around?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    if (around) {
      return this.dm.getMessagesAround(id, user.id, around, parsedLimit);
    }
    return this.dm.getMessages(id, user.id, cursor, parsedLimit);
  }
}
