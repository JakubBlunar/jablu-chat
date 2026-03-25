import { Module } from '@nestjs/common'
import { GifController } from './gif.controller'

@Module({
  controllers: [GifController]
})
export class GifModule {}
