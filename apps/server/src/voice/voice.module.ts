import { Module } from '@nestjs/common'
import { RolesModule } from '../roles/roles.module'
import { VoiceController } from './voice.controller'
import { VoiceService } from './voice.service'
import { DmCallsService } from './dm-calls.service'
import { DmModule } from '../dm/dm.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [RolesModule, DmModule, NotificationsModule],
  controllers: [VoiceController],
  providers: [VoiceService, DmCallsService],
  exports: [VoiceService, DmCallsService]
})
export class VoiceModule {}
