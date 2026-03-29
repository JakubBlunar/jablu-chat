import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { CurrentUser } from '../auth/current-user.decorator'
import { RedisService } from '../redis/redis.service'
import { CreateWebhookDto, ExecuteWebhookDto } from './dto'
import { WebhooksService } from './webhooks.service'

const WEBHOOK_RATE_LIMIT = 30
const WEBHOOK_RATE_WINDOW = 60

@Controller()
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly redis: RedisService
  ) {}

  @Post('channels/:channelId/webhooks')
  @UseGuards(AuthGuard('jwt'))
  create(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Body() dto: CreateWebhookDto
  ) {
    return this.webhooks.createWebhook(channelId, user.id, dto.name)
  }

  @Get('channels/:channelId/webhooks')
  @UseGuards(AuthGuard('jwt'))
  list(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string; username: string; email: string }
  ) {
    return this.webhooks.getWebhooks(channelId, user.id)
  }

  @Delete('webhooks/:id')
  @UseGuards(AuthGuard('jwt'))
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; username: string; email: string }
  ) {
    await this.webhooks.deleteWebhook(id, user.id)
  }

  @Post('webhooks/:token/execute')
  async execute(@Param('token', ParseUUIDPipe) token: string, @Body() dto: ExecuteWebhookDto) {
    const key = `rl:webhook:${token}`
    try {
      const count = await this.redis.client.incr(key)
      if (count === 1) await this.redis.client.expire(key, WEBHOOK_RATE_WINDOW)
      if (count > WEBHOOK_RATE_LIMIT) {
        throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS)
      }
    } catch (err) {
      if (err instanceof HttpException) throw err
    }
    return this.webhooks.executeWebhook(token, dto.content, dto.username, dto.avatarUrl)
  }
}
