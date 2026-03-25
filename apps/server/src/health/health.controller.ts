import { Controller, Get, HttpCode, HttpException, HttpStatus } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  @Get()
  @HttpCode(200)
  async health() {
    let db = 'ok'
    try {
      await this.prisma.$queryRaw`SELECT 1`
    } catch {
      db = 'error'
    }
    const redisOk = await this.redis.isHealthy()
    const allOk = db === 'ok' && redisOk
    const body = {
      status: allOk ? 'ok' : 'degraded',
      db,
      redis: redisOk ? 'ok' : 'error',
      timestamp: new Date().toISOString()
    }
    if (!allOk) {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE)
    }
    return body
  }
}
