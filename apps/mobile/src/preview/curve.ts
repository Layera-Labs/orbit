/**
 * Volume envelopes, mirrored from `packages/video/src/curve.ts`.
 *
 * This app is outside the pnpm workspace and cannot import `@orbit/video`, so
 * the gain maths is duplicated here — the same arrangement as `motion.ts`,
 * `blend.ts` and `keyframes.ts`. `__tests__/curve.test.ts` compares the OUTPUTS
 * of the two copies rather than trusting that they look alike.
 *
 * Only the sampling half is mirrored. The export's `volumeCurveExpr` builds an
 * ffmpeg expression and runs on the server, which has the canonical copy.
 */
import type { VolumePoint } from "../model/types";

export function hasVolumeCurve(pts: VolumePoint[] | undefined): boolean {
  return !!pts && pts.length >= 2;
}

function sorted(pts: VolumePoint[]): VolumePoint[] {
  return [...pts].sort((a, b) => a.t - b.t);
}

/** Interpolated gain at normalized progress `p` (0..1). */
export function sampleVolume(pts: VolumePoint[], p: number): number {
  const ks = sorted(pts);
  const t = Math.max(0, Math.min(1, p));
  if (t <= ks[0].t) return ks[0].v;
  const last = ks[ks.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i];
    const b = ks[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return a.v + (b.v - a.v) * f;
    }
  }
  return last.v;
}

/** The gain an audio clip should be at, `p` being progress through the clip. */
export function clipGainAt(
  clip: { volume?: number; volumeCurve?: VolumePoint[] },
  p: number,
): number {
  return hasVolumeCurve(clip.volumeCurve)
    ? Math.max(0, sampleVolume(clip.volumeCurve!, p))
    : Math.max(0, clip.volume ?? 1);
}
