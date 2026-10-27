import { Module } from '@nestjs/common'
import { RolesController } from './roles.controller'
import { RolesService } from './roles.service'
import { ChannelAccessController } from './channel-access.controller'
import { ChannelAccessService } from './channel-access.service'

@Module({
  controllers: [RolesController, ChannelAccessController],
  providers: [RolesService, ChannelAccessService],
  exports: [RolesService]
})
export class RolesModule {}
