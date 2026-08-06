/**
 * Volume envelope (a "curve" of gain over time). Shared by the curve editor,
 * both previews and the export: `volumeCurveExpr` bakes a piecewise-linear
 * `volume` expression the ffmpeg `volume` filter evaluates per frame
 * (`eval=frame`), while `sampleVolume` is what the players are set to live.
 * Mobile mirrors the sampling half in `apps/mobile/src/preview/curve.ts`, which
 * it cannot import from here — the two are compared by test, not by eye.
 */
import type { VolumeCurve, VolumeDuck, VolumeEnvelope, VolumePoint } from './types';

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Default seconds of ramp at each end of a duck.
 *
 * A duck with no ramp is a step, and a step in a music bed is audible as a
 * click. A quarter of a second is the shortest that reads as a move rather than
 * a fault, and it is short enough not to eat a two-second dip.
 */
export const DUCK_RAMP = 0.25;

/** Is this the structured form rather than a bare point list? */
export function isEnvelope(c: VolumeCurve | undefined): c is VolumeEnvelope {
  return !!c && !Array.isArray(c);
}

/**
 * The points a curve renders as.
 *
 * The ONE place a stored envelope becomes the piecewise-linear list every
 * renderer consumes — the export's `volume` expression, both previews' gain,
 * and the waveform's own scale. Storing intent and materializing here is what
 * lets a duck and a pair of fades exist on the same clip: as points they are
 * one indistinguishable shape, and reading the fades back out of it is
 * guesswork that fails the moment anything else is in the way.
 *
 * `volume` is the plateau the envelope is drawn against. It is passed in rather
 * than read off the curve because a curve OVERRIDES `volume` — the plateau IS
 * the clip's level, and materializing against anything else would render a
 * gain no control is showing.
 *
 * Returns undefined when there is nothing to draw, which is how a caller knows
 * to emit a plain `volume=<n>` instead of a per-frame expression.
 */
export function curvePoints(
  curve: VolumeCurve | undefined,
  duration: number,
  volume = 1,
): VolumePoint[] | undefined {
  if (!curve) return undefined;
  if (Array.isArray(curve)) return curve.length >= 2 ? curve : undefined;
  return envelopePoints(curve, duration, volume);
}

/** True when a curve has enough shape to be worth a per-frame expression. */
export function hasVolumeCurve(
  curve: VolumeCurve | undefined,
  duration = 1,
  volume = 1,
): boolean {
  const pts = curvePoints(curve, duration, volume);
  return !!pts && pts.length >= 2;
}

/** Seconds of ramp a duck actually gets, never more than half its length. */
export function duckRamp(d: VolumeDuck): number {
  return Math.max(0, Math.min(d.ramp ?? DUCK_RAMP, d.dur / 2));
}

/**
 * Build the point list for a structured envelope.
 *
 * Ducks are CLAMPED to the plateau — the stretch between the end of the fade in
 * and the start of the fade out — and one that would not fit there is dropped.
 * That is what keeps the result exactly piecewise-linear: a duck overlapping a
 * fade would make the envelope a product of two ramps, which is a curve no
 * straight segment reproduces and which both previews and the export would
 * approximate differently. It is also what a person means. During a fade the
 * level is already on its way to silence, and a dip inside one is asking for
 * something quieter than silence.
 */
function envelopePoints(
  env: VolumeEnvelope,
  duration: number,
  volume: number,
): VolumePoint[] | undefined {
  // A hand-drawn shape wins outright: it is stored precisely because no
  // combination of the fields could express it.
  if (env.points?.length && env.points.length >= 2) return env.points;
  if (duration <= 0) return undefined;

  const fin = Math.max(0, Math.min(duration / 2, env.fadeIn ?? 0));
  const fout = Math.max(0, Math.min(duration / 2, env.fadeOut ?? 0));
  const ducks = (env.ducks ?? [])
    .filter((d) => d.dur > 0)
    .map((d) => ({ ...d, at: Math.max(fin, d.at) }))
    // Trimmed against the fade out, then dropped if nothing survives.
    .map((d) => ({ ...d, dur: Math.min(d.dur, duration - fout - d.at) }))
    .filter((d) => d.dur > 0)
    .sort((a, b) => a.at - b.at);

  if (fin <= 0 && fout <= 0 && !ducks.length) return undefined;

  const at = (sec: number): number => Math.max(0, Math.min(1, sec / duration));
  const pts: VolumePoint[] = [];
  if (fin > 0) pts.push({ t: 0, v: 0 });
  pts.push({ t: at(fin), v: volume });
  for (const d of ducks) {
    const ramp = duckRamp(d);
    const floor = Math.max(0, Math.min(1, d.depth)) * volume;
    pts.push({ t: at(d.at), v: volume });
    pts.push({ t: at(d.at + ramp), v: floor });
    pts.push({ t: at(d.at + d.dur - ramp), v: floor });
    pts.push({ t: at(d.at + d.dur), v: volume });
  }
  pts.push({ t: at(duration - fout), v: volume });
  if (fout > 0) pts.push({ t: 1, v: 0 });
  return pts;
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
