import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as webPush from 'web-push'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { filterUserIdsForWebPush } from './push-user-allow'

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
  private workerClient: import('ioredis').default | null = null

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
    void this.startWorker()
  }

  async onModuleDestroy() {
    this.running = false
    if (this.workerClient) {
      await this.workerClient.quit().catch(() => {})
    }
  }

  getVapidPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? null
  }

  async subscribe(userId: string, endpoint: string, p256dh: string, auth: string) {
    const existing = await this.prisma.pushSubscription.findUnique({ where: { endpoint } })
    if (existing && existing.userId !== userId) {
      await this.prisma.pushSubscription.delete({ where: { endpoint } })
    }
    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth },
      update: { p256dh, auth }
    })
  }

  async unsubscribe(endpoint: string, userId: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, userId } }).catch(() => {})
  }

  async sendToUser(userId: string, payload: { title: string; body: string; url?: string }) {
    if (!this.enabled) return
    const allowed = await filterUserIdsForWebPush(this.prisma, [userId])
    if (allowed.length === 0) return
    await this.enqueue(allowed, payload)
  }

  async sendToUsers(userIds: string[], payload: { title: string; body: string; url?: string }) {
    if (userIds.length === 0) return
    if (!this.enabled) return
    const allowed = await filterUserIdsForWebPush(this.prisma, userIds)
    if (allowed.length === 0) return
    await this.enqueue(allowed, payload)
  }

  async sendToAll(payload: { title: string; body: string; url?: string }) {
    if (!this.enabled) return
    const subs = await this.prisma.pushSubscription.findMany({ select: { userId: true } })
    const uniqueIds = [...new Set(subs.map((s) => s.userId))]
    if (uniqueIds.length === 0) return
    const allowed = await filterUserIdsForWebPush(this.prisma, uniqueIds)
    if (allowed.length === 0) return
    await this.enqueue(allowed, payload)
  }

  private async enqueue(userIds: string[], payload: { title: string; body: string; url?: string }) {
    if (!this.enabled || userIds.length === 0) return
    const job: PushJob = { userIds, payload, attempt: 0 }
    try {
      await this.redis.client.rpush(PUSH_QUEUE_KEY, JSON.stringify(job))
    } catch (err) {
      this.logger.warn('Failed to enqueue push job, sending inline', err)
      await this.processJob(job)
    }
  }

  /**
   * Dedicated client for BLPOP. Must not inherit `enableOfflineQueue: false` from the shared
   * Redis client — the duplicate is not writable until TCP connects; queuing (or waiting) avoids
   * "Stream isn't writeable and enableOfflineQueue options is false" on module init in prod.
   */
  private async startWorker() {
    this.running = true
    this.workerClient = this.redis.client.duplicate({
      enableOfflineQueue: true,
      maxRetriesPerRequest: null
    })
    this.workerClient.on('error', (err) => this.logger.warn('Push worker Redis error', err.message))
    try {
      await this.workerClient.ping()
    } catch (err) {
      this.logger.warn('Push worker Redis ping failed; poll loop will retry', err)
    }
    void this.pollLoop()
  }

  private async pollLoop() {
    const client = this.workerClient!
    while (this.running) {
      try {
        const result = await client.blpop(PUSH_QUEUE_KEY, POLL_TIMEOUT_S)
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
