import { Module } from '@nestjs/common'
import { AuditLogService } from '../audit-log.service'
import { ChannelsController } from './channels.controller'
import { ChannelsService } from './channels.service'

@Module({
  controllers: [ChannelsController],
  providers: [ChannelsService, AuditLogService],
  exports: [ChannelsService]
})
export class ChannelsModule {}
