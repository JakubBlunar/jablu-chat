import { Module } from '@nestjs/common'
import { RolesModule } from '../roles/roles.module'
import { ReadStateController } from './read-state.controller'
import { ReadStateService } from './read-state.service'

@Module({
  imports: [RolesModule],
  controllers: [ReadStateController],
  providers: [ReadStateService],
  exports: [ReadStateService]
})
export class ReadStateModule {}
