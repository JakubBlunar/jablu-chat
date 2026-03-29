import { Module } from '@nestjs/common'
import { RolesModule } from '../roles/roles.module'
import { AuditLogService } from '../servers/audit-log.service'
import { InvitesController } from './invites.controller'
import { InvitesService } from './invites.service'

@Module({
  imports: [RolesModule],
  controllers: [InvitesController],
  providers: [InvitesService, AuditLogService],
  exports: [InvitesService]
})
export class InvitesModule {}
