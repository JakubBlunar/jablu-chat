import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  private readonly maxSizeBytes: number;

  constructor(
    private readonly uploads: UploadsService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const mb = config.get<number>('MAX_UPLOAD_SIZE_MB', 50);
    this.maxSizeBytes = mb * 1024 * 1024;
  }

  @Get('config')
  getConfig() {
    return { maxSizeMb: this.uploads.getMaxSizeMb() };
  }

  @Post('attachments')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 200 * 1024 * 1024 },
    }),
  )
  async uploadAttachment(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { id: string },
  ) {
    if (!file) throw new BadRequestException('No file provided');

    const saved = await this.uploads.saveAttachment(file);

    const attachment = await this.prisma.attachment.create({
      data: {
        filename: saved.filename,
        url: saved.url,
        type: saved.type,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        width: saved.width,
        height: saved.height,
        thumbnailUrl: saved.thumbnailUrl,
        uploaderId: user.id,
      },
    });

    return attachment;
  }

  @Get('avatars/:filename')
  serveFile(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.serveFromSubdir('avatars', filename, res);
  }

  @Get('attachments/:filename')
  serveAttachment(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.serveFromSubdir('attachments', filename, res);
  }

  @Get('thumbnails/:filename')
  serveThumbnail(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    return this.serveFromSubdir('thumbnails', filename, res);
  }

  private serveFromSubdir(subdir: string, filename: string, res: Response) {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    const fullPath = resolve(this.uploads.getUploadDir(), subdir, safe);

    if (!existsSync(fullPath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    return res.sendFile(fullPath);
  }
}
