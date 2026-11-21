import { Module } from '@nestjs/common'
import { InAppNotificationsModule } from '../in-app-notifications/in-app-notifications.module'
import { RolesModule } from '../roles/roles.module'
import { ReadStateController } from './read-state.controller'
import { ReadStateService } from './read-state.service'
import { InboxModule } from '../inbox/inbox.module'

@Module({
  imports: [RolesModule, InAppNotificationsModule, InboxModule],
  controllers: [ReadStateController],
  providers: [ReadStateService],
  exports: [ReadStateService]
})
export class ReadStateModule {}
