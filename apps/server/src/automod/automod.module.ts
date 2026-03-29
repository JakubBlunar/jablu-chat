import { Module } from '@nestjs/common'
import { RolesModule } from '../roles/roles.module'
import { AutoModController } from './automod.controller'
import { AutoModService } from './automod.service'

@Module({
  imports: [RolesModule],
  controllers: [AutoModController],
  providers: [AutoModService],
  exports: [AutoModService]
})
export class AutoModModule {}
