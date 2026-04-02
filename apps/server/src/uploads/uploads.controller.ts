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
import { UnifiedAuthGuard } from '../auth/unified-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { existsSync } from 'fs';
import { extname, resolve } from 'path';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from './uploads.service';

const ALLOWED_MIMETYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
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
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic',
  '.heif': 'image/heif', '.svg': 'image/svg+xml', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv',
  '.json': 'application/json', '.zip': 'application/zip',
  '.tar': 'application/x-tar', '.gz': 'application/gzip',
  '.doc': 'application/msword', '.rar': 'application/x-rar-compressed',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

function resolveFileMime(file: { mimetype: string; originalname: string }): string {
  const mime = file.mimetype?.toLowerCase()
  if (mime && mime !== 'application/octet-stream' && ALLOWED_MIMETYPES.has(mime)) return mime
  const ext = extname(file.originalname).toLowerCase()
  return EXT_TO_MIME[ext] ?? mime
}

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
  @UseGuards(UnifiedAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? '50', 10) || 50) * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const resolved = resolveFileMime(file)
        if (ALLOWED_MIMETYPES.has(resolved)) {
          file.mimetype = resolved
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
