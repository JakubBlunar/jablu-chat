import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { AuditLogService } from '../servers/audit-log.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [MessagesModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, AuditLogService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
