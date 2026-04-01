import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { CurrentUser } from '../auth/current-user.decorator'
import { ForumPostsService } from './forum-posts.service'
import { CreateForumPostDto, ListForumPostsDto, UpdateForumPostDto } from './dto'

@Controller('channels/:channelId/posts')
@UseGuards(AuthGuard('jwt'))
export class ForumPostsController {
  constructor(private readonly posts: ForumPostsService) {}

  @Get()
  list(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string },
    @Query() query: ListForumPostsDto
  ) {
    return this.posts.listPosts(channelId, user.id, query.sort, query.tagId, query.cursor, query.limit)
  }

  @Get(':postId')
  get(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.posts.getPost(channelId, postId, user.id)
  }

  @Post()
  create(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string },
    @Body() body: CreateForumPostDto
  ) {
    return this.posts.createPost(channelId, user.id, body.title, body.content, body.tagIds, body.attachmentIds)
  }

  @Patch(':postId')
  update(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser() user: { id: string },
    @Body() body: UpdateForumPostDto
  ) {
    return this.posts.updatePost(channelId, postId, user.id, body.title, body.content, body.tagIds)
  }

  @Delete(':postId')
  delete(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.posts.deletePost(channelId, postId, user.id)
  }

  @Post(':postId/lock')
  lock(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.posts.lockPost(channelId, postId, user.id)
  }

  @Delete(':postId/lock')
  unlock(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.posts.unlockPost(channelId, postId, user.id)
  }
}
