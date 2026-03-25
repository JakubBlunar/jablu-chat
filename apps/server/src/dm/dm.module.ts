import { Module } from '@nestjs/common'
import { DmController } from './dm.controller'
import { DmService } from './dm.service'

@Module({
  controllers: [DmController],
  providers: [DmService],
  exports: [DmService]
})
export class DmModule {}
