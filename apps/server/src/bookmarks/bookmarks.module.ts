import { Module } from '@nestjs/common'
import { RolesModule } from '../roles/roles.module'
import { BookmarksController } from './bookmarks.controller'
import { BookmarksService } from './bookmarks.service'

@Module({
  imports: [RolesModule],
  controllers: [BookmarksController],
  providers: [BookmarksService],
  exports: [BookmarksService]
})
export class BookmarksModule {}
