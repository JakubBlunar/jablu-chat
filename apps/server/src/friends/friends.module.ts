import { Module } from '@nestjs/common'
import { InAppNotificationsModule } from '../in-app-notifications/in-app-notifications.module'
import { FriendsController } from './friends.controller'
import { FriendsService } from './friends.service'

@Module({
  imports: [InAppNotificationsModule],
  controllers: [FriendsController],
  providers: [FriendsService],
  exports: [FriendsService]
})
export class FriendsModule {}
