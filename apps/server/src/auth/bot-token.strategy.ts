import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { createHash } from 'node:crypto'
import { Strategy } from 'passport-custom'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'

const BOT_CACHE_TTL = 60

export function hashBotToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

@Injectable()
export class BotTokenStrategy extends PassportStrategy(Strategy, 'bot-token') {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {
    super()
  }

  async validate(req: { headers: Record<string, string | undefined> }): Promise<any> {
    const authHeader = req.headers['authorization'] ?? ''
    if (!authHeader.startsWith('Bot ')) {
      throw new UnauthorizedException()
    }

    const token = authHeader.slice(4).trim()
    if (!token) {
      throw new UnauthorizedException()
    }

    const tokenHash = hashBotToken(token)
    const cacheKey = `bot:token:${tokenHash}`

    const cached = await this.redisGet(cacheKey)
    if (cached) {
      try {
        return JSON.parse(cached)
      } catch {
        /* corrupted — fall through */
      }
    }

    const botApp = await this.prisma.botApplication.findFirst({
      where: { tokenHash },
      select: {
        id: true,
        user: { select: { id: true, username: true, displayName: true, isBot: true } }
      }
    })

    if (!botApp) {
      throw new UnauthorizedException()
    }

    const user = { ...botApp.user, botAppId: botApp.id }
    this.redisSet(cacheKey, JSON.stringify(user), BOT_CACHE_TTL)
    return user
  }

  private async redisGet(key: string): Promise<string | null> {
    if (this.redis.client.status !== 'ready') return null
    try {
      return await this.redis.client.get(key)
    } catch {
      return null
    }
  }

  private redisSet(key: string, value: string, ttl: number) {
    if (this.redis.client.status !== 'ready') return
    this.redis.client.set(key, value, 'EX', ttl).catch(() => {})
  }
}
