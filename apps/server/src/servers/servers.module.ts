import { Module } from '@nestjs/common'
import { RolesModule } from '../roles/roles.module'
import { AuditLogController } from './audit-log.controller'
import { AuditLogService } from './audit-log.service'
import { ChannelsModule } from './channels/channels.module'
import { ServersController } from './servers.controller'
import { ServersService } from './servers.service'

@Module({
  imports: [ChannelsModule, RolesModule],
  controllers: [ServersController, AuditLogController],
  providers: [ServersService, AuditLogService],
  exports: [ServersService, AuditLogService]
})
export class ServersModule {}
