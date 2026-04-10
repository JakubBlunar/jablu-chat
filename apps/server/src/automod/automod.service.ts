import { Injectable, Logger } from '@nestjs/common'
import { AutoModType } from '../prisma-client'
import { Permission } from '@chat/shared'
import { EventBusService } from '../events/event-bus.service'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { RolesService } from '../roles/roles.service'

interface WordFilterConfig {
  words: string[]
  action: 'block' | 'flag'
}

interface LinkFilterConfig {
  blockAll: boolean
  allowedDomains: string[]
}

interface SpamDetectionConfig {
  maxDuplicates: number
  windowSeconds: number
  maxMessagesPerMinute: number
}

type AutoModConfig = WordFilterConfig | LinkFilterConfig | SpamDetectionConfig

@Injectable()
export class AutoModService {
  private readonly logger = new Logger(AutoModService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly roles: RolesService,
    private readonly events: EventBusService
  ) {}

  async checkMessage(
    serverId: string,
    userId: string,
    content: string,
    context: { channelId?: string; messageId?: string } = {}
  ): Promise<{ allowed: boolean; reason?: string }> {
    const rules = await this.prisma.autoModRule.findMany({
      where: { serverId, enabled: true }
    })

    for (const rule of rules) {
      const config = rule.config as Record<string, unknown>

      if (rule.type === 'word_filter') {
        const result = this.checkWordFilter(content, config as unknown as WordFilterConfig)
        if (!result.allowed) return result
        if (result.flagged) {
          this.logger.log(`Flagged message from ${userId} in ${serverId}: ${result.flagReason}`)
          this.events.emit('automod:flagged', {
            serverId,
            userId,
            channelId: context.channelId,
            messageId: context.messageId,
            reason: result.flagReason,
            content: content.slice(0, 200)
          })
        }
      }

      if (rule.type === 'link_filter') {
        const result = this.checkLinkFilter(content, config as unknown as LinkFilterConfig)
        if (!result.allowed) return result
      }

      if (rule.type === 'spam_detection') {
        const result = await this.checkSpamDetection(
          serverId,
          userId,
          content,
          config as unknown as SpamDetectionConfig
        )
        if (!result.allowed) return result
      }
    }

    return { allowed: true }
  }

  private checkWordFilter(
    content: string,
    config: WordFilterConfig
  ): { allowed: boolean; reason?: string; flagged?: boolean; flagReason?: string } {
    if (!config.words?.length) return { allowed: true }
    const lower = content.toLowerCase()
    for (const word of config.words) {
      if (lower.includes(word.toLowerCase())) {
        if (config.action === 'block') {
          return { allowed: false, reason: 'Message contains a blocked word' }
        }
        if (config.action === 'flag') {
          return { allowed: true, flagged: true, flagReason: `Contains flagged word: "${word}"` }
        }
      }
    }
    return { allowed: true }
  }

  private checkLinkFilter(
    content: string,
    config: LinkFilterConfig
  ): { allowed: boolean; reason?: string } {
    const urlRegex = /https?:\/\/[^\s]+/gi
    const urls = content.match(urlRegex)
    if (!urls || urls.length === 0) return { allowed: true }

    if (config.blockAll) {
      const allowed = config.allowedDomains ?? []
      for (const url of urls) {
        try {
          const hostname = new URL(url).hostname
          if (!allowed.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
            return { allowed: false, reason: 'Links are not allowed in this server' }
          }
        } catch {
          return { allowed: false, reason: 'Invalid link detected' }
        }
      }
    }

    return { allowed: true }
  }

  private async checkSpamDetection(
    serverId: string,
    userId: string,
    content: string,
    config: SpamDetectionConfig
  ): Promise<{ allowed: boolean; reason?: string }> {
    const rateKey = `automod:rate:${serverId}:${userId}`
    const dupeKey = `automod:dupe:${serverId}:${userId}`
    const maxPerMinute = config.maxMessagesPerMinute || 10
    const windowSec = config.windowSeconds || 60
    const maxDupes = config.maxDuplicates || 3

    const client = this.redis.client

    const count = await client.incr(rateKey)
    if (count === 1) {
      await client.expire(rateKey, 60)
    }
    if (count > maxPerMinute) {
      return { allowed: false, reason: 'You are sending messages too quickly' }
    }

    const contentHash = content.trim().toLowerCase().slice(0, 100)
    const dupeCount = await client.incr(`${dupeKey}:${contentHash}`)
    if (dupeCount === 1) {
      await client.expire(`${dupeKey}:${contentHash}`, windowSec)
    }
    if (dupeCount > maxDupes) {
      return { allowed: false, reason: 'Duplicate message detected' }
    }

    return { allowed: true }
  }

  async getRule(serverId: string, type: AutoModType) {
    const rule = await this.prisma.autoModRule.findUnique({
      where: { serverId_type: { serverId, type } }
    })
    return rule
      ? { id: rule.id, type: rule.type, enabled: rule.enabled, config: rule.config }
      : { id: null, type, enabled: false, config: this.defaultConfig(type) }
  }

  async getRules(serverId: string) {
    const rules = await this.prisma.autoModRule.findMany({
      where: { serverId }
    })
    const ruleMap = new Map(rules.map((r) => [r.type, r]))

    return Object.values(AutoModType).map((type) => {
      const rule = ruleMap.get(type)
      return rule
        ? { id: rule.id, type: rule.type, enabled: rule.enabled, config: rule.config }
        : { id: null, type, enabled: false, config: this.defaultConfig(type) }
    })
  }

  async upsertRule(
    serverId: string,
    userId: string,
    type: AutoModType,
    enabled: boolean,
    config: AutoModConfig
  ) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_SERVER)

    const rule = await this.prisma.autoModRule.upsert({
      where: { serverId_type: { serverId, type } },
      create: { serverId, type, enabled, config: config as object },
      update: { enabled, config: config as object }
    })

    return { id: rule.id, type: rule.type, enabled: rule.enabled, config: rule.config }
  }

  private defaultConfig(type: AutoModType): object {
    switch (type) {
      case 'word_filter':
        return { words: [], action: 'block' }
      case 'link_filter':
        return { blockAll: false, allowedDomains: [] }
      case 'spam_detection':
        return { maxDuplicates: 3, windowSeconds: 60, maxMessagesPerMinute: 10 }
    }
  }
}
