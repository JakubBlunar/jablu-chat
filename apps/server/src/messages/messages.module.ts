import { Module } from '@nestjs/common'
import { RolesModule } from '../roles/roles.module'
import { LinkPreviewService } from './link-preview.service'
import { MessagesController } from './messages.controller'
import { MessagesService } from './messages.service'
import { BulkNotifPrefsController, NotifPrefsController, ServerNotifPrefsController } from './notif-prefs.controller'
import { PollsController } from './polls.controller'
import { PollsService } from './polls.service'
import { SearchController } from './search.controller'
import { SearchService } from './search.service'

@Module({
  imports: [RolesModule],
  controllers: [MessagesController, PollsController, SearchController, NotifPrefsController, BulkNotifPrefsController, ServerNotifPrefsController],
  providers: [MessagesService, PollsService, LinkPreviewService, SearchService],
  exports: [MessagesService, PollsService, LinkPreviewService]
})
export class MessagesModule {}
