import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'

interface JwtPayload {
  sub: string
  iat: number
  exp: number
}

const JWT_CACHE_TTL = 60

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {
    const secret = config.get<string>('JWT_SECRET')
    if (!secret) throw new Error('JWT_SECRET environment variable is required')
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret
    })
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

  async validate(payload: JwtPayload) {
    const cacheKey = `user:jwt:${payload.sub}`

    const cached = await this.redisGet(cacheKey)
    if (cached) {
      try {
        return JSON.parse(cached)
      } catch {
        /* corrupted cache entry — fall through */
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, email: true }
    })
    if (!user) {
      throw new UnauthorizedException()
    }

    this.redisSet(cacheKey, JSON.stringify(user), JWT_CACHE_TTL)
    return user
  }
}
