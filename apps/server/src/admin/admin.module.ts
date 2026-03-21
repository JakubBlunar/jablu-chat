import { Module } from '@nestjs/common';
import { CleanupModule } from '../cleanup/cleanup.module';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminController } from './admin.controller';

@Module({
  imports: [CleanupModule],
  controllers: [AdminController],
  providers: [AdminAuthGuard],
})
export class AdminModule {}
