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

const ALLOWED_MIMETYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/x-tar',
  'application/gzip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]

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
      limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? '50', 10) || 50) * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(new BadRequestException('File type not allowed'), false)
        }
      }
    }),
  )
  async uploadAttachment(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { id: string },
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > this.maxSizeBytes) {
      throw new BadRequestException(
        `File exceeds the maximum upload size of ${Math.round(this.maxSizeBytes / 1024 / 1024)} MB`,
      );
    }

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
    const baseDir = resolve(this.uploads.getUploadDir(), subdir);
    const fullPath = resolve(baseDir, safe);

    if (!fullPath.startsWith(baseDir) || !existsSync(fullPath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    return res.sendFile(fullPath);
  }
}
