'use client';

/**
 * Audio peaks for a timeline clip.
 *
 * Like the filmstrip, STRICTLY DECORATIVE — an audio clip renders, selects,
 * drags and trims with no peaks at all. Decoding is expensive and the result
 * never changes, so it is computed once per media row and cached in IndexedDB.
 */
import { db } from '@/db/idb';
import { getMedia } from '@/db/media';
import { mediaIdOf, waveformKey, type WaveformRow } from '@/db/schema';

const BUCKETS = 512;

export interface Peaks {
  data: Float32Array;
  /** Seconds of SOURCE the peaks span. */
  duration: number;
}

/** In-flight and resolved lookups, so ten clips of one song decode once. */
const memo = new Map<string, Promise<Peaks | null>>();

let audioContext: AudioContext | null = null;
function context(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  // Reused, and never resumed — decoding does not require a running context, so
  // this must not trip the browser's autoplay policy.
  audioContext ??= new AudioContext();
  return audioContext;
}

/**
 * Interleaved [min, max] pairs per bucket, in -1..1.
 *
 * Min AND max, not RMS: a waveform drawn from absolute averages loses the
 * asymmetry that makes speech legible at a glance.
 */
async function compute(mediaId: string): Promise<Peaks | null> {
  const ctx = context();
  if (!ctx) return null;
  const row = await getMedia(mediaId);
  if (!row) return null;

  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(await row.blob.arrayBuffer());
  } catch {
    return null;
  }

  const channel = audio.getChannelData(0);
  const per = Math.max(1, Math.floor(channel.length / BUCKETS));
  const peaks = new Float32Array(BUCKETS * 2);
  for (let i = 0; i < BUCKETS; i++) {
    let lo = 0;
    let hi = 0;
    const from = i * per;
    const to = Math.min(channel.length, from + per);
    for (let j = from; j < to; j++) {
      const v = channel[j];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    peaks[i * 2] = lo;
    peaks[i * 2 + 1] = hi;
  }
  return { data: peaks, duration: audio.duration };
}

/** Cached peaks for a media src, or null if they cannot be produced. */
export function peaksFor(src: string): Promise<Peaks | null> {
  const mediaId = mediaIdOf(src);
  if (!mediaId) return Promise.resolve(null);
  const key = waveformKey(mediaId, BUCKETS);

  let pending = memo.get(key);
  if (pending) return pending;

  pending = (async () => {
    try {
      const handle = await db();
      const stored = (await handle.get('waveforms', key)) as WaveformRow | undefined;
      if (stored) return { data: stored.peaks, duration: stored.duration };

      const peaks = await compute(mediaId);
      if (!peaks) return null;
      await handle.put('waveforms', {
        id: key,
        mediaId,
        buckets: BUCKETS,
        peaks: peaks.data,
        duration: peaks.duration,
        createdAt: Date.now(),
      });
      return peaks;
    } catch {
      return null;
    }
  })();

  memo.set(key, pending);
  return pending;
}

/**
 * Draw peaks across `canvas` for the clip's trimmed window.
 *
 * Returns an abort function.
 */
export function paintWaveform(
  canvas: HTMLCanvasElement,
  opts: {
    src: string;
    /** Source seconds at the clip's head. */
    trimIn: number;
    /** Timeline seconds the clip occupies. */
    duration: number;
    width: number;
    height: number;
    colour: string;
  },
): () => void {
  let cancelled = false;

  void peaksFor(opts.src).then((peaks) => {
    if (cancelled || !peaks) return;

    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(opts.width));
    const h = Math.max(1, Math.round(opts.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = opts.colour;

    const total = peaks.data.length / 2;
    // The peaks span the whole source; the clip shows a window into it.
    const perSecond = peaks.duration > 0 ? total / peaks.duration : 0;
    const from = Math.max(0, Math.min(total - 1, opts.trimIn * perSecond));
    const span = Math.max(1, Math.min(total - from, opts.duration * perSecond));
    const mid = h / 2;

    for (let x = 0; x < w; x++) {
      const bucket = Math.min(total - 1, Math.floor(from + (x / w) * span));
      const lo = peaks.data[bucket * 2];
      const hi = peaks.data[bucket * 2 + 1];
      const top = mid - hi * mid;
      // Always at least a hairline, so silence reads as a centre line rather
      // than as a gap where the waveform failed to load.
      const height = Math.max(1, (hi - lo) * mid);
      ctx.fillRect(x, top, 1, height);
    }
  });

  return () => {
    cancelled = true;
  };
}
