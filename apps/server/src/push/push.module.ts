import { Module } from '@nestjs/common'
import { PushController } from './push.controller'
import { PushService } from './push.service'
import { RolesModule } from '../roles/roles.module'

@Module({
  imports: [RolesModule],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService]
})
export class PushModule {}
