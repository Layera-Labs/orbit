/**
 * The canvas frame: geometry shared by all three renderers, and the SVG the
 * export and the web preview both draw from.
 *
 * The shape is a mat — one rectangle in the frame colour with a rounded-rect
 * hole punched out of it, filled `evenodd`. That single shape carries every
 * control at once: the ring's thickness is the border width, its fill is the
 * colour, its alpha is the transparency, and the hole's corner radius is the
 * rounded corners. It was chosen over the alternatives because every renderer
 * has a first-class primitive for it — an `evenodd` path in SVG, a
 * `FillType.EvenOdd` path in Skia — so none of them has to approximate.
 *
 * Two things in here are load-bearing and easy to get wrong:
 *
 * **The radius is clamped HERE, once.** An over-large radius behaves
 * differently in all three renderers — SVG scales it proportionally per spec,
 * `ctx.roundRect` throws on some values and scales on others, Skia's `RRectXY`
 * scales — so an unclamped value is a silent three-way disagreement waiting to
 * happen. Clamping in the shared helper means no renderer ever sees one.
 *
 * **`even()` is deliberately NOT used.** That helper exists for H.264 chroma
 * subsampling on `scale`/`crop` dimensions; the mat lives inside a full-frame
 * RGBA PNG and has no such constraint. Rounding to even here would just be a
 * quantisation the previews would have to reproduce for no reason.
 */
import type { CanvasFrame } from './types';
import { col, num as n } from './svg';

/**
 * Whether this frame would paint anything at all.
 *
 * Both the rasterizer and the arg builder gate on it, and they must: a frame of
 * `{width: 0, radius: 0}` has to produce a byte-identical filtergraph to no
 * frame, or it costs an input, a decode and a composite pass per frame to draw
 * nothing. `dual-render.test.ts` asserts exactly that.
 */
export function hasCanvasFrame(f: CanvasFrame | undefined): f is CanvasFrame {
  if (!f) return false;
  if (!(f.opacity === undefined || f.opacity > 0)) return false;
  return (f.width ?? 0) > 0 || (f.radius ?? 0) > 0;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

/**
 * The mat in pixels for a `w`×`h` box.
 *
 * Pure in the box it is handed, which is what lets mobile call it with the
 * PREVIEW canvas size while the export calls it with the project size. The
 * parity test therefore asserts that the function agrees, not that the pixel
 * values do — the same arrangement `mosaicStepPx` already lives under. Do not
 * "fix" it into taking the project size.
 */
export function canvasFramePx(
  f: CanvasFrame | undefined,
  w: number,
  h: number,
): { borderPx: number; radiusPx: number } {
  if (!f || w <= 0 || h <= 0) return { borderPx: 0, radiusPx: 0 };
  const unit = Math.min(w, h);
  // Half the short side is the point at which the opening closes entirely.
  const borderPx = clamp(f.width ?? 0, 0, 0.5) * unit;
  const openW = Math.max(0, w - borderPx * 2);
  const openH = Math.max(0, h - borderPx * 2);
  // A radius larger than half the opening is not a rounder rectangle, it is an
  // undefined one — and each renderer resolves it differently.
  const radiusPx = Math.min(
    clamp(f.radius ?? 0, 0, 0.5) * unit,
    openW / 2,
    openH / 2,
  );
  return { borderPx, radiusPx };
}

/** A rounded-rect subpath, drawn clockwise. */
function rrectPath(x: number, y: number, w: number, h: number, r: number): string {
  if (r <= 0) {
    return `M${n(x)},${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`;
  }
  const x2 = x + w;
  const y2 = y + h;
  return (
    `M${n(x + r)},${n(y)}` +
    `H${n(x2 - r)}A${n(r)},${n(r)} 0 0 1 ${n(x2)},${n(y + r)}` +
    `V${n(y2 - r)}A${n(r)},${n(r)} 0 0 1 ${n(x2 - r)},${n(y2)}` +
    `H${n(x + r)}A${n(r)},${n(r)} 0 0 1 ${n(x)},${n(y2 - r)}` +
    `V${n(y + r)}A${n(r)},${n(r)} 0 0 1 ${n(x + r)},${n(y)}Z`
  );
}

/**
 * The mat as a full-canvas SVG, or `null` when the frame paints nothing.
 *
 * Returning null rather than an empty SVG is what keeps the export's
 * "byte-identical when absent" property — the caller skips the rasterize, the
 * input and the overlay entirely.
 */
export function canvasFrameToSVG(
  f: CanvasFrame | undefined,
  width: number,
  height: number,
): string | null {
  if (!hasCanvasFrame(f)) return null;
  const { borderPx, radiusPx } = canvasFramePx(f, width, height);
  const outer = `M0,0H${n(width)}V${n(height)}H0Z`;
  const inner = rrectPath(
    borderPx,
    borderPx,
    Math.max(0, width - borderPx * 2),
    Math.max(0, height - borderPx * 2),
    radiusPx,
  );
  const opacity = clamp(f.opacity ?? 1, 0, 1);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width, 1)}" height="${n(height, 1)}">` +
    `<path fill-rule="evenodd" d="${outer}${inner}" ` +
    `fill="${col(f.color)}" fill-opacity="${n(opacity, 1)}"/></svg>`
  );
}
