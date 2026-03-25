import { Module } from '@nestjs/common'
import { AuditLogService } from '../servers/audit-log.service'
import { InvitesController } from './invites.controller'
import { InvitesService } from './invites.service'

@Module({
  controllers: [InvitesController],
  providers: [InvitesService, AuditLogService],
  exports: [InvitesService]
})
export class InvitesModule {}
