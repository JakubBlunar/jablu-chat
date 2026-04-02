import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RolesModule } from '../roles/roles.module'
import { BotRateLimiterGuard } from './bot-rate-limiter'
import { BotsController } from './bots.controller'
import { BotsService } from './bots.service'

@Module({
  imports: [AuthModule, RolesModule],
  controllers: [BotsController],
  providers: [BotsService, BotRateLimiterGuard],
  exports: [BotsService]
})
export class BotsModule {}
