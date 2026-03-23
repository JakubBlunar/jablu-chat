import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyResult {
  id: string;
  title: string;
  images: {
    original: GiphyImage;
    fixed_width_small: GiphyImage;
    fixed_width: GiphyImage;
  };
}

interface GiphyResponse {
  data: GiphyResult[];
  pagination: { total_count: number; count: number; offset: number };
}

function mapResults(results: GiphyResult[]) {
  return results.map((r) => {
    const original = r.images?.original;
    const preview = r.images?.fixed_width_small ?? r.images?.fixed_width;
    return {
      id: r.id,
      title: r.title || '',
      url: original?.url ?? '',
      preview: preview?.url ?? original?.url ?? '',
      width: Number(original?.width) || 0,
      height: Number(original?.height) || 0,
    };
  });
}

@Controller('gif')
@UseGuards(AuthGuard('jwt'))
export class GifController {
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('GIPHY_API_KEY') ?? '';
  }

  @Get('enabled')
  getEnabled() {
    return { enabled: this.apiKey.length > 0 };
  }

  @Get('search')
  async search(
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!this.apiKey) return { results: [], next: '' };
    if (!q?.trim()) return { results: [], next: '' };

    const lim = Math.min(Number(limit) || 20, 50);
    const off = Number(offset) || 0;

    const params = new URLSearchParams({
      api_key: this.apiKey,
      q: q.trim(),
      limit: String(lim),
      offset: String(off),
      rating: 'g',
    });

    const res = await fetch(`${GIPHY_BASE}/search?${params}`);
    if (!res.ok) return { results: [], next: '' };

    const data = (await res.json()) as GiphyResponse;
    const nextOffset = off + data.data.length;
    return {
      results: mapResults(data.data),
      next: nextOffset < data.pagination.total_count ? String(nextOffset) : '',
    };
  }

  @Get('trending')
  async trending(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!this.apiKey) return { results: [], next: '' };

    const lim = Math.min(Number(limit) || 20, 50);
    const off = Number(offset) || 0;

    const params = new URLSearchParams({
      api_key: this.apiKey,
      limit: String(lim),
      offset: String(off),
      rating: 'g',
    });

    const res = await fetch(`${GIPHY_BASE}/trending?${params}`);
    if (!res.ok) return { results: [], next: '' };

    const data = (await res.json()) as GiphyResponse;
    const nextOffset = off + data.data.length;
    return {
      results: mapResults(data.data),
      next: nextOffset < data.pagination.total_count ? String(nextOffset) : '',
    };
  }
}
