import type { AssetProvider, Asset, SearchOptions } from '@orbit/shared';

export class UnsplashProvider implements AssetProvider {
  readonly id = 'unsplash';

  constructor(private apiKey: string) {}

  async search(query: string, options: SearchOptions = {}): Promise<Asset[]> {
    const params = new URLSearchParams({
      query,
      page: String(options.page || 1),
      per_page: String(options.perPage || 20),
    });

    const response = await fetch(
      `https://api.unsplash.com/search/photos?${params}`,
      {
        headers: { Authorization: `Client-ID ${this.apiKey}` },
      }
    );

    if (!response.ok) {
      throw new Error(`Unsplash API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.results.map((item: unknown) => this.mapAsset(item));
  }

  async getById(id: string): Promise<Asset> {
    const response = await fetch(`https://api.unsplash.com/photos/${id}`, {
      headers: { Authorization: `Client-ID ${this.apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`Unsplash API error: ${response.statusText}`);
    }

    return this.mapAsset(await response.json());
  }

  private mapAsset(item: any): Asset {
    return {
      id: item.id,
      type: 'image',
      src: item.urls.regular,
      thumbnail: item.urls.small,
      width: item.width,
      height: item.height,
      metadata: {
        author: item.user?.name,
        description: item.description,
      },
    };
  }
}
