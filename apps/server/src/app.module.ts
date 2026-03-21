import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'path';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { DownloadsModule } from './downloads/downloads.module';
import { DmModule } from './dm/dm.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './health/health.module';
import { InvitesModule } from './invites/invites.module';
import { MessagesModule } from './messages/messages.module';
import { PrismaModule } from './prisma/prisma.module';
import { EventsModule } from './events/events.module';
import { ServersModule } from './servers/servers.module';
import { UpdatesModule } from './updates/updates.module';
import { UploadsModule } from './uploads/uploads.module';
import { VoiceModule } from './voice/voice.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(process.cwd(), '../../.env'),
        resolve(process.cwd(), '../../.env.development'),
        resolve(process.cwd(), '.env'),
      ],
    }),
    PrismaModule,
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
    GatewayModule,
  ],
})
export class AppModule {}
