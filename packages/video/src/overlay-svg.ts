/**
 * Render a text overlay to a full-frame SVG (transparent except the caption),
 * which the rasterizer turns into a PNG that ffmpeg composites over the video.
 *
 * This is the freetype-free text path: text is rasterized by resvg, not ffmpeg.
 * It also reuses the same "model → SVG" idea as the canvas renderer, so richer
 * element overlays (stickers, shapes) can plug in here later.
 *
 * **This path is web + export only.** The mobile preview draws captions as
 * React Native `<Text>`, which measures real text natively and needs none of
 * this; nothing here is vendored into `apps/mobile`.
 *
 * ## Measurement, and why it is a parameter
 *
 * Sizing a caption's background box needs to know how wide the text is. That
 * used to be a flat `0.58em` per character, which `__tests__/text-metrics.test.ts`
 * measures as **+139% on a run of `i` and −37% on a run of `W`**. Real advance
 * widths come from the font file, which this module has no way to reach — so
 * the caller supplies a `TextMeasurer`. The default is still the approximation,
 * deliberately: it keeps every existing caller byte-identical until BOTH the
 * export and the preview are passing real metrics, and one of them switching
 * alone would be a new divergence rather than a fix.
 *
 * ## Font embedding, and why it is not optional for the browser
 *
 * An SVG loaded through `<img>` is a resource-isolated document: it cannot see
 * the page's `@font-face` rules or `document.fonts`. Measured against a `serif`
 * control, a page webfont rendered at exactly the fallback width inside `<img>`.
 * So the web preview has always drawn captions in a system face while the export
 * drew them in the chosen one. Passing `fontData` embeds a subsetted `@font-face`
 * as a data URI — not an external resource, so the isolation does not apply —
 * and the two finally agree. resvg ignores the `@font-face` and uses its own
 * `fontFiles`, which is harmless: both are the same face.
 */
import type { ShapeOverlay, TextOverlay } from './types';
import { col, esc, fontFamily as family, num as n } from './svg';
import {
  approximateMeasurer,
  linesOf,
  measurerFor,
  metricsFor,
  type TextMeasurer,
} from './font-metrics';
import { codePointsOf, subsetFontCached } from './font-subset';

/** Font bytes by family name, as the render service serves them. */
export type FontMap = ReadonlyMap<string, Uint8Array>;

/**
 * Turn a family→bytes map into the options for one overlay.
 *
 * The single place both renderers go through, so the export and the preview
 * cannot end up measuring a caption differently. Returns `undefined` when the
 * font is not available, which is the honest fallback: the caller gets the flat
 * approximation and the SVG carries no `@font-face`, exactly as before fonts
 * were plumbed at all.
 */
export function overlayFontOptions(
  o: TextOverlay,
  fonts?: FontMap,
): OverlayRenderOptions | undefined {
  const fontData = o.fontFamily ? fonts?.get(o.fontFamily) : undefined;
  if (!fontData) return undefined;
  const metrics = metricsFor(fontData);
  return {
    fontData,
    measure: metrics ? measurerFor(metrics, o.letterSpacing ?? 0) : undefined,
  };
}

export interface OverlayRenderOptions {
  /**
   * Measures one line in pixels. Defaults to the flat `0.58em` approximation,
   * which is wrong in both directions and kept only for callers that have no
   * font in hand.
   */
  measure?: TextMeasurer;
  /**
   * Bytes of the overlay's font. When present the SVG carries a subsetted
   * `@font-face`, which is the only way a browser rendering it through `<img>`
   * can use the right face.
   */
  fontData?: Uint8Array;
}

/** Base64 without `Buffer` or `btoa`, so this stays browser-safe and portable. */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}

/** The measurer to use for an overlay, given whatever the caller supplied. */
function resolveMeasurer(o: TextOverlay, opts?: OverlayRenderOptions): TextMeasurer {
  return opts?.measure ?? approximateMeasurer(o.letterSpacing ?? 0);
}

/**
 * The caption's box in project pixels.
 *
 * An overlay's `DrawOp.dst` is the WHOLE FRAME — the caption is rasterized
 * full-frame with the text baked at its anchor — so `dst` cannot say where the
 * words actually are. Anything that needs that (hit-testing a click on the
 * canvas, drawing a selection outline) asks here.
 *
 * `measure` decides how wide the text is. Passing the same one here and to
 * `overlayToSVG` is what keeps an editor's selection outline on the rectangle
 * the export actually draws.
 */
export function overlayBox(
  o: TextOverlay,
  width: number,
  height: number,
  measure?: TextMeasurer,
): { x: number; y: number; w: number; h: number } {
  const m = measure ?? approximateMeasurer(o.letterSpacing ?? 0);
  const lines = linesOf(o.text, o.fontSize, m, o.maxWidth);
  const lineH = o.fontSize * (o.lineHeight ?? 1.25);
  /*
   * An empty caption still needs a box the editor can grab. The old code got
   * this from a `Math.max(1, …)` on the character count; expressed as a
   * measurement it is the width of one glyph, which comes out identical under
   * the approximation and stays sensible under real metrics.
   */
  const measured = Math.max(0, ...lines.map((l) => m(l, o.fontSize)));
  const textW = measured > 0 ? measured : m('M', o.fontSize);
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
export function overlayToSVG(
  o: TextOverlay,
  width: number,
  height: number,
  opts?: OverlayRenderOptions,
): string {
  const measure = resolveMeasurer(o, opts);
  const lines = linesOf(o.text, o.fontSize, measure, o.maxWidth);
  const lineH = o.fontSize * (o.lineHeight ?? 1.25);
  const anchorX = width * o.x;
  const anchorY = height * o.y;
  const align = o.align ?? 'center';
  const textAnchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const fontWeight = o.bold ? 700 : 400;
  const fontFamily = family(o.fontFamily);
  const letterSpacing = o.letterSpacing ?? 0;

  /*
   * The subsetted face, as a data URI.
   *
   * Subsetting is what makes this affordable: the whole face is 100–400 KB and
   * the glyphs one caption uses are a few KB. `subsetFont` returns null for a
   * face it cannot handle (CFF outlines, anything malformed), and null means
   * embed nothing — a broken `@font-face` is worse than none, because the
   * browser substitutes either way and a corrupt one can take the SVG with it.
   */
  let fontEl = '';
  if (opts?.fontData) {
    const sub = subsetFontCached(opts.fontData, codePointsOf(o.text ?? ''));
    if (sub) {
      // The family name is already constrained by `family()`, and base64's
      // alphabet cannot close an attribute or open an element.
      fontEl =
        `<defs><style>@font-face{font-family:"${esc(fontFamily)}";` +
        `font-weight:${n(fontWeight, 400)};` +
        `src:url(data:font/ttf;base64,${base64(sub)}) format("truetype");}</style></defs>`;
    }
  }

  // Caption box sized to the measured text, from the shared measurement so the
  // editor's outline lands on the same rectangle.
  let boxEl = '';
  if (o.box) {
    const b = overlayBox(o, width, height, measure);
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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width, 1)}" height="${n(height, 1)}">${fontEl}${filterEl}${boxEl}${textEl}</svg>`;
}

/**
 * The shape's box in project pixels.
 *
 * `x`/`y` is the CENTRE and `width`/`height` are fractions of the frame — the
 * same reading `imageOverlayAsClip` gives an `ImageOverlay`, and the type says
 * as much. Written once here so an editor's selection outline and the
 * rasterizer cannot disagree about where the rectangle is, which is the same
 * reason `overlayBox` exists for text.
 */
export function shapeBox(
  o: ShapeOverlay,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  const w = Math.max(0, o.width) * width;
  const h = Math.max(0, o.height) * height;
  return { x: o.x * width - w / 2, y: o.y * height - h / 2, w, h };
}

/**
 * Produce a `width`×`height` SVG containing the positioned shape.
 *
 * **Full-frame, exactly like a caption's**, and that is the whole design. A
 * shape could have been rasterized to its own small PNG and composited at an
 * offset — but then its keyframes would REPLACE the origin (a clip's reading)
 * while a caption's keyframes are a DELTA on a full-frame layer, and the two
 * overlay kinds would animate differently for no reason a format author could
 * ever guess. Sharing the caption's path means every timing rule already
 * written and already tested — the window, the fade, `animateIn`, the slide,
 * the keyframe sample — applies to a shape with no second copy of it anywhere.
 *
 * The cost is a full-frame PNG per shape, which is what text already pays.
 *
 * Every interpolated value goes through `num`/`col`, never `esc`. A colour is
 * not text: `esc` is an XML transform the parser UNDOES, so `url('/etc/passwd')`
 * looks escaped and decodes back into a live reference. `col` rejects anything
 * that is not a colour outright. Same rule as the rest of this file, and the
 * reason `rasterizeSVG` additionally refuses `<image>`/`<use>` on the way in.
 */
export function shapeToSVG(o: ShapeOverlay, width: number, height: number): string {
  const b = shapeBox(o, width, height);
  const fill = `fill="${col(o.fill, '#000000')}" fill-opacity="${n(o.fillOpacity ?? 1, 1)}"`;
  /*
   * `stroke-width` alone does not draw a stroke; an absent `stroke` colour
   * leaves SVG's default of `none`. Requiring BOTH here means a shape that sets
   * only one of them renders the same way in every surface rather than picking
   * up a default that differs between resvg and a browser.
   */
  const stroked = o.stroke != null && (o.strokeWidth ?? 0) > 0;
  const stroke = stroked
    ? ` stroke="${col(o.stroke)}" stroke-width="${n(o.strokeWidth)}"`
    : '';

  const el =
    o.shape === 'ellipse'
      ? `<ellipse cx="${n(b.x + b.w / 2)}" cy="${n(b.y + b.h / 2)}" rx="${n(b.w / 2)}" ry="${n(b.h / 2)}" ${fill}${stroke}/>`
      : // `rx` is clamped to half the box: SVG treats a larger radius as half
        // anyway, but resvg and browsers have disagreed about the rounding on
        // the way there, and a pill must be a pill in both.
        `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" ` +
        `rx="${n(Math.max(0, Math.min(o.cornerRadius ?? 0, b.w / 2, b.h / 2)))}" ${fill}${stroke}/>`;

  /*
   * Rotation is about the shape's own centre, clockwise, matching
   * `VisualTrackClip.rotation` — degrees, so it round-trips through JSON
   * exactly, and clockwise because that is what ffmpeg's `rotate`, Skia and
   * canvas all do, so no renderer has to flip the sign.
   */
  const rot = o.rotation ?? 0;
  const body = rot
    ? `<g transform="rotate(${n(rot)} ${n(b.x + b.w / 2)} ${n(b.y + b.h / 2)})">${el}</g>`
    : el;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width, 1)}" height="${n(height, 1)}">${body}</svg>`;
}
