import type { AssetProvider, Asset, SearchOptions } from '@orbit/shared';

export class PexelsProvider implements AssetProvider {
  readonly id = 'pexels';

  constructor(
    private apiKey: string,
    private mode: 'photos' | 'videos' = 'photos'
  ) {}

  async search(query: string, options: SearchOptions = {}): Promise<Asset[]> {
    const params = new URLSearchParams({
      query,
      page: String(options.page || 1),
      per_page: String(options.perPage || 20),
    });

    const endpoint =
      this.mode === 'videos'
        ? `https://api.pexels.com/videos/search?${params}`
        : `https://api.pexels.com/v1/search?${params}`;

    const response = await fetch(endpoint, {
      headers: { Authorization: this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Pexels API error: ${response.statusText}`);
    }

    const data = await response.json();
    const items = this.mode === 'videos' ? data.videos : data.photos;
    return items.map((item: unknown) => this.mapAsset(item));
  }

  async getById(id: string): Promise<Asset> {
    const endpoint =
      this.mode === 'videos'
        ? `https://api.pexels.com/videos/videos/${id}`
        : `https://api.pexels.com/v1/photos/${id}`;

    const response = await fetch(endpoint, {
      headers: { Authorization: this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Pexels API error: ${response.statusText}`);
    }

    return this.mapAsset(await response.json());
  }

  private mapAsset(item: any): Asset {
    if (this.mode === 'videos') {
      return {
        id: String(item.id),
        type: 'video',
        src: item.video_files?.[0]?.link || '',
        thumbnail: item.image,
        width: item.width,
        height: item.height,
        duration: item.duration,
        metadata: {
          duration: item.duration,
          author: item.user?.name,
        },
      };
    }

    return {
      id: String(item.id),
      type: 'image',
      src: item.src?.large || item.src?.original,
      thumbnail: item.src?.medium || item.src?.small,
      width: item.width,
      height: item.height,
      metadata: {
        author: item.photographer,
        url: item.url,
      },
    };
  }
}
