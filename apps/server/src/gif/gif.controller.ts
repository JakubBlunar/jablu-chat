import { Controller, Get, HttpException, HttpStatus, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ConfigService } from '@nestjs/config'
import { CurrentUser } from '../auth/current-user.decorator'
import { RedisService } from '../redis/redis.service'

const GIPHY_BASE = 'https://api.giphy.com/v1/gifs'
const GIF_RATE_LIMIT = 30
const GIF_RATE_WINDOW = 60

interface GiphyImage {
  url: string
  width: string
  height: string
}

interface GiphyResult {
  id: string
  title: string
  images: {
    original: GiphyImage
    fixed_width_small: GiphyImage
    fixed_width: GiphyImage
  }
}

interface GiphyResponse {
  data: GiphyResult[]
  pagination: { total_count: number; count: number; offset: number }
}

function mapResults(results: GiphyResult[]) {
  return results.map((r) => {
    const original = r.images?.original
    const preview = r.images?.fixed_width_small ?? r.images?.fixed_width
    return {
      id: r.id,
      title: r.title || '',
      url: original?.url ?? '',
      preview: preview?.url ?? original?.url ?? '',
      width: Number(original?.width) || 0,
      height: Number(original?.height) || 0
    }
  })
}

@Controller('gif')
@UseGuards(AuthGuard('jwt'))
export class GifController {
  private readonly apiKey: string

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService
  ) {
    this.apiKey = this.config.get<string>('GIPHY_API_KEY') ?? ''
  }

  private async checkRateLimit(userId: string) {
    const key = `rl:gif:${userId}`
    try {
      const count = await this.redis.client.incr(key)
      if (count === 1) await this.redis.client.expire(key, GIF_RATE_WINDOW)
      if (count > GIF_RATE_LIMIT) {
        throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS)
      }
    } catch (err) {
      if (err instanceof HttpException) throw err
      throw new HttpException('Service temporarily unavailable', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  @Get('enabled')
  getEnabled() {
    return { enabled: this.apiKey.length > 0 }
  }

  @Get('search')
  async search(
    @CurrentUser() user: { id: string },
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    if (!this.apiKey) return { results: [], next: '' }
    if (!q?.trim()) return { results: [], next: '' }

    await this.checkRateLimit(user.id)

    const lim = Math.min(Number(limit) || 20, 50)
    const off = Number(offset) || 0

    const params = new URLSearchParams({
      api_key: this.apiKey,
      q: q.trim(),
      limit: String(lim),
      offset: String(off),
      rating: 'g'
    })

    const res = await fetch(`${GIPHY_BASE}/search?${params}`)
    if (!res.ok) return { results: [], next: '' }

    const data = (await res.json()) as GiphyResponse
    const nextOffset = off + data.data.length
    return {
      results: mapResults(data.data),
      next: nextOffset < data.pagination.total_count ? String(nextOffset) : ''
    }
  }

  @Get('trending')
  async trending(
    @CurrentUser() user: { id: string },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    if (!this.apiKey) return { results: [], next: '' }

    await this.checkRateLimit(user.id)

    const lim = Math.min(Number(limit) || 20, 50)
    const off = Number(offset) || 0

    const params = new URLSearchParams({
      api_key: this.apiKey,
      limit: String(lim),
      offset: String(off),
      rating: 'g'
    })

    const res = await fetch(`${GIPHY_BASE}/trending?${params}`)
    if (!res.ok) return { results: [], next: '' }

    const data = (await res.json()) as GiphyResponse
    const nextOffset = off + data.data.length
    return {
      results: mapResults(data.data),
      next: nextOffset < data.pagination.total_count ? String(nextOffset) : ''
    }
  }
}
