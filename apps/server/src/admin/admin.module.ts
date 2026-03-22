import { Module } from '@nestjs/common';
import { CleanupModule } from '../cleanup/cleanup.module';
import { PushModule } from '../push/push.module';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminController } from './admin.controller';
import { AdminRateLimiter } from './admin-rate-limiter';
import { AdminTokenStore } from './admin-token-store';

@Module({
  imports: [CleanupModule, PushModule],
  controllers: [AdminController],
  providers: [AdminAuthGuard, AdminRateLimiter, AdminTokenStore],
})
export class AdminModule {}
