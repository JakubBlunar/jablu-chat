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

  async validate(payload: JwtPayload) {
    const cacheKey = `user:jwt:${payload.sub}`

    try {
      const cached = await this.redis.client.get(cacheKey)
      if (cached) return JSON.parse(cached)
    } catch {
      /* Redis unavailable — fall through to DB */
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, email: true }
    })
    if (!user) {
      throw new UnauthorizedException()
    }

    try {
      await this.redis.client.set(cacheKey, JSON.stringify(user), 'EX', JWT_CACHE_TTL)
    } catch {
      /* best effort */
    }

    return user
  }
}
