/**
 * Render a text overlay to a full-frame SVG (transparent except the caption),
 * which the rasterizer turns into a PNG that ffmpeg composites over the video.
 *
 * This is the freetype-free text path: text is rasterized by resvg, not ffmpeg.
 * It also reuses the same "model → SVG" idea as the canvas renderer, so richer
 * element overlays (stickers, shapes) can plug in here later.
 */
import type { TextOverlay } from './types';
import { col, esc, fontFamily as family, num as n } from './svg';

/**
 * The caption's box in project pixels.
 *
 * An overlay's `DrawOp.dst` is the WHOLE FRAME — the caption is rasterized
 * full-frame with the text baked at its anchor — so `dst` cannot say where the
 * words actually are. Anything that needs that (hit-testing a click on the
 * canvas, drawing a selection outline) asks here.
 *
 * The width is an approximation: 0.58em per character, no font metrics, which
 * is the same guess `overlayToSVG` has always used to size a caption's
 * background box. Sharing it is the point — an outline derived from different
 * numbers than the box it outlines would visibly disagree with it.
 */
export function overlayBox(
  o: TextOverlay,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  const lines = (o.text ?? '').split('\n');
  const lineH = o.fontSize * (o.lineHeight ?? 1.25);
  const letterSpacing = o.letterSpacing ?? 0;
  const maxLen = Math.max(1, ...lines.map((l) => l.length));
  const textW = maxLen * o.fontSize * 0.58 + maxLen * letterSpacing;
  const pad = o.box ? (o.box.padding ?? 16) : 0;
  const w = textW + pad * 2;
  const h = lines.length * lineH + pad * 2;
  const align = o.align ?? 'center';
  const anchorX = width * o.x;
  const x =
    align === 'left' ? anchorX - pad : align === 'right' ? anchorX - w + pad : anchorX - w / 2;
  return { x, y: height * o.y - h / 2, w, h };
}

/** Produce a `width`×`height` SVG containing the positioned caption. */
export function overlayToSVG(o: TextOverlay, width: number, height: number): string {
  const lines = (o.text ?? '').split('\n');
  const lineH = o.fontSize * (o.lineHeight ?? 1.25);
  const anchorX = width * o.x;
  const anchorY = height * o.y;
  const align = o.align ?? 'center';
  const textAnchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const fontWeight = o.bold ? 700 : 400;
  const fontFamily = family(o.fontFamily);
  const letterSpacing = o.letterSpacing ?? 0;

  // Approximate caption box sized to the text (no metrics pre-render), from the
  // shared measurement so the editor's outline lands on the same rectangle.
  let boxEl = '';
  if (o.box) {
    const b = overlayBox(o, width, height);
    const pad = o.box.padding ?? 16;
    boxEl =
      `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" ` +
      `rx="${n(Math.min(18, pad))}" fill="${col(o.box.color)}" fill-opacity="${n(o.box.opacity ?? 1, 1)}"/>`;
  }

  // Vertically center the block of lines around the anchor.
  const firstY = anchorY - ((lines.length - 1) * lineH) / 2;
  const tspans = lines
    .map((l, i) => `<tspan x="${n(anchorX)}" y="${n(firstY + i * lineH)}">${esc(l) || ' '}</tspan>`)
    .join('');

  // Optional drop shadow via an SVG filter applied to the caption text.
  let filterEl = '';
  let filterAttr = '';
  if (o.shadow) {
    const s = o.shadow;
    filterEl =
      `<filter id="sh" x="-40%" y="-40%" width="180%" height="180%">` +
      `<feDropShadow dx="${n(s.dx ?? 0)}" dy="${n(s.dy ?? 2)}" stdDeviation="${n((s.blur ?? 4) / 2)}" ` +
      `flood-color="${col(s.color)}" flood-opacity="${n(s.opacity ?? 0.6, 0.6)}"/></filter>`;
    filterAttr = ` filter="url(#sh)"`;
  }
  // Optional outline stroke; paint-order=stroke draws it behind the fill so glyph
  // interiors stay crisp.
  const strokeAttr = o.stroke
    ? ` stroke="${col(o.stroke.color)}" stroke-width="${n(o.stroke.width)}" stroke-linejoin="round" paint-order="stroke"`
    : '';

  const textEl =
    `<text font-family="${esc(fontFamily)}" font-size="${n(o.fontSize, 32)}" font-weight="${n(fontWeight, 400)}" ` +
    `letter-spacing="${n(letterSpacing)}" ` +
    `fill="${col(o.color, '#ffffff')}" text-anchor="${textAnchor}" dominant-baseline="middle"${strokeAttr}${filterAttr}>${tspans}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width, 1)}" height="${n(height, 1)}">${filterEl}${boxEl}${textEl}</svg>`;
}
