import { Module } from '@nestjs/common'
import { MessagesModule } from '../messages/messages.module'
import { RolesModule } from '../roles/roles.module'
import { AuditLogService } from '../servers/audit-log.service'
import { WebhooksController } from './webhooks.controller'
import { WebhooksService } from './webhooks.service'

@Module({
  imports: [MessagesModule, RolesModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, AuditLogService],
  exports: [WebhooksService]
})
export class WebhooksModule {}
