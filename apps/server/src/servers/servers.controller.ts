import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { FileInterceptor } from '@nestjs/platform-express'
import { CurrentUser } from '../auth/current-user.decorator'
import { ChangeSelfRolesDto, CompleteOnboardingDto, TimeoutMemberDto, UpdateMemberRolesDto, UpdateOnboardingDto, UpdateServerDto } from './dto'
import { ServersService } from './servers.service'

const IMAGE_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'])
const IMG_EXT_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif',
}
function resolveImageMime(file: { mimetype: string; originalname: string }): string {
  const mime = file.mimetype?.toLowerCase()
  if (mime && mime !== 'application/octet-stream' && IMAGE_MIMETYPES.has(mime)) return mime
  const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
  return IMG_EXT_MAP[ext] ?? mime
}

@Controller('servers')
@UseGuards(AuthGuard('jwt'))
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Get()
  list(@CurrentUser() user: { id: string; username: string; email: string }) {
    return this.servers.getServers(user.id)
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string; username: string; email: string }) {
    return this.servers.getServer(id, user.id)
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Body() dto: UpdateServerDto
  ) {
    return this.servers.updateServer(id, user.id, dto)
  }

  @Post(':id/icon')
  @UseInterceptors(
    FileInterceptor('icon', {
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const resolved = resolveImageMime(file)
        if (IMAGE_MIMETYPES.has(resolved)) {
          file.mimetype = resolved
          cb(null, true)
        } else {
          cb(new BadRequestException('Only JPEG, PNG, GIF, and WebP images are allowed'), false)
        }
      }
    })
  )
  async uploadIcon(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file) throw new BadRequestException('No file provided')
    return this.servers.uploadIcon(id, user.id, file)
  }

  @Delete(':id/icon')
  async deleteIcon(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string }) {
    return this.servers.deleteIcon(id, user.id)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; username: string; email: string }
  ) {
    await this.servers.deleteServer(id, user.id)
  }

  @Post(':id/join')
  join(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string; username: string; email: string }) {
    return this.servers.joinServer(id, user.id)
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leave(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; username: string; email: string }
  ) {
    await this.servers.leaveServer(id, user.id)
  }

  @Get(':id/members')
  members(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; username: string; email: string }
  ) {
    return this.servers.getMembers(id, user.id)
  }

  @Patch(':id/members/:userId/roles')
  updateRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateMemberRolesDto
  ) {
    return this.servers.updateMemberRoles(id, user.id, targetUserId, dto.roleIds)
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async kickMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: { id: string }
  ) {
    await this.servers.kickMember(id, user.id, targetUserId)
  }

  @Post(':id/members/:userId/timeout')
  async timeoutMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: TimeoutMemberDto
  ) {
    return this.servers.timeoutMember(id, user.id, targetUserId, dto.duration)
  }

  @Delete(':id/members/:userId/timeout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTimeout(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: { id: string }
  ) {
    await this.servers.removeTimeout(id, user.id, targetUserId)
  }

  @Get(':id/insights')
  getInsights(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.servers.getInsights(id, user.id)
  }

  @Get(':id/onboarding')
  getOnboarding(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.servers.getOnboardingConfig(id, user.id)
  }

  @Patch(':id/onboarding')
  updateOnboarding(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateOnboardingDto
  ) {
    return this.servers.updateOnboardingConfig(id, user.id, {
      enabled: dto.enabled,
      message: dto.message,
      selfAssignableRoleIds: dto.selfAssignableRoleIds
    })
  }

  @Get(':id/onboarding/wizard')
  getOnboardingWizard(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.servers.getOnboardingWizardData(id, user.id)
  }

  @Patch(':id/self-roles')
  changeSelfRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ChangeSelfRolesDto
  ) {
    return this.servers.changeSelfRoles(id, user.id, dto.roleIds)
  }

  @Post(':id/onboarding/complete')
  completeOnboarding(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CompleteOnboardingDto
  ) {
    return this.servers.completeOnboarding(id, user.id, dto.roleIds)
  }

  @Post(':id/bans/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async banMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { reason?: string }
  ) {
    await this.servers.banMember(id, user.id, targetUserId, body.reason)
  }

  @Delete(':id/bans/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unbanMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: { id: string }
  ) {
    await this.servers.unbanMember(id, user.id, targetUserId)
  }

  @Get(':id/bans')
  listBans(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.servers.getBans(id, user.id)
  }

  @Get(':id/emojis/stats')
  emojiStats(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.servers.getEmojiStats(id, user.id)
  }

  @Get(':id/emojis')
  listEmojis(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.servers.getEmojis(id, user.id)
  }

  @Post(':id/emojis')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 200 * 1024 },
      fileFilter: (_req, file, cb) => {
        const resolved = resolveImageMime(file)
        if (IMAGE_MIMETYPES.has(resolved)) {
          file.mimetype = resolved
          cb(null, true)
        } else {
          cb(new BadRequestException('Only JPEG, PNG, GIF, and WebP images are allowed'), false)
        }
      }
    })
  )
  uploadEmoji(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string
  ) {
    if (!file) throw new BadRequestException('No file provided')
    if (!name) throw new BadRequestException('Emoji name is required')
    return this.servers.uploadEmoji(id, user.id, file, name)
  }

  @Patch(':id/emojis/:emojiId')
  renameEmoji(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('emojiId', ParseUUIDPipe) emojiId: string,
    @CurrentUser() user: { id: string },
    @Body('name') name: string
  ) {
    if (!name) throw new BadRequestException('Emoji name is required')
    return this.servers.renameEmoji(id, user.id, emojiId, name)
  }

  @Delete(':id/emojis/:emojiId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEmoji(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('emojiId', ParseUUIDPipe) emojiId: string,
    @CurrentUser() user: { id: string }
  ) {
    await this.servers.deleteEmoji(id, user.id, emojiId)
  }
}
