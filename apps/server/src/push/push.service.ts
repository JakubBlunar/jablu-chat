import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as webPush from 'web-push'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'

const PUSH_QUEUE_KEY = 'push:queue'
const MAX_RETRIES = 3
const POLL_TIMEOUT_S = 5

type PushJob = {
  userIds: string[]
  payload: { title: string; body: string; url?: string }
  attempt: number
}

@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushService.name)
  private enabled = false
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY')
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY')
    const serverHost = this.config.get<string>('SERVER_HOST', 'localhost')

    if (!publicKey || !privateKey) {
      this.logger.warn('VAPID keys not configured -- push notifications disabled')
      return
    }

    webPush.setVapidDetails(`mailto:admin@${serverHost}`, publicKey, privateKey)
    this.enabled = true
    this.logger.log('Web Push initialized')
    this.startWorker()
  }

  onModuleDestroy() {
    this.running = false
  }

  getVapidPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? null
  }

  async subscribe(userId: string, endpoint: string, p256dh: string, auth: string) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth },
      update: { userId, p256dh, auth }
    })
  }

  async unsubscribe(endpoint: string, userId: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, userId } }).catch(() => {})
  }

  async sendToUser(userId: string, payload: { title: string; body: string; url?: string }) {
    await this.enqueue([userId], payload)
  }

  async sendToUsers(userIds: string[], payload: { title: string; body: string; url?: string }) {
    if (userIds.length === 0) return
    await this.enqueue(userIds, payload)
  }

  async sendToAll(payload: { title: string; body: string; url?: string }) {
    if (!this.enabled) return
    const subs = await this.prisma.pushSubscription.findMany({ select: { userId: true } })
    const uniqueIds = [...new Set(subs.map((s) => s.userId))]
    if (uniqueIds.length === 0) return
    await this.enqueue(uniqueIds, payload)
  }

  private async enqueue(userIds: string[], payload: { title: string; body: string; url?: string }) {
    if (!this.enabled) return
    const job: PushJob = { userIds, payload, attempt: 0 }
    try {
      await this.redis.client.rpush(PUSH_QUEUE_KEY, JSON.stringify(job))
    } catch (err) {
      this.logger.warn('Failed to enqueue push job, sending inline', err)
      await this.processJob(job)
    }
  }

  private startWorker() {
    this.running = true
    void this.pollLoop()
  }

  private async pollLoop() {
    while (this.running) {
      try {
        const result = await this.redis.client.blpop(PUSH_QUEUE_KEY, POLL_TIMEOUT_S)
        if (!result) continue
        const job: PushJob = JSON.parse(result[1])
        await this.processJob(job)
      } catch (err) {
        if (this.running) {
          this.logger.warn('Push worker poll error', err)
          await new Promise((r) => setTimeout(r, 1000))
        }
      }
    }
  }

  private async processJob(job: PushJob) {
    try {
      const subs = await this.prisma.pushSubscription.findMany({
        where: { userId: { in: job.userIds } }
      })
      if (subs.length === 0) return

      const jsonPayload = JSON.stringify(job.payload)
      const stale: string[] = []

      await Promise.all(
        subs.map(async (sub) => {
          try {
            await webPush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              jsonPayload,
              { TTL: 60 * 60 }
            )
          } catch (err: any) {
            if (err?.statusCode === 410 || err?.statusCode === 404) {
              stale.push(sub.id)
            }
          }
        })
      )

      if (stale.length > 0) {
        await this.prisma.pushSubscription.deleteMany({ where: { id: { in: stale } } })
      }
    } catch (err) {
      job.attempt++
      if (job.attempt < MAX_RETRIES) {
        this.logger.warn(`Push job failed (attempt ${job.attempt}/${MAX_RETRIES}), re-queuing`)
        try {
          await this.redis.client.rpush(PUSH_QUEUE_KEY, JSON.stringify(job))
        } catch {
          this.logger.error('Failed to re-queue push job')
        }
      } else {
        this.logger.error('Push job exhausted retries', err)
      }
    }
  }
}
