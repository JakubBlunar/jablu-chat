import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as webPush from 'web-push'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { filterUserIdsForWebPush } from './push-user-allow'
import type { LocalizedPushCopy, PushLocale } from './push-copy'

const PUSH_QUEUE_KEY = 'push:queue'
const MAX_RETRIES = 3
const POLL_TIMEOUT_S = 5
const PUSH_JOB_BATCH_SIZE = 100
const PUSH_CONCURRENCY = 20
const PUSH_TIMEOUT_MS = 10_000

/** How long a push service should keep retrying an undelivered message. */
const PUSH_TTL_S = 60 * 60

export type PushPayload = {
  title: string
  body: string
  localized?: Partial<LocalizedPushCopy>
  url?: string
  expiresAt?: number
}

type PushJob = {
  userIds: string[]
  payload: PushPayload
  attempt: number
}

function isPushLocale(locale: unknown): locale is PushLocale {
  return locale === 'en' || locale === 'cs' || locale === 'sk'
}

function normalizePushLocale(locale: unknown): PushLocale {
  return isPushLocale(locale) ? locale : 'en'
}

@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushService.name)
  private enabled = false
  private running = false
  private workerClient: import('ioredis').default | null = null
  private activeRequests = 0
  private readonly waitingRequests: (() => void)[] = []

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

  async subscribe(
    userId: string,
    endpoint: string,
    p256dh: string,
    auth: string,
    deviceId?: string,
    locale: PushLocale = 'en'
  ) {
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true }
    })
    const preferredLocale = isPushLocale(account?.locale) ? account.locale : locale
    const existing = await this.prisma.pushSubscription.findUnique({ where: { endpoint } })
    if (existing && existing.userId !== userId) {
      await this.prisma.pushSubscription.delete({ where: { endpoint } })
    }
    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth, deviceId: deviceId ?? null, locale: preferredLocale },
      update: { p256dh, auth, locale: preferredLocale, ...(deviceId ? { deviceId } : {}) }
    })
  }

  /** Number of devices registered for push, surfaced by the settings test button. */
  async countSubscriptions(userId: string): Promise<number> {
    return this.prisma.pushSubscription.count({ where: { userId } })
  }

  async unsubscribe(endpoint: string, userId: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, userId } }).catch(() => {})
  }

  async sendToUser(userId: string, payload: PushPayload) {
    if (!this.enabled) return
    const allowed = await filterUserIdsForWebPush(this.prisma, [userId])
    if (allowed.length === 0) return
    await this.enqueue(allowed, payload)
  }

  async sendToUsers(userIds: string[], payload: PushPayload) {
    if (userIds.length === 0) return
    if (!this.enabled) return
    const allowed = await filterUserIdsForWebPush(this.prisma, userIds)
    if (allowed.length === 0) return
    await this.enqueue(allowed, payload)
  }

  /**
   * Bypasses quiet hours and suppress-all on purpose: the point of the test button
   * is to prove the transport reaches this device, not to re-run the filters.
   */
  async sendTest(userId: string, payload: PushPayload) {
    if (!this.enabled) return
    await this.enqueue([userId], payload)
  }

  private async enqueue(userIds: string[], payload: PushPayload) {
    if (!this.enabled || userIds.length === 0) return
    if (payload.expiresAt !== undefined && payload.expiresAt <= Date.now()) return

    const groups = new Map<PushLocale | null, string[]>()
    if (payload.localized) {
      const locales = await this.resolveUserLocales(userIds)
      for (const userId of userIds) {
        const locale = locales.get(userId) ?? 'en'
        const recipients = groups.get(locale) ?? []
        recipients.push(userId)
        groups.set(locale, recipients)
      }
    } else {
      groups.set(null, userIds)
    }

    const basePayload: PushPayload = {
      title: payload.title,
      body: payload.body,
      ...(payload.url !== undefined ? { url: payload.url } : {}),
      ...(payload.expiresAt !== undefined ? { expiresAt: payload.expiresAt } : {})
    }
    const jobs: PushJob[] = []
    for (const [locale, recipients] of groups) {
      const copy = locale === null ? undefined : payload.localized?.[locale]
      const queuedPayload = copy ? { ...basePayload, ...copy } : basePayload
      for (let i = 0; i < recipients.length; i += PUSH_JOB_BATCH_SIZE) {
        jobs.push({
          userIds: recipients.slice(i, i + PUSH_JOB_BATCH_SIZE),
          payload: queuedPayload,
          attempt: 0
        })
      }
    }
    try {
      await this.redis.client.rpush(PUSH_QUEUE_KEY, ...jobs.map((job) => JSON.stringify(job)))
    } catch (err) {
      this.logger.warn('Failed to enqueue push job, sending inline', err)
      for (const job of jobs) await this.processJob(job)
    }
  }

  private async resolveUserLocales(userIds: string[]): Promise<Map<string, PushLocale>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] } },
      select: { id: true, locale: true }
    })
    const locales = new Map<string, PushLocale>()
    const unsetLocaleUserIds: string[] = []
    for (const user of users) {
      if (isPushLocale(user.locale)) locales.set(user.id, user.locale)
      else unsetLocaleUserIds.push(user.id)
    }

    if (unsetLocaleUserIds.length > 0) {
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { userId: { in: unsetLocaleUserIds } },
        select: { userId: true, locale: true, createdAt: true, id: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
      })
      for (const subscription of subscriptions) {
        if (!locales.has(subscription.userId) && isPushLocale(subscription.locale)) {
          locales.set(subscription.userId, subscription.locale)
        }
      }
    }

    for (const userId of userIds) {
      if (!locales.has(userId)) locales.set(userId, 'en')
    }
    return locales
  }

  private async withPushSlot(send: () => Promise<void>): Promise<void> {
    if (this.activeRequests >= PUSH_CONCURRENCY) {
      await new Promise<void>((resolve) => this.waitingRequests.push(resolve))
    } else {
      this.activeRequests++
    }
    try {
      await send()
    } finally {
      const next = this.waitingRequests.shift()
      if (next) next()
      else this.activeRequests--
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
    if (job.payload.expiresAt !== undefined && job.payload.expiresAt <= Date.now()) return
    try {
      const subs = await this.prisma.pushSubscription.findMany({
        where: { userId: { in: job.userIds } }
      })
      if (subs.length === 0) return
      const locales = job.payload.localized ? await this.resolveUserLocales(job.userIds) : undefined

      const stale: string[] = []
      let sent = 0
      let failed = 0

      let nextSub = 0
      const sendNext = async () => {
        while (nextSub < subs.length) {
          const sub = subs[nextSub++]
          await this.withPushSlot(async () => {
            const ttl =
              job.payload.expiresAt === undefined
                ? PUSH_TTL_S
                : Math.min(PUSH_TTL_S, Math.floor((job.payload.expiresAt - Date.now()) / 1000))
            if (ttl <= 0) return
            try {
              const locale = locales?.get(sub.userId) ?? normalizePushLocale(sub.locale)
              const localized = job.payload.localized?.[locale]
              const jsonPayload = JSON.stringify({
                title: localized?.title ?? job.payload.title,
                body: localized?.body ?? job.payload.body,
                ...(job.payload.url !== undefined ? { url: job.payload.url } : {}),
                ...(job.payload.expiresAt !== undefined ? { expiresAt: job.payload.expiresAt } : {})
              })
              await webPush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                jsonPayload,
                {
                  TTL: ttl,
                  // Without high urgency FCM batches the message until the phone next
                  // wakes on its own, which can be many minutes on a locked device.
                  urgency: 'high',
                  timeout: PUSH_TIMEOUT_MS
                }
              )
              sent++
            } catch (err: any) {
              if (err?.statusCode === 410 || err?.statusCode === 404) {
                stale.push(sub.id)
              } else {
                failed++
                this.logger.debug(`Push send failed (${err?.statusCode ?? 'no status'}) for ${sub.endpoint.slice(0, 60)}`)
              }
            }
          })
        }
      }
      await Promise.all(Array.from({ length: Math.min(PUSH_CONCURRENCY, subs.length) }, sendNext))

      this.logger.debug(
        `Push "${job.payload.title}": ${sent} sent, ${failed} failed, ${stale.length} stale ` +
          `across ${job.userIds.length} user(s)`
      )

      if (stale.length > 0) {
        await this.prisma.pushSubscription.deleteMany({ where: { id: { in: stale } } })
      }
    } catch (err) {
      if (job.payload.expiresAt !== undefined && job.payload.expiresAt <= Date.now()) return
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
