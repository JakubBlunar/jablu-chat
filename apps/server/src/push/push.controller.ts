import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { UnifiedAuthGuard } from '../auth/unified-auth.guard'
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { CurrentUser } from '../auth/current-user.decorator'
import { PushService } from './push.service'

class SubscribeDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string

  @IsString()
  @IsNotEmpty()
  p256dh: string

  @IsString()
  @IsNotEmpty()
  auth: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string
}

class UnsubscribeDto {
  @IsString()
  endpoint: string
}

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('vapid-key')
  getVapidKey() {
    return { key: this.push.getVapidPublicKey() }
  }

  @Post('subscribe')
  @UseGuards(UnifiedAuthGuard)
  @HttpCode(HttpStatus.OK)
  async subscribe(@CurrentUser() user: { id: string }, @Body() dto: SubscribeDto) {
    await this.push.subscribe(user.id, dto.endpoint, dto.p256dh, dto.auth, dto.deviceId)
    return { ok: true }
  }

  /**
   * Sends a real push through the full queue to this user's registered devices, so
   * a device that silently fails to receive can be identified without waiting for
   * someone to message you.
   */
  @Post('test')
  @UseGuards(UnifiedAuthGuard)
  @HttpCode(HttpStatus.OK)
  async test(@CurrentUser() user: { id: string }) {
    const devices = await this.push.countSubscriptions(user.id)
    await this.push.sendTest(user.id, {
      title: 'Jablu test notification',
      body: 'Push is working on this device.',
      url: '/channels/@me'
    })
    return { ok: true, devices }
  }

  @Delete('unsubscribe')
  @UseGuards(UnifiedAuthGuard)
  @HttpCode(HttpStatus.OK)
  async unsubscribe(@CurrentUser() user: { id: string }, @Body() dto: UnsubscribeDto) {
    await this.push.unsubscribe(dto.endpoint, user.id)
    return { ok: true }
  }
}
