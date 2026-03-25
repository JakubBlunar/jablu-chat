import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { IsNotEmpty, IsString } from 'class-validator'
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
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async subscribe(@CurrentUser() user: { id: string }, @Body() dto: SubscribeDto) {
    await this.push.subscribe(user.id, dto.endpoint, dto.p256dh, dto.auth)
    return { ok: true }
  }

  @Delete('unsubscribe')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async unsubscribe(@CurrentUser() user: { id: string }, @Body() dto: UnsubscribeDto) {
    await this.push.unsubscribe(dto.endpoint, user.id)
    return { ok: true }
  }
}
