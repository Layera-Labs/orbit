/**
 * Volume envelope (a "curve" of gain over time). Shared by the curve editor,
 * both previews and the export: `volumeCurveExpr` bakes a piecewise-linear
 * `volume` expression the ffmpeg `volume` filter evaluates per frame
 * (`eval=frame`), while `sampleVolume` is what the players are set to live.
 * Mobile mirrors the sampling half in `apps/mobile/src/preview/curve.ts`, which
 * it cannot import from here — the two are compared by test, not by eye.
 */
import type { VolumePoint } from './types';

const r3 = (n: number) => Math.round(n * 1000) / 1000;

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

/**
 * A piecewise-linear ffmpeg `volume` expression in `tvar` (default `t`, absolute
 * timeline seconds because the curve is applied after `adelay`). Point times map
 * to `start + t*duration`; gain is held flat before the first / after the last.
 */
export function volumeCurveExpr(pts: VolumePoint[], start: number, duration: number, tvar = 't'): string {
  const ks = sorted(pts);
  const time = (k: VolumePoint) => r3(start + k.t * duration);
  const val = (k: VolumePoint) => r3(Math.max(0, k.v));
  let expr = `${val(ks[ks.length - 1])}`;
  for (let i = ks.length - 2; i >= 0; i--) {
    const a = ks[i];
    const b = ks[i + 1];
    const ta = time(a);
    const tb = time(b);
    const span = r3(tb - ta) || 0.001;
    const seg = `(${val(a)}+(${val(b)}-${val(a)})*(${tvar}-${ta})/${span})`;
    expr = `if(lt(${tvar},${tb}),${seg},${expr})`;
  }
  return `if(lt(${tvar},${time(ks[0])}),${val(ks[0])},${expr})`;
}
