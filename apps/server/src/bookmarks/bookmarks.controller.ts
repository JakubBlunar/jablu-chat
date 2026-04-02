import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards
} from '@nestjs/common'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { BookmarksService } from './bookmarks.service'

@Controller('bookmarks')
@UseGuards(UnifiedAuthGuard)
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Post()
  toggle(
    @CurrentUser() user: { id: string },
    @Body() body: { messageId: string; note?: string }
  ) {
    return this.bookmarks.toggle(user.id, body.messageId, body.note)
  }

  @Get()
  list(
    @CurrentUser() user: { id: string },
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string
  ) {
    return this.bookmarks.list(user.id, cursor, limit ? parseInt(limit, 10) : undefined)
  }

  @Get('ids')
  listIds(@CurrentUser() user: { id: string }) {
    return this.bookmarks.listIds(user.id)
  }

  @Get('check/:messageId')
  check(
    @CurrentUser() user: { id: string },
    @Param('messageId', ParseUUIDPipe) messageId: string
  ) {
    return this.bookmarks.check(user.id, messageId)
  }

  @Delete(':messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: { id: string },
    @Param('messageId', ParseUUIDPipe) messageId: string
  ) {
    await this.bookmarks.remove(user.id, messageId)
  }
}
