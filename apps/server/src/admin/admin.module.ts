import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CleanupModule } from '../cleanup/cleanup.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { RolesModule } from '../roles/roles.module'
import { AdminAuthGuard } from './admin-auth.guard'
import { AdminController } from './admin.controller'
import { AdminRateLimiter } from './admin-rate-limiter'
import { AdminTokenStore } from './admin-token-store'

@Module({
  imports: [AuthModule, CleanupModule, NotificationsModule, RolesModule],
  controllers: [AdminController],
  providers: [AdminAuthGuard, AdminRateLimiter, AdminTokenStore]
})
export class AdminModule {}
