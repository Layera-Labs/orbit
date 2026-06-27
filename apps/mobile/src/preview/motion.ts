/**
 * Ken-Burns motion (preview side) — VENDORED from `packages/video/src/motion.ts`.
 * Keep the constants and `motionStateAt` math in sync so the live Skia preview
 * matches the ffmpeg `zoompan` export for the same preset + intensity.
 */
import type { Transforms3d } from '@shopify/react-native-skia';
import type { Motion } from '../model/types';

export const ZOOM_DELTA = 0.3;
export const PAN_ZOOM = 0.18;

export function motionIntensity(m: Motion | undefined): number {
  if (!m || m.type === 'none') return 0;
  return Math.max(0, Math.min(1, m.intensity ?? 0.5));
}

export function hasMotion(m: Motion | undefined): boolean {
  return motionIntensity(m) > 0 && m!.type !== 'none';
}

/** Centered `scale` + pan offset (`tx`,`ty` as a fraction of the frame). */
export function motionStateAt(m: Motion | undefined, p: number): { scale: number; tx: number; ty: number } {
  const I = motionIntensity(m);
  const t = Math.max(0, Math.min(1, p));
  if (I === 0) return { scale: 1, tx: 0, ty: 0 };
  const z = ZOOM_DELTA * I;
  const pz = 1 + PAN_ZOOM * I;
  const slack = (s: number) => s - 1;
  switch (m!.type) {
    case 'zoomIn':
      return { scale: 1 + z * t, tx: 0, ty: 0 };
    case 'zoomOut':
      return { scale: 1 + z * (1 - t), tx: 0, ty: 0 };
    case 'panRight':
      return { scale: pz, tx: slack(pz) * (0.5 - t), ty: 0 };
    case 'panLeft':
      return { scale: pz, tx: slack(pz) * (t - 0.5), ty: 0 };
    case 'panDown':
      return { scale: pz, tx: 0, ty: slack(pz) * (0.5 - t) };
    case 'panUp':
      return { scale: pz, tx: 0, ty: slack(pz) * (t - 0.5) };
    case 'kenBurns': {
      const s = 1 + z * t;
      return { scale: s, tx: slack(s) * 0.3 * (t - 0.5), ty: 0 };
    }
    default:
      return { scale: 1, tx: 0, ty: 0 };
  }
}

/**
 * Skia `<Group transform>` for a clip's motion at `playheadSec`, panning over a
 * `w`×`h` frame. Combine with `origin={frame centre}` so the scale stays
 * centered. Returns `undefined` when there's no motion (caller omits both).
 */
export function motionTransform(
  m: Motion | undefined,
  start: number,
  duration: number,
  playheadSec: number,
  w: number,
  h: number,
): Transforms3d | undefined {
  if (!hasMotion(m) || duration <= 0) return undefined;
  const p = (playheadSec - start) / duration;
  const { scale, tx, ty } = motionStateAt(m, p);
  // With origin at the frame centre, this yields scale*p + origin*(1-scale) + pan.
  return [{ translateX: tx * w }, { translateY: ty * h }, { scale }];
}
