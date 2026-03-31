import { Module } from '@nestjs/common'
import { RolesModule } from '../roles/roles.module'
import { VoiceController } from './voice.controller'
import { VoiceService } from './voice.service'

@Module({
  imports: [RolesModule],
  controllers: [VoiceController],
  providers: [VoiceService],
  exports: [VoiceService]
})
export class VoiceModule {}
