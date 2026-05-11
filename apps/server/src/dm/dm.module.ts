import { Module } from '@nestjs/common'
import { FriendsModule } from '../friends/friends.module'
import { MessagesModule } from '../messages/messages.module'
import { DmController } from './dm.controller'
import { DmService } from './dm.service'

@Module({
  imports: [FriendsModule, MessagesModule],
  controllers: [DmController],
  providers: [DmService],
  exports: [DmService]
})
export class DmModule {}
