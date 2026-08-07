import { Module } from '@nestjs/common'
import { InAppNotificationsModule } from '../in-app-notifications/in-app-notifications.module'
import { PushModule } from '../push/push.module'
import { NotificationsService } from './notifications.service'

@Module({
  imports: [InAppNotificationsModule, PushModule],
  providers: [NotificationsService],
  exports: [NotificationsService]
})
export class NotificationsModule {}
