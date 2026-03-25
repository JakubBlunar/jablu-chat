import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  readonly client: Redis

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL', 'redis://localhost:6379')
    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: false,
      enableOfflineQueue: false
    })
    this.client.on('error', (err) => this.logger.error('Redis error', err.message))
    this.client.on('connect', () => this.logger.log('Redis connected'))
  }

  async onModuleDestroy() {
    await this.client.quit()
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await this.client.ping()
      return res === 'PONG'
    } catch {
      return false
    }
  }
}
