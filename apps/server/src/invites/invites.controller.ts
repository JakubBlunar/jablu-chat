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
  UseGuards
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { CurrentUser } from '../auth/current-user.decorator'
import { CreateInviteDto } from './dto'
import { InvitesService } from './invites.service'

@Controller()
@UseGuards(AuthGuard('jwt'))
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post('servers/:serverId/invites')
  create(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Body() dto: CreateInviteDto
  ) {
    return this.invites.createInvite(serverId, user.id, dto.maxUses, dto.expiresInMinutes)
  }

  @Get('servers/:serverId/invites')
  list(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string; username: string; email: string }
  ) {
    return this.invites.getInvites(serverId, user.id)
  }

  @Delete('invites/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; username: string; email: string }
  ) {
    await this.invites.deleteInvite(id, user.id)
  }

  @Post('invites/:code/join')
  join(@Param('code') code: string, @CurrentUser() user: { id: string; username: string; email: string }) {
    return this.invites.useInvite(code, user.id)
  }

  @Get('invites/vanity/:code')
  resolveVanity(@Param('code') code: string) {
    return this.invites.resolveVanity(code)
  }

  @Post('invites/vanity/:code/join')
  joinVanity(@Param('code') code: string, @CurrentUser() user: { id: string; username: string; email: string }) {
    return this.invites.joinVanity(code, user.id)
  }
}
