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
import type { Background, CanvasFrame } from './types';
import { gradientEnds } from './background-svg';
import { col, num as n } from './svg';

/**
 * What is painted OUTSIDE the frame's rounded outer edge: the surface the card
 * sits on.
 *
 * Rounding the outer edge means the corner wedges stop being the band's colour
 * and become the background, and every renderer has to agree on what that is.
 * A colour and a gradient can both be expressed in the frame's own SVG — the
 * gradient by reusing `gradientEnds`, so there is exactly one copy of that
 * arithmetic and the corners cannot drift from the page behind them.
 *
 * **A PHOTO background cannot, and the corners go BLACK.** `assertNoExternalRefs`
 * forbids `<image>` in anything `rasterizeSVG` touches, so the frame's own PNG
 * has no way to carry the photograph. Reproducing it would mean overlaying the
 * base a second time under a mask in ffmpeg and clipping the same region in two
 * preview compositors — real work, for corners the picture usually covers
 * anyway. Black is what every player letterboxes with, it is `frameStateAt`'s
 * own default for an absent background, and above all it is the SAME in all
 * three renderers. The alternative considered was leaving the outer edge square
 * over a photo, which fixes nothing for the person who asked for a rounded
 * card; a divergence between preview and export was never on the table.
 *
 * The other fallbacks mirror `backgroundToSVG` exactly (blur is `#111111`
 * there), because the wedge and the base layer must agree or the join shows.
 * Every background kind therefore reduces to a paint — the union is closed, so
 * a new one will not compile until it says what its corners are.
 */
export type FrameOuterPaint =
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle?: number };

export function frameOuterPaint(bg: Background | undefined): FrameOuterPaint {
  if (!bg) return { kind: 'color', color: '#000000' };
  if (bg.type === 'color') return { kind: 'color', color: bg.color };
  if (bg.type === 'gradient') return { kind: 'gradient', from: bg.from, to: bg.to, angle: bg.angle };
  if (bg.type === 'blur') return { kind: 'color', color: '#111111' };
  // A photograph: nothing an SVG can embed, so the card sits on black.
  return { kind: 'color', color: '#000000' };
}

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
): { borderPx: number; radiusPx: number; outerRadiusPx: number } {
  if (!f || w <= 0 || h <= 0)
    return { borderPx: 0, radiusPx: 0, outerRadiusPx: 0 };
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
  /*
   * The card's own outer corners, CONCENTRIC with the opening: one radius plus
   * the band between them, which is what keeps the two curves parallel instead
   * of the band bunching at the corners.
   *
   * Zero when the opening is square, and that is not a special case for its own
   * sake — it is what keeps every frame authored before this behaving exactly
   * as it did. A frame with no rounding asked for a rectangle, and rounding its
   * outside because the band happens to be thick would rewrite the look of a
   * stored document nobody touched.
   */
  const outerRadiusPx =
    radiusPx > 0 ? Math.min(radiusPx + borderPx, w / 2, h / 2) : 0;
  return { borderPx, radiusPx, outerRadiusPx };
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
  bg?: Background,
): string | null {
  if (!hasCanvasFrame(f)) return null;
  const { borderPx, radiusPx, outerRadiusPx } = canvasFramePx(f, width, height);
  const paint = frameOuterPaint(bg);
  const rounded = outerRadiusPx > 0;
  const canvas = `M0,0H${n(width)}V${n(height)}H0Z`;
  const outer = rounded
    ? rrectPath(0, 0, width, height, outerRadiusPx)
    : canvas;
  const inner = rrectPath(
    borderPx,
    borderPx,
    Math.max(0, width - borderPx * 2),
    Math.max(0, height - borderPx * 2),
    radiusPx,
  );
  const opacity = clamp(f.opacity ?? 1, 0, 1);
  /*
   * The wedges outside the card, painted with the background — and painted
   * FULLY OPAQUE whatever the frame's own opacity is. A translucent band lets
   * the picture show through the mat, which is a deliberate effect; letting it
   * show through the corners as well would leak the parts of the frame that are
   * meant to be off the card entirely.
   */
  let defs = '';
  let wedges = '';
  if (rounded) {
    let fill: string;
    if (paint.kind === 'gradient') {
      const { x1, y1, x2, y2 } = gradientEnds(paint.angle);
      defs =
        `<defs><linearGradient id="fo" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
        `<stop offset="0%" stop-color="${col(paint.from)}"/>` +
        `<stop offset="100%" stop-color="${col(paint.to)}"/></linearGradient></defs>`;
      fill = 'url(#fo)';
    } else {
      fill = col(paint.color, '#000000');
    }
    wedges = `<path fill-rule="evenodd" d="${canvas}${outer}" fill="${fill}"/>`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width, 1)}" height="${n(height, 1)}">` +
    defs +
    wedges +
    `<path fill-rule="evenodd" d="${outer}${inner}" ` +
    `fill="${col(f.color)}" fill-opacity="${n(opacity, 1)}"/></svg>`
  );
}
