import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { AutoModModule } from '../automod/automod.module'
import { DmModule } from '../dm/dm.module'
import { MessagesModule } from '../messages/messages.module'
import { PushModule } from '../push/push.module'
import { ReadStateModule } from '../read-state/read-state.module'
import { InAppNotificationsModule } from '../in-app-notifications/in-app-notifications.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { RolesModule } from '../roles/roles.module'
import { ChatGateway } from './gateway.gateway'
import { WsJwtGuard } from './ws-jwt.guard'
import { WsThrottleGuard } from './ws-throttle.guard'
import { VoiceModule } from '../voice/voice.module'
import { DmCallsGateway } from './dm-calls.gateway'

@Module({
  imports: [
    MessagesModule,
    DmModule,
    AuthModule,
    ReadStateModule,
    PushModule,
    AutoModModule,
    RolesModule,
    InAppNotificationsModule,
    NotificationsModule,
    VoiceModule
  ],
  providers: [ChatGateway, DmCallsGateway, WsJwtGuard, WsThrottleGuard]
})
export class GatewayModule {}
