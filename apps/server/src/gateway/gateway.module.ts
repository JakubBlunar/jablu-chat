import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MessagesModule } from '../messages/messages.module';
import { ChatGateway } from './gateway.gateway';
import { WsJwtGuard } from './ws-jwt.guard';

@Module({
  imports: [MessagesModule, AuthModule],
  providers: [ChatGateway, WsJwtGuard],
})
export class GatewayModule {}
