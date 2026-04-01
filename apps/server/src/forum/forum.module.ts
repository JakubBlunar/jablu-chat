import { Module } from '@nestjs/common'
import { RolesModule } from '../roles/roles.module'
import { ForumPostsController } from './forum-posts.controller'
import { ForumPostsService } from './forum-posts.service'
import { ForumTagsController } from './forum-tags.controller'
import { ForumTagsService } from './forum-tags.service'

@Module({
  imports: [RolesModule],
  controllers: [ForumPostsController, ForumTagsController],
  providers: [ForumPostsService, ForumTagsService],
  exports: [ForumPostsService, ForumTagsService]
})
export class ForumModule {}
