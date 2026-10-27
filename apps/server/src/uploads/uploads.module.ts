import { Global, Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { UploadAdmissionInterceptor } from './upload-admission.interceptor'

@Global()
@Module({
  controllers: [UploadsController],
  providers: [UploadsService, UploadAdmissionInterceptor],
  exports: [UploadsService],
})
export class UploadsModule {}
