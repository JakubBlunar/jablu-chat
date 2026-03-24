import { Injectable, Logger } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { PrismaService } from '../prisma/prisma.service';

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
const FETCH_TIMEOUT = 5000;
const MAX_RESPONSE_BYTES = 1024 * 1024; // 1 MB

function isPrivateIp(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const v4match = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const addr = v4match ? v4match[1] : ip;

  if (addr.includes(':')) {
    // IPv6
    const lower = addr.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7
    if (lower.startsWith('fe80')) return true; // fe80::/10
    return false;
  }

  const parts = addr.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

async function readLimited(res: Response, limit: number): Promise<string> {
  if (!res.body) return '';
  const reader = (res.body as unknown as { getReader(): ReadableStreamDefaultReader<Uint8Array> }).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    total += value.byteLength;
    if (total > limit) {
      reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const decoder = new TextDecoder();
  return chunks.map((c) => decoder.decode(c, { stream: true })).join('') + decoder.decode();
}

@Injectable()
export class LinkPreviewService {
  private readonly logger = new Logger(LinkPreviewService.name);

  constructor(private readonly prisma: PrismaService) {}

  extractUrls(content: string | null): string[] {
    if (!content) return [];
    const matches = content.match(URL_REGEX);
    if (!matches) return [];
    const unique = [...new Set(matches)];
    return unique.slice(0, 5);
  }

  async generatePreviews(
    messageId: string,
    content: string | null,
  ): Promise<
    {
      id: string;
      url: string;
      title: string | null;
      description: string | null;
      imageUrl: string | null;
      siteName: string | null;
    }[]
  > {
    const urls = this.extractUrls(content);
    if (urls.length === 0) return [];

    const previews: {
      id: string;
      url: string;
      title: string | null;
      description: string | null;
      imageUrl: string | null;
      siteName: string | null;
    }[] = [];

    for (const url of urls) {
      try {
        if (this.isGifUrl(url)) {
          const preview = await this.prisma.linkPreview.create({
            data: {
              messageId,
              url,
              title: 'GIF',
              description: null,
              imageUrl: url,
              siteName: 'GIF',
            },
          });
          previews.push(preview);
          continue;
        }

        if (this.isImageUrl(url)) {
          const preview = await this.prisma.linkPreview.create({
            data: {
              messageId,
              url,
              title: 'Image',
              description: null,
              imageUrl: url,
              siteName: 'Image',
            },
          });
          previews.push(preview);
          continue;
        }

        const meta = await this.fetchOgMeta(url);
        if (!meta.title && !meta.description) continue;

        const preview = await this.prisma.linkPreview.create({
          data: {
            messageId,
            url,
            title: meta.title,
            description: meta.description,
            imageUrl: meta.imageUrl,
            siteName: meta.siteName,
          },
        });
        previews.push(preview);
      } catch (e) {
        this.logger.warn(`Failed to fetch OG for ${url}: ${e}`);
      }
    }

    return previews;
  }

  private isGifUrl(url: string): boolean {
    try {
      const u = new URL(url);
      const path = u.pathname.toLowerCase();
      if (path.endsWith('.gif')) return true;
      if (u.hostname === 'media.tenor.com' && /\.(gif|mp4)$/i.test(path)) return true;
      if (/^media\d*\.giphy\.com$/i.test(u.hostname)) return true;
      if (u.hostname === 'i.giphy.com') return true;
    } catch {}
    return false;
  }

  private static readonly IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg']);

  private isImageUrl(url: string): boolean {
    try {
      const u = new URL(url);
      const path = u.pathname.toLowerCase();
      const ext = path.slice(path.lastIndexOf('.'));
      return LinkPreviewService.IMAGE_EXTS.has(ext);
    } catch {}
    return false;
  }

  private async isSafeUrl(url: string): Promise<boolean> {
    try {
      const { hostname } = new URL(url);
      const { address } = await lookup(hostname);
      return !isPrivateIp(address);
    } catch {
      return false;
    }
  }

  private async fetchOgMeta(url: string): Promise<{
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    siteName: string | null;
  }> {
    const empty = { title: null, description: null, imageUrl: null, siteName: null };

    if (!(await this.isSafeUrl(url))) return empty;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'ChatBot/1.0 (link preview)',
          Accept: 'text/html',
        },
        redirect: 'follow',
      });

      if (!res.ok) return empty;

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) return empty;

      const html = await readLimited(res, MAX_RESPONSE_BYTES);
      return this.parseOgTags(html);
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseOgTags(html: string): {
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    siteName: string | null;
  } {
    const getMetaContent = (property: string): string | null => {
      const patterns = [
        new RegExp(
          `<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`,
          'i',
        ),
        new RegExp(
          `<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`,
          'i',
        ),
        new RegExp(
          `<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`,
          'i',
        ),
        new RegExp(
          `<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${property}["']`,
          'i',
        ),
      ];
      for (const p of patterns) {
        const m = html.match(p);
        if (m?.[1]) return m[1].trim();
      }
      return null;
    };

    let title =
      getMetaContent('og:title') ??
      getMetaContent('twitter:title');
    if (!title) {
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      title = titleMatch?.[1]?.trim() ?? null;
    }

    const description =
      getMetaContent('og:description') ??
      getMetaContent('twitter:description') ??
      getMetaContent('description');

    const imageUrl =
      getMetaContent('og:image') ?? getMetaContent('twitter:image');

    const siteName = getMetaContent('og:site_name');

    return {
      title: title ? title.substring(0, 300) : null,
      description: description ? description.substring(0, 500) : null,
      imageUrl: imageUrl || null,
      siteName: siteName ? siteName.substring(0, 100) : null,
    };
  }
}
