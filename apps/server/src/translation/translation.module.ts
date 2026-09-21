import { Module } from '@nestjs/common'
import { RolesModule } from '../roles/roles.module'
import { TranslationController } from './translation.controller'
import { TranslationService } from './translation.service'

@Module({
  imports: [RolesModule],
  controllers: [TranslationController],
  providers: [TranslationService]
})
export class TranslationModule {}
