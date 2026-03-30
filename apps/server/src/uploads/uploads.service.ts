import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttachmentType } from '@prisma/client';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { extname, join, resolve } from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffprobe = require('ffprobe') as (
  filePath: string,
  opts: { path: string },
) => Promise<{ streams?: { codec_type?: string; width?: number; height?: number }[] }>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffprobePath: string = require('ffprobe-static').path;

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
]);
const GIF_MIME = 'image/gif';
const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);
const ALLOWED_MIMES = new Set([
  ...IMAGE_MIMES,
  GIF_MIME,
  ...VIDEO_MIMES,
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/x-rar-compressed',
  'application/gzip',
  'application/json',
]);

const THUMB_SIZE = 400;

@Injectable()
export class UploadsService {
  private readonly uploadDir: string;
  private readonly maxSizeMb: number;

  constructor(private readonly config: ConfigService) {
    this.uploadDir = resolve(config.get<string>('UPLOAD_DIR', './uploads'));
    this.maxSizeMb = config.get<number>('MAX_UPLOAD_SIZE_MB', 50);
    for (const sub of ['avatars', 'attachments', 'thumbnails', 'emoji']) {
      this.ensureDir(join(this.uploadDir, sub));
    }
  }

  private ensureDir(dir: string) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  getMaxSizeMb(): number {
    return this.maxSizeMb;
  }

  getUploadDir(): string {
    return this.uploadDir;
  }

  async saveAvatar(file: Express.Multer.File): Promise<string> {
    const ext = 'webp';
    const filename = `${uuidv4()}.${ext}`;
    const dest = join(this.uploadDir, 'avatars', filename);

    await sharp(file.buffer)
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 85 })
      .toFile(dest);

    return `/api/uploads/avatars/${filename}`;
  }

  async saveAttachment(file: Express.Multer.File): Promise<{
    url: string;
    thumbnailUrl: string | null;
    type: AttachmentType;
    mimeType: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
    filename: string;
  }> {
    const maxBytes = this.maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(
        `File too large. Max ${this.maxSizeMb}MB allowed.`,
      );
    }

    const mime = file.mimetype.toLowerCase();
    if (!ALLOWED_MIMES.has(mime)) {
      throw new BadRequestException(`File type ${mime} is not allowed.`);
    }

    const attachType = this.classifyMime(mime);
    let savedExt = extname(file.originalname).toLowerCase() || this.mimeToExt(mime);
    let savedMime = mime;
    const id = uuidv4();

    let width: number | null = null;
    let height: number | null = null;
    let thumbnailUrl: string | null = null;

    if (attachType === AttachmentType.image) {
      const isHeic = mime === 'image/heic' || mime === 'image/heif';
      let imageBuffer = file.buffer;

      if (isHeic) {
        imageBuffer = await sharp(file.buffer).jpeg({ quality: 90 }).toBuffer();
        savedExt = '.jpg';
        savedMime = 'image/jpeg';
      }

      const meta = await sharp(imageBuffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;

      const savedName = `${id}${savedExt}`;
      const dest = join(this.uploadDir, 'attachments', savedName);
      writeFileSync(dest, imageBuffer);

      const thumbName = `${id}_thumb.webp`;
      const thumbDest = join(this.uploadDir, 'thumbnails', thumbName);
      await sharp(imageBuffer)
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(thumbDest);
      thumbnailUrl = `/api/uploads/thumbnails/${thumbName}`;
    } else {
      const savedName = `${id}${savedExt}`;
      const dest = join(this.uploadDir, 'attachments', savedName);
      writeFileSync(dest, file.buffer);

      if (attachType === AttachmentType.gif) {
        try {
          const meta = await sharp(file.buffer, { animated: false }).metadata();
          width = meta.width ?? null;
          height = meta.height ?? null;
        } catch {
          /* can't read gif metadata */
        }
      } else if (attachType === AttachmentType.video) {
        try {
          const info = await ffprobe(dest, { path: ffprobePath });
          const videoStream = info.streams?.find((s) => s.codec_type === 'video');
          if (videoStream) {
            width = videoStream.width ?? null;
            height = videoStream.height ?? null;
          }
        } catch {
          /* ffprobe unavailable or failed – leave dimensions null */
        }
      }
    }

    return {
      url: `/api/uploads/attachments/${id}${savedExt}`,
      thumbnailUrl,
      type: attachType,
      mimeType: savedMime,
      sizeBytes: file.size,
      width,
      height,
      filename: file.originalname,
    };
  }

  private classifyMime(mime: string): AttachmentType {
    if (mime === GIF_MIME) return AttachmentType.gif;
    if (IMAGE_MIMES.has(mime)) return AttachmentType.image;
    if (VIDEO_MIMES.has(mime)) return AttachmentType.video;
    return AttachmentType.file;
  }

  private mimeToExt(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/avif': '.avif',
      'image/heic': '.heic',
      'image/heif': '.heif',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'application/zip': '.zip',
      'application/json': '.json',
    };
    return map[mime] ?? '.bin';
  }

  async saveEmoji(file: Express.Multer.File): Promise<string> {
    const ext = 'webp';
    const filename = `${uuidv4()}.${ext}`;
    const dest = join(this.uploadDir, 'emoji', filename);

    await sharp(file.buffer)
      .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90 })
      .toFile(dest);

    return `/api/uploads/emoji/${filename}`;
  }

  deleteFile(urlPath: string) {
    const relativePath = urlPath.replace(/^\/api\/uploads\//, '');
    const fullPath = resolve(this.uploadDir, relativePath);
    if (!fullPath.startsWith(this.uploadDir)) return;
    try {
      unlinkSync(fullPath);
    } catch {
      // file may not exist
    }
  }
}
