import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { resolve } from 'path'
import { AdminModule } from './admin/admin.module'
import { AuthModule } from './auth/auth.module'
import { CleanupModule } from './cleanup/cleanup.module'
import { DownloadsModule } from './downloads/downloads.module'
import { DmModule } from './dm/dm.module'
import { GatewayModule } from './gateway/gateway.module'
import { GifModule } from './gif/gif.module'
import { HealthModule } from './health/health.module'
import { InvitesModule } from './invites/invites.module'
import { MessagesModule } from './messages/messages.module'
import { PrismaModule } from './prisma/prisma.module'
import { ReadStateModule } from './read-state/read-state.module'
import { EventsModule } from './events/events.module'
import { ServersModule } from './servers/servers.module'
import { UpdatesModule } from './updates/updates.module'
import { UploadsModule } from './uploads/uploads.module'
import { PushModule } from './push/push.module'
import { RedisModule } from './redis/redis.module'
import { VoiceModule } from './voice/voice.module'
import { ServerEventsModule } from './server-events/server-events.module'
import { WebhooksModule } from './webhooks/webhooks.module'
import { AutoModModule } from './automod/automod.module'
import { FriendsModule } from './friends/friends.module'
import { BookmarksModule } from './bookmarks/bookmarks.module'
import { RolesModule } from './roles/roles.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(process.cwd(), '../../.env'),
        resolve(process.cwd(), '../../.env.development'),
        resolve(process.cwd(), '.env')
      ]
    }),
    PrismaModule,
    RedisModule,
    EventsModule,
    UploadsModule,
    CleanupModule,
    AdminModule,
    AuthModule,
    HealthModule,
    ServersModule,
    DmModule,
    InvitesModule,
    MessagesModule,
    VoiceModule,
    WebhooksModule,
    UpdatesModule,
    DownloadsModule,
    ReadStateModule,
    PushModule,
    GifModule,
    GatewayModule,
    ServerEventsModule,
    FriendsModule,
    BookmarksModule,
    AutoModModule,
    RolesModule
  ]
})
export class AppModule {}
