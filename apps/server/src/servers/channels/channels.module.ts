import { Module } from '@nestjs/common'
import { AuditLogService } from '../audit-log.service'
import { CategoriesController } from './categories.controller'
import { CategoriesService } from './categories.service'
import { ChannelsController } from './channels.controller'
import { ChannelsService } from './channels.service'

@Module({
  controllers: [ChannelsController, CategoriesController],
  providers: [ChannelsService, CategoriesService, AuditLogService],
  exports: [ChannelsService, CategoriesService]
})
export class ChannelsModule {}
