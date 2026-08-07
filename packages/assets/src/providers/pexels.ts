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

  /**
   * Choose one of a Pexels video's renditions.
   *
   * It used to take `video_files[0]`, which is not a default — Pexels returns
   * the renditions in no useful order, so that is a coin flip between a 4K
   * master (a download measured in hundreds of megabytes, for a frame that gets
   * scaled down anyway) and a 640x360 preview that arrives soft. It can also be
   * `.webm`, which resvg-adjacent parts of the pipeline and some players will
   * not touch.
   *
   * So: mp4 only, smallest rendition that still reaches 1080 on its long edge,
   * falling back to the largest available when nothing does. Lifted from
   * `apps/mobile/src/content/stock.ts`, which has been doing it correctly for
   * as long as this has not.
   */
  private pickVideoFile(item: any): string {
    const files = (item.video_files ?? []).filter(
      (f: any) => f.file_type === 'video/mp4',
    );
    const bySize = [...files].sort((a: any, b: any) => (a.width ?? 0) - (b.width ?? 0));
    const pick =
      bySize.find((f: any) => (f.width ?? 0) >= 1080) ??
      bySize[bySize.length - 1] ??
      item.video_files?.[0];
    return pick?.link ?? '';
  }

  private mapAsset(item: any): Asset {
    if (this.mode === 'videos') {
      return {
        id: String(item.id),
        type: 'video',
        src: this.pickVideoFile(item),
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
