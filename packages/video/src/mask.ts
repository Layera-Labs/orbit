/**
 * Shape masks. The same `ClipMask` clips the Skia preview layer and bakes an
 * alpha key into the export via `geq` — so what you mask live matches the
 * rendered MP4. Coordinates are normalized within the clip frame; the engine
 * scales them to the clip's pixel size (rw×rh).
 */
import type { ClipMask, MaskShape } from './types';

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * A mask resolved to clip-frame pixels, for a surface that clips with a path
 * rather than with a filter string.
 *
 * Deliberately geometry and not canvas calls: `blendToCanvas` hands back a
 * `globalCompositeOperation` string and lets the caller apply it, and this
 * follows that shape. The package stays free of DOM types, and the thing that
 * actually has to agree between the two renderers — the arithmetic — lives in
 * one place.
 */
export interface CanvasMask {
  shape: MaskShape;
  /** Shape centre, in clip-frame pixels. */
  cx: number;
  cy: number;
  /** Radii (circle) or half-extents (rectangle), in clip-frame pixels. */
  rx: number;
  ry: number;
  /** Keep OUTSIDE the shape. A canvas caller draws the full box too and clips even-odd. */
  invert: boolean;
}

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

/**
 * The same mask, for a canvas compositor. `null` when there is no usable mask —
 * the exact condition under which `maskToFFmpeg` returns `''`.
 *
 * That agreement about ABSENCE is the reason this function exists rather than
 * each surface scaling `cx/cy/rx/ry` itself. A mask dragged to zero width is a
 * real document: the export drops the filter and the clip stays whole, so a
 * canvas that clipped to a zero-radius path instead would render nothing, and
 * the preview and the file would disagree about an entire layer. Nothing caught
 * that while this arithmetic lived in the app, because there was no second
 * implementation to compare it against.
 *
 * Rounded identically to the ffmpeg side so the two are comparable number for
 * number, not merely close.
 */
export function maskToCanvas(
  m: ClipMask | undefined,
  rw: number,
  rh: number,
): CanvasMask | null {
  if (!m || m.rx <= 0 || m.ry <= 0) return null;
  return {
    shape: m.shape,
    cx: r3(m.cx * rw),
    cy: r3(m.cy * rh),
    rx: r3(m.rx * rw),
    ry: r3(m.ry * rh),
    invert: m.invert === true,
  };
}
