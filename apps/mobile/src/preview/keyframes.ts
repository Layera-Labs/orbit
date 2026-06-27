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
