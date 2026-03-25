import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { PushModule } from '../push/push.module'
import { ServerEventsController } from './server-events.controller'
import { ServerEventsService } from './server-events.service'

@Module({
  imports: [ScheduleModule.forRoot(), PushModule],
  controllers: [ServerEventsController],
  providers: [ServerEventsService],
  exports: [ServerEventsService]
})
export class ServerEventsModule {}
