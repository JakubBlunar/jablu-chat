import { Module } from '@nestjs/common';
import { ReadStateController } from './read-state.controller';
import { ReadStateService } from './read-state.service';

@Module({
  controllers: [ReadStateController],
  providers: [ReadStateService],
  exports: [ReadStateService],
})
export class ReadStateModule {}
