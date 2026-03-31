import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { CurrentUser } from '../auth/current-user.decorator'
import { RolesService } from './roles.service'

@Controller()
@UseGuards(AuthGuard('jwt'))
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('servers/:serverId/roles')
  async list(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string },
  ) {
    await this.roles.requireMembership(serverId, user.id)
    return this.roles.getRoles(serverId)
  }

  @Post('servers/:serverId/roles')
  create(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { name: string; color?: string; permissions?: string },
  ) {
    return this.roles.createRole(serverId, user.id, body)
  }

  @Patch('servers/:serverId/roles/reorder')
  reorder(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { roleIds: string[] },
  ) {
    return this.roles.reorderRoles(serverId, user.id, body.roleIds)
  }

  @Patch('servers/:serverId/roles/:roleId')
  update(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { name?: string; color?: string | null; permissions?: string; position?: number; selfAssignable?: boolean; isAdmin?: boolean },
  ) {
    return this.roles.updateRole(serverId, roleId, user.id, body)
  }

  @Delete('servers/:serverId/roles/:roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.roles.deleteRole(serverId, roleId, user.id)
  }

  @Get('servers/:serverId/channels/permissions/me')
  async getAllMyChannelPermissions(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @CurrentUser() user: { id: string },
  ) {
    const map = await this.roles.getAllChannelPermissions(serverId, user.id)
    const wire: Record<string, string> = {}
    for (const [chId, perms] of Object.entries(map)) wire[chId] = perms.toString()
    return wire
  }

  @Get('servers/:serverId/channels/:channelId/permissions/me')
  async getMyChannelPermissions(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string },
  ) {
    const perms = await this.roles.getChannelPermissions(serverId, channelId, user.id)
    return { permissions: perms.toString() }
  }

  @Get('channels/:channelId/overrides')
  async getOverrides(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.roles.getChannelOverrides(channelId)
  }

  @Put('servers/:serverId/channels/:channelId/overrides/:roleId')
  upsertOverride(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { allow: string; deny: string },
  ) {
    return this.roles.upsertChannelOverride(serverId, channelId, roleId, user.id, body.allow, body.deny)
  }

  @Delete('servers/:serverId/channels/:channelId/overrides/:roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeOverride(
    @Param('serverId', ParseUUIDPipe) serverId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.roles.deleteChannelOverride(serverId, channelId, roleId, user.id)
  }
}
