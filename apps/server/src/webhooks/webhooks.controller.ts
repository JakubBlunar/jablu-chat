import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateWebhookDto, ExecuteWebhookDto } from './dto';
import { WebhooksService } from './webhooks.service';

@Controller()
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('channels/:channelId/webhooks')
  @UseGuards(AuthGuard('jwt'))
  create(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
    @Body() dto: CreateWebhookDto,
  ) {
    return this.webhooks.createWebhook(channelId, user.id, dto.name);
  }

  @Get('channels/:channelId/webhooks')
  @UseGuards(AuthGuard('jwt'))
  list(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: { id: string; username: string; email: string },
  ) {
    return this.webhooks.getWebhooks(channelId, user.id);
  }

  @Delete('webhooks/:id')
  @UseGuards(AuthGuard('jwt'))
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; username: string; email: string },
  ) {
    await this.webhooks.deleteWebhook(id, user.id);
  }

  @Post('webhooks/:token/execute')
  execute(
    @Param('token', ParseUUIDPipe) token: string,
    @Body() dto: ExecuteWebhookDto,
  ) {
    return this.webhooks.executeWebhook(token, dto.content, dto.username, dto.avatarUrl);
  }
}
