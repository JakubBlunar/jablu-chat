import { Module } from '@nestjs/common'
import { InAppNotificationsModule } from '../in-app-notifications/in-app-notifications.module'
import { RolesModule } from '../roles/roles.module'
import { ReadStateController } from './read-state.controller'
import { ReadStateService } from './read-state.service'

@Module({
  imports: [RolesModule, InAppNotificationsModule],
  controllers: [ReadStateController],
  providers: [ReadStateService],
  exports: [ReadStateService]
})
export class ReadStateModule {}
