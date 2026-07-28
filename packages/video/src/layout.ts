/**
 * Geometry shared by the ffmpeg export and the browser canvas preview.
 *
 * These were inline helpers in `ffmpeg.ts`. They live here because the preview
 * must land a clip on exactly the pixel the export does — if the two round
 * differently, a PiP overlay sits one pixel off in the MP4 and nobody can say
 * why. One implementation, two callers.
 */
import { FULL_FRAME, type Rect, type VisualTrackClip } from './types';

/**
 * Round to an even integer, minimum 2. H.264 chroma subsampling needs even
 * dimensions, so every scale/crop size in the filtergraph goes through this.
 */
export function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

/** Round to 3 decimals — the precision the filtergraph strings are written at. */
export function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * A clip's destination box in project pixels. `w`/`h` are `even()`-rounded to
 * match `scale=rw:rh`; `x`/`y` are plain rounds to match `overlay=rx:ry`.
 */
export function clipRectPx(
  rect: Rect | undefined,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  const R = rect ?? FULL_FRAME;
  return {
    x: Math.round(R.x * width),
    y: Math.round(R.y * height),
    w: even(R.w * width),
    h: even(R.h * height),
  };
}

/**
 * The source rectangle that reproduces ffmpeg's
 * `scale=W:H:force_original_aspect_ratio=increase,crop=W:H` — scale up until the
 * media covers the box, then centre-crop the overflow.
 *
 * Returned in SOURCE PIXELS, ready for the 9-argument `drawImage`. It takes the
 * natural size as an argument rather than being baked into a `DrawOp` because
 * natural size is only known once the browser has decoded the media, while the
 * draw list is built synchronously from the project.
 */
export function coverCrop(
  naturalW: number,
  naturalH: number,
  boxW: number,
  boxH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (naturalW <= 0 || naturalH <= 0 || boxW <= 0 || boxH <= 0)
    return { sx: 0, sy: 0, sw: Math.max(1, naturalW), sh: Math.max(1, naturalH) };
  const scale = Math.max(boxW / naturalW, boxH / naturalH);
  const sw = Math.min(naturalW, boxW / scale);
  const sh = Math.min(naturalH, boxH / scale);
  return { sx: (naturalW - sw) / 2, sy: (naturalH - sh) / 2, sw, sh };
}

/**
 * Seconds into the SOURCE media for a clip at timeline time `t`.
 *
 * Mirrors the export's `trim=start=trimIn:duration=duration*speed` followed by
 * `setpts=(PTS-STARTPTS)/speed`: the clip consumes `duration*speed` source
 * seconds and plays them over `duration` timeline seconds.
 */
export function srcTimeAt(clip: VisualTrackClip, t: number): number {
  const speed = clip.speed && clip.speed > 0 ? clip.speed : 1;
  const local = Math.max(0, t - clip.start);
  return (clip.trimIn ?? 0) + local * speed;
}

/** Normalized progress (0..1) through a clip/overlay window at time `t`. */
/** Clamp with a fallback, for values that arrive from stored documents. */
function num(v: number | undefined, fallback: number, lo: number, hi: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Corner radius factor for the "rounded" region shape.
 *
 * Shared so the export, the Skia preview and the canvas preview round a lens or
 * a mosaic patch by the same amount — a different radius moves the effect's edge
 * away from where the user positioned it.
 */
export const ROUNDED_R = 0.35;

/** Block size factor per mosaic pattern. */
export const MOSAIC_BLOCK: Record<string, number> = {
  mosaic: 0.1,
  triangle: 0.18,
  hexagon: 0.13,
};

/**
 * The pixel box a local effect (mosaic, magnifier) occupies inside a clip.
 *
 * SHARED, deliberately. Both the ffmpeg filtergraph and the browser compositor
 * read this, so a lens or a pixelated patch lands on exactly the same pixels in
 * the preview and in the exported file. Duplicating the rounding — especially
 * `even()` — is precisely how the two drift apart by a pixel and stay that way.
 */
export function regionBoxPx(
  region: { cx: number; cy: number; rx: number; ry: number },
  rw: number,
  rh: number,
): { ew: number; eh: number; ex: number; ey: number } {
  const ew = even(Math.max(2, Math.min(rw, num(region.rx, 0.25, 0.001, 0.5) * 2 * rw)));
  const eh = even(Math.max(2, Math.min(rh, num(region.ry, 0.25, 0.001, 0.5) * 2 * rh)));
  return {
    ew,
    eh,
    ex: Math.max(0, Math.min(rw - ew, Math.round(num(region.cx, 0.5, 0, 1) * rw - ew / 2))),
    ey: Math.max(0, Math.min(rh - eh, Math.round(num(region.cy, 0.5, 0, 1) * rh - eh / 2))),
  };
}

/** The reduced size a mosaic is downsampled to before being blown back up. */
export function mosaicStepPx(
  pattern: string,
  amount: number,
  ew: number,
  eh: number,
): { sw: number; sh: number } {
  const a = num(amount, 0.35, 0, 1);
  const block = MOSAIC_BLOCK[pattern] ?? MOSAIC_BLOCK.mosaic;
  const factor = Math.max(0.025, block * (1 - a * 0.8));
  return {
    sw: even(Math.max(2, ew * factor)),
    sh: even(Math.max(2, eh * factor)),
  };
}

/** Blur sigma for a mosaic whose pattern is `blur`. */
export function mosaicBlurSigma(amount: number): number {
  return r3(Math.max(1, num(amount, 0.35, 0, 1) * 22));
}

/** The source crop a magnifier lens samples before scaling it back up. */
export function magnifierCropPx(
  zoom: number,
  ew: number,
  eh: number,
): { sw: number; sh: number; sx: number; sy: number } {
  const z = num(zoom, 2, 1, 20);
  const sw = even(Math.max(2, ew / z));
  const sh = even(Math.max(2, eh / z));
  return { sw, sh, sx: Math.max(0, Math.round((ew - sw) / 2)), sy: Math.max(0, Math.round((eh - sh) / 2)) };
}

export function progressAt(start: number, duration: number, t: number): number {
  if (duration <= 0) return 0;
  return Math.max(0, Math.min(1, (t - start) / duration));
}
