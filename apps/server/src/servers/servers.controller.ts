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
import { UpdateMemberRoleDto, UpdateServerDto } from './dto'
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

  @Patch(':id/members/:userId/role')
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateMemberRoleDto
  ) {
    return this.servers.updateMemberRole(id, user.id, targetUserId, dto.roleId)
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
