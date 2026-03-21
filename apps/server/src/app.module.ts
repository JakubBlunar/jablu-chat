import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'path';
import { AuthModule } from './auth/auth.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './health/health.module';
import { InvitesModule } from './invites/invites.module';
import { MessagesModule } from './messages/messages.module';
import { PrismaModule } from './prisma/prisma.module';
import { EventsModule } from './events/events.module';
import { ServersModule } from './servers/servers.module';
import { UploadsModule } from './uploads/uploads.module';
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
    AuthModule,
    HealthModule,
    ServersModule,
    InvitesModule,
    MessagesModule,
    WebhooksModule,
    GatewayModule,
  ],
})
export class AppModule {}
