/**
 * BYOK stock media — the app calls Unsplash / Pexels DIRECTLY with the user's
 * own key (see keys.ts); nothing goes through Orbit's servers. Results are
 * normalized to `StockItem`. Unsplash's ToS requires attribution and pinging the
 * download endpoint when an asset is used — `triggerUnsplashDownload` does that.
 */
import { getStockKey, type StockProvider } from './keys';

export type StockKind = 'image' | 'video';

export interface StockItem {
  id: string;
  provider: StockProvider;
  kind: StockKind;
  /** Small preview URL for the grid. */
  thumb: string;
  /** Full asset URL to download onto the timeline. */
  full: string;
  attribution: string;
  /** Video length in seconds (videos only). */
  duration?: number;
  /** Unsplash `download_location` to ping on use (ToS). */
  downloadTrigger?: string;
}

class MissingKeyError extends Error {
  constructor(public provider: StockProvider) {
    super(`No ${provider} API key set`);
  }
}
export const isMissingKey = (e: unknown): e is MissingKeyError => e instanceof MissingKeyError;

async function unsplashImages(query: string, key: string): Promise<StockItem[]> {
  const res = await fetch(`https://api.unsplash.com/search/photos?per_page=30&query=${encodeURIComponent(query)}&client_id=${key}`);
  if (!res.ok) throw new Error(`Unsplash: ${res.status}`);
  const data = (await res.json()) as { results: any[] };
  return (data.results ?? []).map((p) => ({
    id: `u_${p.id}`,
    provider: 'unsplash' as const,
    kind: 'image' as const,
    thumb: p.urls.small,
    full: p.urls.regular,
    attribution: `Photo by ${p.user?.name ?? 'Unsplash'} on Unsplash`,
    downloadTrigger: p.links?.download_location,
  }));
}

async function pexelsImages(query: string, key: string): Promise<StockItem[]> {
  const res = await fetch(`https://api.pexels.com/v1/search?per_page=30&query=${encodeURIComponent(query)}`, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels: ${res.status}`);
  const data = (await res.json()) as { photos: any[] };
  return (data.photos ?? []).map((p) => ({
    id: `p_${p.id}`,
    provider: 'pexels' as const,
    kind: 'image' as const,
    thumb: p.src.medium,
    full: p.src.large2x ?? p.src.large ?? p.src.original,
    attribution: `Photo by ${p.photographer ?? 'Pexels'} on Pexels`,
  }));
}

async function pexelsVideos(query: string, key: string): Promise<StockItem[]> {
  const res = await fetch(`https://api.pexels.com/videos/search?per_page=20&query=${encodeURIComponent(query)}`, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels: ${res.status}`);
  const data = (await res.json()) as { videos: any[] };
  return (data.videos ?? []).map((v) => {
    // pick a reasonable-size mp4 (<= ~1080p wide) so downloads stay sane.
    const files = (v.video_files ?? []).filter((f: any) => f.file_type === 'video/mp4');
    const pick = files.sort((a: any, b: any) => (a.width ?? 0) - (b.width ?? 0)).find((f: any) => (f.width ?? 0) >= 1080) ?? files[files.length - 1] ?? v.video_files?.[0];
    return {
      id: `pv_${v.id}`,
      provider: 'pexels' as const,
      kind: 'video' as const,
      thumb: v.image,
      full: pick?.link ?? '',
      attribution: `Video by ${v.user?.name ?? 'Pexels'} on Pexels`,
      duration: typeof v.duration === 'number' ? v.duration : undefined,
    };
  });
}

/** Search a provider for images or videos with the user's key. */
export async function searchStock(provider: StockProvider, query: string, kind: StockKind): Promise<StockItem[]> {
  const key = await getStockKey(provider);
  if (!key) throw new MissingKeyError(provider);
  if (kind === 'video') {
    if (provider !== 'pexels') return []; // Unsplash has no video API
    return pexelsVideos(query, key);
  }
  return provider === 'unsplash' ? unsplashImages(query, key) : pexelsImages(query, key);
}

/** Ping Unsplash's download endpoint when an asset is actually used (required by their ToS). */
export async function triggerUnsplashDownload(item: StockItem): Promise<void> {
  if (item.provider !== 'unsplash' || !item.downloadTrigger) return;
  const key = await getStockKey('unsplash');
  if (!key) return;
  try {
    await fetch(`${item.downloadTrigger}&client_id=${key}`);
  } catch {
    /* best-effort */
  }
}
