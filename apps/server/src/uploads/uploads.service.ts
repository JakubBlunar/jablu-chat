import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttachmentType } from '../prisma-client'
import { existsSync, mkdirSync } from 'fs';
import { unlink, writeFile, utimes } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'path';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto'
import { UploadWorkLimiter } from './upload-work-limiter'
import { probeVideo } from './video-metadata'


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

// A 448px chat preview stays sharp at 2x density without decoding the original.
const THUMB_SIZE = 896;

@Injectable()
export class UploadsService {
  private readonly uploadDir: string;
  private readonly maxSizeMb: number;
  private readonly uploads = new UploadWorkLimiter(4, 8)
  private readonly processing = new UploadWorkLimiter(2, 8)

  acquireUpload(signal?: AbortSignal) { return this.uploads.acquire(signal) }
  getWorkState() { return { uploads: this.uploads.state, processing: this.processing.state } }

  private processImage(dest: string, work: () => Promise<unknown>) {
    return this.processing.run(async () => {
      try { await work() } catch (error) { await unlink(dest).catch(() => {}); throw error }
    })
  }

  constructor(private readonly config: ConfigService) {
    this.uploadDir = resolve(config.get<string>('UPLOAD_DIR', './uploads'));
    this.maxSizeMb = config.get<number>('MAX_UPLOAD_SIZE_MB', 50);
    for (const sub of ['avatars', 'attachments', 'thumbnails', 'emoji', 'activity-icons']) {
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
    const filename = `${randomUUID()}.${ext}`;
    const dest = join(this.uploadDir, 'avatars', filename);

    await this.processImage(dest, () => sharp(file.buffer)
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 85 })
      .toFile(dest));

    return `/api/uploads/avatars/${filename}`;
  }

  saveAttachment(file: Express.Multer.File, signal?: AbortSignal) {
    return this.processing.run(() => this.processAttachment(file, signal), signal)
  }

  private async processAttachment(file: Express.Multer.File, signal?: AbortSignal): Promise<{
    url: string;
    thumbnailUrl: string | null;
    thumbnailWidth: number | null;
    thumbnailHeight: number | null;
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

    let mime = file.mimetype.toLowerCase();
    if (!ALLOWED_MIMES.has(mime)) {
      const fallback = this.extToMime(extname(file.originalname).toLowerCase());
      if (fallback && ALLOWED_MIMES.has(fallback)) {
        mime = fallback;
      } else {
        throw new BadRequestException(`File type ${mime} is not allowed.`);
      }
    }

    let attachType = this.classifyMime(mime);
    let savedExt = extname(file.originalname).toLowerCase() || this.mimeToExt(mime);
    let savedMime = mime;
    const id = randomUUID();

    let width: number | null = null;
    let height: number | null = null;
    let thumbnailUrl: string | null = null;
    let thumbnailWidth: number | null = null;
    let thumbnailHeight: number | null = null;

    const paths: string[] = []
    try {
      if (attachType === AttachmentType.image) {
        const isHeic = mime === 'image/heic' || mime === 'image/heif';
        let imageBuffer = file.buffer;

        if (isHeic) {
          imageBuffer = await sharp(file.buffer).jpeg({ quality: 90 }).toBuffer();
          savedExt = '.jpg';
          savedMime = 'image/jpeg';
        }

        const meta = await sharp(imageBuffer).metadata();
        const rotated = meta.orientation != null && meta.orientation >= 5 && meta.orientation <= 8;
        width = (rotated ? meta.height : meta.width) ?? null;
        height = (rotated ? meta.width : meta.height) ?? null;

        const savedName = `${id}${savedExt}`;
        const dest = join(this.uploadDir, 'attachments', savedName);
        paths.push(dest)
        await writeFile(dest, imageBuffer, { signal });

        if ((meta.pages ?? 1) > 1) {
          // Animated WebP/AVIF must keep animating just like GIF attachments.
          attachType = AttachmentType.gif;
        } else {
          const thumbName = `${id}_thumb.webp`;
          const thumbDest = join(this.uploadDir, 'thumbnails', thumbName);
          paths.push(thumbDest)
          const preview = await sharp(imageBuffer)
            .rotate()
            .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(thumbDest);
          thumbnailUrl = `/api/uploads/thumbnails/${thumbName}`;
          thumbnailWidth = preview.width;
          thumbnailHeight = preview.height;
        }
      } else {
        const savedName = `${id}${savedExt}`;
        const dest = join(this.uploadDir, 'attachments', savedName);
        paths.push(dest)
        await writeFile(dest, file.buffer, { signal });

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
            const info = await probeVideo(dest, signal);
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

      signal?.throwIfAborted()
      return {
        url: `/api/uploads/attachments/${id}${savedExt}`,
        thumbnailUrl,
        thumbnailWidth,
        thumbnailHeight,
        type: attachType,
        mimeType: savedMime,
        sizeBytes: file.size,
        width,
        height,
        filename: file.originalname,
      };
    } catch (error) {
      await Promise.all(paths.map(path => unlink(path).catch(() => {})))
      throw error
    }
  }

  private classifyMime(mime: string): AttachmentType {
    if (mime === GIF_MIME) return AttachmentType.gif;
    if (IMAGE_MIMES.has(mime)) return AttachmentType.image;
    if (VIDEO_MIMES.has(mime)) return AttachmentType.video;
    return AttachmentType.file;
  }

  private static readonly MIME_EXT_MAP: Record<string, string> = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'image/gif': '.gif', 'image/avif': '.avif', 'image/heic': '.heic',
    'image/heif': '.heif', 'video/mp4': '.mp4', 'video/webm': '.webm',
    'video/quicktime': '.mov', 'application/pdf': '.pdf', 'text/plain': '.txt',
    'application/zip': '.zip', 'application/json': '.json',
    'application/x-rar-compressed': '.rar', 'application/gzip': '.gz',
  };

  private static readonly EXT_MIME_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(UploadsService.MIME_EXT_MAP).map(([m, e]) => [e, m]),
  );

  private mimeToExt(mime: string): string {
    return UploadsService.MIME_EXT_MAP[mime] ?? '.bin';
  }

  private extToMime(ext: string): string | null {
    return UploadsService.EXT_MIME_MAP[ext] ?? null;
  }

  async saveEmoji(file: Express.Multer.File): Promise<string> {
    const ext = 'webp';
    const filename = `${randomUUID()}.${ext}`;
    const dest = join(this.uploadDir, 'emoji', filename);

    await this.processImage(dest, () => sharp(file.buffer)
      .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90 })
      .toFile(dest));

    return `/api/uploads/emoji/${filename}`;
  }

  /**
   * Saves a small activity icon (game exe icon / album art) as a 64x64 webp,
   * keyed by a caller-provided cache key (e.g. an executable-name hash) so
   * repeated uploads of the same icon are deduplicated. Returns a stable URL.
   */
  async saveActivityIcon(buffer: Buffer, key: string): Promise<string> {
    const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64) || randomUUID();
    const filename = `${safeKey}.webp`;
    const dest = join(this.uploadDir, 'activity-icons', filename);
    const url = `/api/uploads/activity-icons/${filename}`;
    if (existsSync(dest)) {
      const now = new Date();
      await utimes(dest, now, now);
      return url;
    }

    await this.processImage(dest, () => sharp(buffer)
      .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 85 })
      .toFile(dest));

    return url;
  }

  async deleteFile(urlPath: string) {
    const relativePath = urlPath.replace(/^\/api\/uploads\//, '');
    const fullPath = resolve(this.uploadDir, relativePath);
    if (!fullPath.startsWith(this.uploadDir + sep)) return;
    try {
      await unlink(fullPath);
    } catch {
      // file may not exist
    }
  }
}
