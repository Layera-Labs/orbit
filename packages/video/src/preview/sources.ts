/**
 * Media pool: one decoder element per KEY, shared across frames.
 *
 * The key is normally the url, so every clip cut from one file shares a
 * decoder. It stops being the url when two clips of the SAME file are on screen
 * at once — which a transition makes routine, since splitting a clip and
 * putting a crossfade on the join is the most ordinary edit there is. Two
 * layers sharing one `<video>` would fight over its `currentTime` and one side
 * of the transition would freeze or flicker.
 *
 * Two playback regimes, because they need opposite things:
 *  - PLAYING: let the element run at `playbackRate` and only correct when it
 *    drifts past a tolerance. Seeking every frame would stall decoding.
 *  - PAUSED / SCRUBBING: set `currentTime` and wait for `seeked`. Seeks cost
 *    50–200 ms and land on the nearest decodable frame, so requests are
 *    coalesced — while the user drags we keep only the newest target.
 *
 * This mirrors the tolerance-and-retry approach in the mobile Skia preview
 * (`apps/mobile/src/preview/useClipFrame.ts`).
 */

/** How far a playing element may drift before we hard-seek it. */
const DRIFT_TOLERANCE = 0.15;

export type Decoded = HTMLVideoElement | HTMLImageElement;

interface Entry {
  el: Decoded;
  ready: boolean;
  /** Newest requested source time while seeking; null when idle. */
  pending: number | null;
  seeking: boolean;
}

export class MediaPool {
  private entries = new Map<string, Entry>();
  private onReady?: () => void;

  constructor(onReady?: () => void) {
    this.onReady = onReady;
  }

  /**
   * Ensure a decoder exists under `key`, loading `url` into it. `kind` picks
   * the element type.
   */
  acquire(key: string, url: string, kind: 'video' | 'image'): Entry {
    const found = this.entries.get(key);
    if (found) return found;

    if (kind === 'image') {
      const img = new Image();
      // Same-origin blob URLs, but be explicit: a tainted canvas silently kills
      // every thumbnail and poster frame later.
      img.crossOrigin = 'anonymous';
      const entry: Entry = { el: img, ready: false, pending: null, seeking: false };
      img.onload = () => {
        entry.ready = true;
        this.onReady?.();
      };
      img.src = url;
      this.entries.set(key, entry);
      return entry;
    }

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.playsInline = true;
    video.muted = true; // audio is routed through the WebAudio graph, not here
    const entry: Entry = { el: video, ready: false, pending: null, seeking: false };
    video.onloadeddata = () => {
      entry.ready = true;
      this.onReady?.();
    };
    video.onseeked = () => {
      entry.seeking = false;
      // A newer target arrived while this seek was in flight — chase it.
      if (entry.pending != null) {
        const next = entry.pending;
        entry.pending = null;
        this.seekTo(key, next);
      } else {
        this.onReady?.();
      }
    };
    video.src = url;
    this.entries.set(key, entry);
    return entry;
  }

  private seekTo(key: string, t: number): void {
    const entry = this.entries.get(key);
    if (!entry || !(entry.el instanceof HTMLVideoElement)) return;
    entry.seeking = true;
    entry.el.currentTime = t;
  }

  /**
   * Put the decoder under `key` at source time `t`. `playing` picks the regime
   * described above. Returns the element to draw, or null while it is not yet
   * decodable.
   */
  frameAt(key: string, t: number, playing: boolean, rate: number): Decoded | null {
    const entry = this.entries.get(key);
    if (!entry || !entry.ready) return null;
    const el = entry.el;
    if (!(el instanceof HTMLVideoElement)) return el;

    if (playing) {
      if (el.paused) void el.play().catch(() => undefined);
      if (Math.abs(el.playbackRate - rate) > 0.01) el.playbackRate = rate;
      if (Math.abs(el.currentTime - t) > DRIFT_TOLERANCE && !entry.seeking) this.seekTo(key, t);
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - t) > 0.001) {
        // Coalesce: keep only the newest target while a seek is in flight.
        if (entry.seeking) entry.pending = t;
        else this.seekTo(key, t);
      }
    }
    return el;
  }

  /** Natural pixel size, or null before metadata arrives. */
  sizeOf(el: Decoded): { w: number; h: number } | null {
    if (el instanceof HTMLVideoElement)
      return el.videoWidth ? { w: el.videoWidth, h: el.videoHeight } : null;
    return el.naturalWidth ? { w: el.naturalWidth, h: el.naturalHeight } : null;
  }

  /** Drop everything not in `keep`, so a deleted clip stops holding a decoder. */
  prune(keep: Set<string>): void {
    for (const [key, entry] of this.entries) {
      if (keep.has(key)) continue;
      if (entry.el instanceof HTMLVideoElement) {
        entry.el.pause();
        entry.el.removeAttribute('src');
        entry.el.load();
      }
      this.entries.delete(key);
    }
  }

  pauseAll(): void {
    for (const entry of this.entries.values())
      if (entry.el instanceof HTMLVideoElement) entry.el.pause();
  }

  destroy(): void {
    this.prune(new Set());
  }
}
