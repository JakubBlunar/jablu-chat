import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { NotificationsModule } from '../notifications/notifications.module'
import { RolesModule } from '../roles/roles.module'
import { ServerEventsController } from './server-events.controller'
import { ServerEventsService } from './server-events.service'

@Module({
  imports: [ScheduleModule.forRoot(), NotificationsModule, RolesModule],
  controllers: [ServerEventsController],
  providers: [ServerEventsService],
  exports: [ServerEventsService]
})
export class ServerEventsModule {}
