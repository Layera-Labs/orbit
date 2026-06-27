/**
 * Ken-Burns motion: one preset+intensity drives BOTH the Skia preview (a
 * transform interpolated by the playhead — see the mobile `motionTransform`)
 * and the ffmpeg export (a `zoompan` driven by the output-frame counter `on`).
 *
 * The two renderers share the constants below so a "zoomIn at 50%" looks the
 * same live as it does in the rendered MP4.
 */
import type { Motion, MotionType } from './types';

/** Zoom delta at full intensity (scale travels 1 → 1+ZOOM_DELTA). */
export const ZOOM_DELTA = 0.3;
/** Constant base zoom for pan presets, giving slack to slide within. */
export const PAN_ZOOM = 0.18;

export function motionIntensity(m: Motion | undefined): number {
  if (!m || m.type === 'none') return 0;
  return Math.max(0, Math.min(1, m.intensity ?? 0.5));
}

/** True when this preset actually animates (non-none with non-zero intensity). */
export function hasMotion(m: Motion | undefined): boolean {
  return motionIntensity(m) > 0 && m!.type !== 'none';
}

/**
 * Preview state at normalized progress `p` (0..1): a centered `scale` plus a
 * pan offset as a fraction of the frame (`tx`,`ty`, where +x = shift right).
 * The mobile layer turns this into a Skia transform around the frame centre.
 */
export function motionStateAt(m: Motion | undefined, p: number): { scale: number; tx: number; ty: number } {
  const I = motionIntensity(m);
  const t = Math.max(0, Math.min(1, p));
  if (I === 0) return { scale: 1, tx: 0, ty: 0 };
  const type = m!.type;
  const z = ZOOM_DELTA * I;
  const pz = 1 + PAN_ZOOM * I; // base zoom for pans
  const slack = (s: number) => s - 1; // pan travel as a fraction of the frame
  switch (type) {
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
 * The ffmpeg `zoompan` filter for a motion preset over `frames` output frames at
 * `w`×`h` / `fps`. Returns '' for no-op. `zoompan` resets PTS, so the caller must
 * re-anchor the clip's timeline offset with a `setpts` AFTER this.
 */
export function motionToZoompan(
  m: Motion | undefined,
  frames: number,
  w: number,
  h: number,
  fps: number,
): string {
  if (!hasMotion(m) || frames < 2) return '';
  const I = motionIntensity(m);
  const N = frames - 1; // `on` runs 0..N
  const z = (ZOOM_DELTA * I).toFixed(4);
  const pz = (1 + PAN_ZOOM * I).toFixed(4);
  const cx = `(iw/2-(iw/zoom/2))`;
  const cy = `(ih/2-(ih/zoom/2))`;
  const sx = `(iw-iw/zoom)`; // horizontal slack in input px
  const sy = `(ih-ih/zoom)`;
  let zoom: string;
  let x = cx;
  let y = cy;
  const type: MotionType = m!.type;
  switch (type) {
    case 'zoomIn':
      zoom = `1+${z}*on/${N}`;
      break;
    case 'zoomOut':
      zoom = `1+${z}*(1-on/${N})`;
      break;
    case 'panRight':
      zoom = pz;
      x = `${sx}*on/${N}`;
      break;
    case 'panLeft':
      zoom = pz;
      x = `${sx}*(1-on/${N})`;
      break;
    case 'panDown':
      zoom = pz;
      y = `${sy}*on/${N}`;
      break;
    case 'panUp':
      zoom = pz;
      y = `${sy}*(1-on/${N})`;
      break;
    case 'kenBurns':
      zoom = `1+${z}*on/${N}`;
      x = `${cx}+${sx}*0.15*on/${N}`;
      break;
    default:
      return '';
  }
  return `zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=${w}x${h}:fps=${fps}`;
}
