import { Body, Controller, Delete, Get, HttpCode, Post, Put, Query, UseGuards } from '@nestjs/common'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { InboxService } from './inbox.service'

@Controller('inbox')
@UseGuards(UnifiedAuthGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  page(@CurrentUser() user: { id: string }, @Query() query: unknown) {
    return this.inbox.page(user.id, query)
  }

  @Get('session')
  session(@CurrentUser() user: { id: string }) {
    return this.inbox.getSession(user.id)
  }

  @Post('session')
  @HttpCode(200)
  start(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    return this.inbox.startSession(user.id, body)
  }

  @Put('session/anchor')
  anchor(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    return this.inbox.anchor(user.id, body)
  }

  @Post('session/advance')
  @HttpCode(200)
  advance(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    return this.inbox.advance(user.id, body)
  }

  @Put('later')
  later(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    return this.inbox.saveLater(user.id, body)
  }

  @Delete('later')
  removeLater(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    return this.inbox.removeLater(user.id, body)
  }

  @Post('read')
  @HttpCode(200)
  read(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    return this.inbox.read(user.id, body)
  }
}
