import type { Photo, PhotoProvider, SearchOptions } from '../types';

/**
 * Zero-config demo photo provider backed by picsum.photos (no API key).
 * Real deployments swap in an Unsplash/Pexels provider implementing the same
 * PhotoProvider interface.
 */
export class PicsumPhotoProvider implements PhotoProvider {
  readonly id = 'picsum';
  readonly kind = 'photo' as const;

  async search(query: string, options?: SearchOptions): Promise<Photo[]> {
    const perPage = options?.perPage ?? 24;
    const page = options?.page ?? 1;
    const out: Photo[] = [];
    for (let i = 0; i < perPage; i++) {
      const seed = encodeURIComponent(`${query || 'orbit'}-${page}-${i}`);
      out.push({
        id: seed,
        src: `https://picsum.photos/seed/${seed}/1200/1200`,
        thumbnail: `https://picsum.photos/seed/${seed}/300/300`,
        width: 1200,
        height: 1200,
        author: { name: 'Picsum' },
      });
    }
    return out;
  }

  async getById(id: string): Promise<Photo> {
    return {
      id,
      src: `https://picsum.photos/seed/${id}/1200/1200`,
      thumbnail: `https://picsum.photos/seed/${id}/300/300`,
      width: 1200,
      height: 1200,
      author: { name: 'Picsum' },
    };
  }
}
