/**
 * Keyframe sampling (preview side) — VENDORED from
 * `packages/video/src/keyframes.ts`. Keep `sampleKeyframes` in sync with the
 * engine so the live preview matches the baked ffmpeg expressions.
 */
import type { Keyframe } from '../model/types';

export function hasKeyframes(kfs: Keyframe[] | undefined): boolean {
  return !!kfs && kfs.length >= 2;
}

function sorted(kfs: Keyframe[]): Keyframe[] {
  return [...kfs].sort((a, b) => a.t - b.t);
}

/** Interpolated {opacity,x,y} at local progress `p` (0..1). */
export function sampleKeyframes(kfs: Keyframe[], p: number): { opacity: number; x: number; y: number } {
  const ks = sorted(kfs);
  const t = Math.max(0, Math.min(1, p));
  if (t <= ks[0].t) return { opacity: ks[0].opacity, x: ks[0].x, y: ks[0].y };
  const last = ks[ks.length - 1];
  if (t >= last.t) return { opacity: last.opacity, x: last.x, y: last.y };
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i];
    const b = ks[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return {
        opacity: a.opacity + (b.opacity - a.opacity) * f,
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
      };
    }
  }
  return { opacity: last.opacity, x: last.x, y: last.y };
}

/**
 * Whether any keyframe actually changes opacity / position.
 *
 * These gates are why a keyframe list is not enough on its own. The export
 * applies keyframed opacity and keyframed position only when they ANIMATE
 * (`ffmpeg.ts` checks the same two predicates), so a preview that samples on
 * `hasKeyframes` alone moves a clip that the file leaves still — which is
 * exactly what this preview used to do.
 */
export function animatesOpacity(kfs: Keyframe[]): boolean {
  return kfs.some((k) => k.opacity < 0.999);
}

export function animatesPosition(kfs: Keyframe[]): boolean {
  const ks = sorted(kfs);
  return ks.some(
    (k) => Math.abs(k.x - ks[0].x) > 1e-4 || Math.abs(k.y - ks[0].y) > 1e-4,
  );
}
