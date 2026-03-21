import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
const FETCH_TIMEOUT = 5000;

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

  private async fetchOgMeta(url: string): Promise<{
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    siteName: string | null;
  }> {
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

      if (!res.ok) return { title: null, description: null, imageUrl: null, siteName: null };

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) {
        return { title: null, description: null, imageUrl: null, siteName: null };
      }

      const html = await res.text();
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
