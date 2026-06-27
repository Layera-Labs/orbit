/**
 * Keyframe interpolation, shared by preview and export. A clip's keyframes carry
 * normalized values at local times (t = 0..1 of duration). The preview samples
 * `sampleKeyframes` per frame; the export bakes piecewise-linear ffmpeg
 * expressions (`keyframeExpr`) into the overlay x/y and an alpha geq.
 */
import type { Keyframe } from './types';

/** True when ≥2 keyframes actually animate (otherwise treat as static). */
export function hasKeyframes(kfs: Keyframe[] | undefined): boolean {
  return !!kfs && kfs.length >= 2;
}

function sorted(kfs: Keyframe[]): Keyframe[] {
  return [...kfs].sort((a, b) => a.t - b.t);
}

/** Sample interpolated {opacity,x,y} at local progress `p` (0..1). */
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

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * A piecewise-linear ffmpeg expression for `prop`, in terms of the time variable
 * `tvar` (e.g. 't' for overlay, 'T' for geq). Keyframe local times are mapped to
 * absolute timeline seconds (start + t*duration); each value is scaled by
 * `scale` (e.g. W/H for position, 255 for alpha). Held flat before/after the
 * first/last keyframe.
 */
export function keyframeExpr(
  kfs: Keyframe[],
  prop: 'opacity' | 'x' | 'y',
  start: number,
  duration: number,
  tvar: string,
  scale: number,
): string {
  const ks = sorted(kfs);
  const time = (k: Keyframe) => r3(start + k.t * duration);
  const val = (k: Keyframe) => r3(k[prop] * scale);
  // build from the last segment backward into nested if(lt(tvar, t_next), seg, rest)
  let expr = `${val(ks[ks.length - 1])}`; // after the last keyframe: hold
  for (let i = ks.length - 2; i >= 0; i--) {
    const a = ks[i];
    const b = ks[i + 1];
    const ta = time(a);
    const tb = time(b);
    const va = val(a);
    const vb = val(b);
    const span = r3(tb - ta) || 0.001;
    const seg = `(${va}+(${vb}-${va})*(${tvar}-${ta})/${span})`;
    expr = `if(lt(${tvar},${tb}),${seg},${expr})`;
  }
  // before the first keyframe: hold the first value
  const t0 = time(ks[0]);
  expr = `if(lt(${tvar},${t0}),${val(ks[0])},${expr})`;
  return expr;
}

/** Whether any keyframe changes opacity (so we need the alpha pass at all). */
export function animatesOpacity(kfs: Keyframe[]): boolean {
  return kfs.some((k) => k.opacity < 0.999);
}

/** Whether any keyframe changes position (so we need overlay x/y expressions). */
export function animatesPosition(kfs: Keyframe[]): boolean {
  const ks = sorted(kfs);
  return ks.some((k) => Math.abs(k.x - ks[0].x) > 1e-4 || Math.abs(k.y - ks[0].y) > 1e-4);
}
