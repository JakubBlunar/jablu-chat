import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { CurrentUser } from '../auth/current-user.decorator'
import { ForumTagsService } from './forum-tags.service'
import { CreateForumTagDto, UpdateForumTagDto } from './dto'

@Controller('channels/:channelId/tags')
@UseGuards(AuthGuard('jwt'))
export class ForumTagsController {
  constructor(private readonly tags: ForumTagsService) {}

  @Get()
  list(@Param('channelId', ParseUUIDPipe) channelId: string) {
    return this.tags.listTags(channelId)
  }

  @Post()
  create(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string },
    @Body() body: CreateForumTagDto
  ) {
    return this.tags.createTag(channelId, user.id, body.name, body.color)
  }

  @Patch(':tagId')
  update(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentUser() user: { id: string },
    @Body() body: UpdateForumTagDto
  ) {
    return this.tags.updateTag(channelId, tagId, user.id, body.name, body.color)
  }

  @Delete(':tagId')
  delete(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.tags.deleteTag(channelId, tagId, user.id)
  }
}
