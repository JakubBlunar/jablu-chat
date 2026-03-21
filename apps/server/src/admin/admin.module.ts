import { Module } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminController } from './admin.controller';

@Module({
  controllers: [AdminController],
  providers: [AdminAuthGuard],
})
export class AdminModule {}
