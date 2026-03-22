import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const serverHost = this.config.get<string>('SERVER_HOST', 'localhost');

    if (!publicKey || !privateKey) {
      this.logger.warn('VAPID keys not configured -- push notifications disabled');
      return;
    }

    webPush.setVapidDetails(
      `mailto:admin@${serverHost}`,
      publicKey,
      privateKey,
    );
    this.enabled = true;
    this.logger.log('Web Push initialized');
  }

  getVapidPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? null;
  }

  async subscribe(userId: string, endpoint: string, p256dh: string, auth: string) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth },
      update: { userId, p256dh, auth },
    });
  }

  async unsubscribe(endpoint: string) {
    await this.prisma.pushSubscription.delete({ where: { endpoint } }).catch(() => {});
  }

  async sendToUser(userId: string, payload: { title: string; body: string; url?: string }) {
    if (!this.enabled) return;

    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    const jsonPayload = JSON.stringify(payload);
    const stale: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            jsonPayload,
            { TTL: 60 * 60 },
          );
        } catch (err: any) {
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            stale.push(sub.id);
          }
        }
      }),
    );

    if (stale.length > 0) {
      await this.prisma.pushSubscription.deleteMany({
        where: { id: { in: stale } },
      });
    }
  }

  async sendToUsers(userIds: string[], payload: { title: string; body: string; url?: string }) {
    await Promise.all(userIds.map((id) => this.sendToUser(id, payload)));
  }

  async sendToAll(payload: { title: string; body: string; url?: string }) {
    if (!this.enabled) return;

    const subs = await this.prisma.pushSubscription.findMany();
    const jsonPayload = JSON.stringify(payload);
    const stale: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            jsonPayload,
            { TTL: 60 * 60 },
          );
        } catch (err: any) {
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            stale.push(sub.id);
          }
        }
      }),
    );

    if (stale.length > 0) {
      await this.prisma.pushSubscription.deleteMany({
        where: { id: { in: stale } },
      });
    }
  }
}
