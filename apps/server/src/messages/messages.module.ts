import { Module } from '@nestjs/common'
import { LinkPreviewService } from './link-preview.service'
import { MessagesController } from './messages.controller'
import { MessagesService } from './messages.service'
import { BulkNotifPrefsController, NotifPrefsController } from './notif-prefs.controller'
import { SearchController } from './search.controller'
import { SearchService } from './search.service'

@Module({
  controllers: [MessagesController, SearchController, NotifPrefsController, BulkNotifPrefsController],
  providers: [MessagesService, LinkPreviewService, SearchService],
  exports: [MessagesService, LinkPreviewService]
})
export class MessagesModule {}
