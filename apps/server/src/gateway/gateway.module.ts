import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DmModule } from '../dm/dm.module';
import { MessagesModule } from '../messages/messages.module';
import { PushModule } from '../push/push.module';
import { ReadStateModule } from '../read-state/read-state.module';
import { ChatGateway } from './gateway.gateway';
import { WsJwtGuard } from './ws-jwt.guard';

@Module({
  imports: [MessagesModule, DmModule, AuthModule, ReadStateModule, PushModule],
  providers: [ChatGateway, WsJwtGuard],
})
export class GatewayModule {}
