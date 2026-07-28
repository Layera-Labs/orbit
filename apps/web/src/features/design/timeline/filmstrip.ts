'use client';

/**
 * Frame thumbnails along a timeline clip.
 *
 * STRICTLY DECORATIVE. Every entry point here can fail, stall or never resolve
 * and the clip above it still renders its surface, its label and its full width,
 * and stays draggable and trimmable throughout. Nothing about editing is gated
 * on a decode — which is also why this draws into a canvas layered *under* the
 * clip's own content rather than replacing it.
 */
import { resolveSrc } from '@/db/media';

/** Decoded thumbnails, keyed by source + quantised time + height. */
const cache = new Map<string, ImageBitmap>();
/** One detached decoder per source, shared by every clip that uses it. */
const decoders = new Map<string, Promise<HTMLVideoElement>>();

const CACHE_LIMIT = 600;
/** Seeking is expensive; two at a time keeps the main thread responsive. */
const MAX_IN_FLIGHT = 2;
let inFlight = 0;
const queue: (() => void)[] = [];

function slot(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise((release) => queue.push(() => release()));
}

function release() {
  const next = queue.shift();
  if (next) next();
  else inFlight--;
}

function remember(key: string, bitmap: ImageBitmap) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest) {
      cache.get(oldest)?.close();
      cache.delete(oldest);
    }
  }
  cache.set(key, bitmap);
}

function decoderFor(url: string): Promise<HTMLVideoElement> {
  let pending = decoders.get(url);
  if (pending) return pending;
  pending = new Promise<HTMLVideoElement>((resolve, reject) => {
    const el = document.createElement('video');
    el.preload = 'auto';
    el.muted = true;
    el.playsInline = true;
    // Local blob URLs only, but be explicit: a tainted canvas cannot be read
    // back into an ImageBitmap and the whole strip would silently blank.
    el.crossOrigin = 'anonymous';
    el.onloadeddata = () => resolve(el);
    el.onerror = () => reject(new Error('decode failed'));
    el.src = url;
  });
  decoders.set(url, pending);
  return pending;
}

/** A single frame, at `height` px tall, or null if it cannot be produced. */
async function frameAt(url: string, t: number, height: number): Promise<ImageBitmap | null> {
  const key = `${url}|${t.toFixed(2)}|${height}`;
  const hit = cache.get(key);
  if (hit) return hit;

  await slot();
  try {
    const el = await decoderFor(url);
    if (Math.abs(el.currentTime - t) > 0.01) {
      await new Promise<void>((done, fail) => {
        const ok = () => {
          el.removeEventListener('seeked', ok);
          el.removeEventListener('error', bad);
          done();
        };
        const bad = () => {
          el.removeEventListener('seeked', ok);
          el.removeEventListener('error', bad);
          fail(new Error('seek failed'));
        };
        el.addEventListener('seeked', ok);
        el.addEventListener('error', bad);
        el.currentTime = t;
      });
    }
    if (!el.videoWidth) return null;
    const bitmap = await createImageBitmap(el, {
      resizeHeight: height,
      resizeQuality: 'low',
    });
    remember(key, bitmap);
    return bitmap;
  } catch {
    return null;
  } finally {
    release();
  }
}

export interface FilmstripRequest {
  src: string;
  kind: 'video' | 'image';
  /** Source seconds at the clip's head. */
  trimIn: number;
  /** Timeline seconds the clip occupies. */
  duration: number;
  speed: number;
  /** CSS pixels. */
  width: number;
  height: number;
}

/**
 * Paint a strip of frames across `canvas`.
 *
 * Returns an abort function. Frames appear as they arrive, left to right, so a
 * slow source fills in progressively rather than showing nothing until the end.
 */
export function paintFilmstrip(
  canvas: HTMLCanvasElement,
  req: FilmstripRequest,
): () => void {
  let cancelled = false;
  const stop = () => {
    cancelled = true;
  };

  void (async () => {
    const url = await resolveSrc(req.src);
    if (!url || cancelled) return;

    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(req.width));
    const h = Math.max(1, Math.round(req.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx || cancelled) return;
    ctx.scale(dpr, dpr);

    // A still has one frame; tile it rather than seeking a video that isn't one.
    if (req.kind === 'image') {
      const img = new Image();
      img.src = url;
      try {
        await img.decode();
      } catch {
        return;
      }
      if (cancelled) return;
      const tile = (img.naturalWidth / img.naturalHeight) * h || h;
      for (let x = 0; x < w; x += tile) ctx.drawImage(img, x, 0, tile, h);
      return;
    }

    // Frames are ~16:9 at lane height. Cap the count so a long clip at high zoom
    // does not queue hundreds of seeks.
    const tile = Math.max(24, Math.round(h * 1.6));
    const count = Math.min(40, Math.max(1, Math.ceil(w / tile)));
    for (let i = 0; i < count; i++) {
      if (cancelled) return;
      // Sample at the tile's centre — the first pixel column of a clip is rarely
      // the most representative frame of what it contains.
      const progress = (i + 0.5) / count;
      const t = req.trimIn + progress * req.duration * req.speed;
      const bitmap = await frameAt(url, Math.max(0, t), Math.round(h * dpr));
      if (cancelled) return;
      if (!bitmap) continue;
      const drawW = (bitmap.width / bitmap.height) * h;
      ctx.drawImage(bitmap, i * tile, 0, drawW, h);
    }
  })();

  return stop;
}
