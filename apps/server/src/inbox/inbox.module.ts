import { Module } from '@nestjs/common'
import { RolesModule } from '../roles/roles.module'
import { InboxController } from './inbox.controller'
import { InboxService } from './inbox.service'

@Module({
  imports: [RolesModule],
  controllers: [InboxController],
  providers: [InboxService]
})
export class InboxModule {}
