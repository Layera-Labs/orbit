/**
 * Render a text overlay to a full-frame SVG (transparent except the caption),
 * which the rasterizer turns into a PNG that ffmpeg composites over the video.
 *
 * This is the freetype-free text path: text is rasterized by resvg, not ffmpeg.
 * It also reuses the same "model → SVG" idea as the canvas renderer, so richer
 * element overlays (stickers, shapes) can plug in here later.
 */
import type { TextOverlay } from './types';

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function n(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** Produce a `width`×`height` SVG containing the positioned caption. */
export function overlayToSVG(o: TextOverlay, width: number, height: number): string {
  const lines = (o.text ?? '').split('\n');
  const lineH = o.fontSize * 1.25;
  const anchorX = width * o.x;
  const anchorY = height * o.y;
  const align = o.align ?? 'center';
  const textAnchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const fontWeight = o.bold ? 700 : 400;
  const fontFamily = o.fontFamily ?? 'Arial';

  // Approximate caption box sized to the text (no metrics pre-render).
  let boxEl = '';
  if (o.box) {
    const maxLen = Math.max(1, ...lines.map((l) => l.length));
    const textW = maxLen * o.fontSize * 0.58;
    const pad = o.box.padding ?? 16;
    const boxW = textW + pad * 2;
    const boxH = lines.length * lineH + pad * 2;
    const bx = align === 'left' ? anchorX - pad : align === 'right' ? anchorX - boxW + pad : anchorX - boxW / 2;
    const by = anchorY - boxH / 2;
    boxEl =
      `<rect x="${n(bx)}" y="${n(by)}" width="${n(boxW)}" height="${n(boxH)}" ` +
      `rx="${n(Math.min(18, pad))}" fill="${esc(o.box.color)}" fill-opacity="${o.box.opacity ?? 1}"/>`;
  }

  // Vertically center the block of lines around the anchor.
  const firstY = anchorY - ((lines.length - 1) * lineH) / 2;
  const tspans = lines
    .map((l, i) => `<tspan x="${n(anchorX)}" y="${n(firstY + i * lineH)}">${esc(l) || ' '}</tspan>`)
    .join('');
  const textEl =
    `<text font-family="${esc(fontFamily)}" font-size="${o.fontSize}" font-weight="${fontWeight}" ` +
    `fill="${esc(o.color)}" text-anchor="${textAnchor}" dominant-baseline="middle">${tspans}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${boxEl}${textEl}</svg>`;
}
