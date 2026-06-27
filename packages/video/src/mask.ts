/**
 * Shape masks. The same `ClipMask` clips the Skia preview layer and bakes an
 * alpha key into the export via `geq` — so what you mask live matches the
 * rendered MP4. Coordinates are normalized within the clip frame; the engine
 * scales them to the clip's pixel size (rw×rh).
 */
import type { ClipMask } from './types';

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * ffmpeg `geq` that keeps pixels inside (or outside, if inverted) the shape and
 * zeroes the alpha elsewhere. Operates on the clip frame `rw`×`rh` (rgba). `''`
 * when there's no usable mask.
 */
export function maskToFFmpeg(m: ClipMask | undefined, rw: number, rh: number): string {
  if (!m || m.rx <= 0 || m.ry <= 0) return '';
  const cx = r3(m.cx * rw);
  const cy = r3(m.cy * rh);
  const ax = r3(m.rx * rw);
  const ay = r3(m.ry * rh);
  const inside =
    m.shape === 'circle'
      ? `lte((X-${cx})^2/${r3(ax * ax)}+(Y-${cy})^2/${r3(ay * ay)},1)`
      : `lte(abs(X-${cx}),${ax})*lte(abs(Y-${cy}),${ay})`;
  const cond = m.invert ? `not(${inside})` : inside;
  return `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(${cond},alpha(X,Y),0)'`;
}
