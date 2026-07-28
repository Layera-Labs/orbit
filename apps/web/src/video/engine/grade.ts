/**
 * Colour grading that actually matches the export.
 *
 * The obvious route — `ctx.filter = 'brightness(k) contrast(k) saturate(k)'` —
 * is wrong in one specific way: CSS `brightness(k)` MULTIPLIES while
 * `eq=brightness` ADDS an offset. On a mid-grey the two are close; in the
 * shadows they are not (a +0.03 offset lifts a value of 20 to 27, where ×1.03
 * leaves it at 20.6). A preview that quietly darkens the blacks relative to the
 * rendered file is exactly the drift the dual-render invariant exists to
 * prevent.
 *
 * So the grade is built as a single SVG `feColorMatrix`, which has an additive
 * column and can therefore express the whole of `eq` — including the part CSS
 * cannot reach. The matrix itself comes from `gradeMatrix` in `@orbit/video`,
 * which models `eq` where it actually runs: on the YUV planes.
 *
 * HOW CLOSE THIS GETS, measured against a real exported MP4 (2026-07-28):
 * within 6/255 for every preset but `vivid`, which reaches 10 on saturated
 * colour because high saturation amplifies the 8-bit round trip. It was as far
 * out as 25 when contrast and saturation were applied per-channel in RGB. It is
 * still not byte-identical and never will be — an earlier version of this
 * comment claimed CSS contrast and saturate "agree with eq", and they do not.
 *
 * `ctx.filter` accepts `url(#id)` alongside `blur()`, so the two compose. Where
 * `url()` filters are unavailable we fall back to the CSS approximation rather
 * than showing nothing, and say so through `gradeIsExact`.
 */
import { gradeMatrix, type FilterParams } from '@orbit/video/browser';

const NS = 'http://www.w3.org/2000/svg';
const HOST_ID = 'orbit-grade-filters';

let host: SVGSVGElement | null = null;
let exact: boolean | null = null;
const registered = new Set<string>();

function ensureHost(): SVGSVGElement {
  if (host && host.isConnected) return host;
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    host = existing as unknown as SVGSVGElement;
    return host;
  }
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('id', HOST_ID);
  svg.setAttribute('aria-hidden', 'true');
  // Present in the document (required for url() to resolve) but takes no space.
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  document.body.appendChild(svg);
  host = svg;
  return svg;
}

/** Whether `ctx.filter = 'url(#…)'` is honoured here. */
export function gradeIsExact(): boolean {
  if (exact != null) return exact;
  if (typeof document === 'undefined') return false;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return (exact = false);
  // Register a known filter first so the reference is resolvable.
  const id = filterFor({ brightness: 0.1, contrast: 1, saturation: 1, temperature: 0 });
  if (!id) return (exact = false);
  ctx.filter = `url(#${id})`;
  exact = ctx.filter !== 'none' && ctx.filter !== '';
  return exact;
}

const key = (f: FilterParams) =>
  `b${f.brightness}_c${f.contrast}_s${f.saturation}_t${f.temperature}`.replace(/[.\-]/g, (m) =>
    m === '.' ? '_' : 'n',
  );

/**
 * Register (once) an feColorMatrix for these params and return its element id.
 * Returns null when the grade is neutral and no filter is needed.
 */
export function filterFor(f: FilterParams): string | null {
  if (f.brightness === 0 && f.contrast === 1 && f.saturation === 1 && f.temperature === 0)
    return null;
  const id = `orbit-grade-${key(f)}`;
  if (registered.has(id)) return id;

  /*
   * The whole grade — eq AND colortemperature — comes from `@orbit/video`.
   *
   * It lives there rather than here because the mobile Skia preview needs the
   * identical matrix, and the export's arg builder sits beside it. Three
   * surfaces reading one derivation is the only arrangement in which they
   * cannot quietly drift apart, which is the entire point of this file.
   */
  const m = gradeMatrix(f);

  const filter = document.createElementNS(NS, 'filter');
  filter.setAttribute('id', id);
  // Operate on raw values, matching ffmpeg, not on linearized colour.
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  const matrix = document.createElementNS(NS, 'feColorMatrix');
  matrix.setAttribute('type', 'matrix');
  matrix.setAttribute('values', m.map((n) => Number(n.toFixed(6))).join(' '));
  filter.appendChild(matrix);
  ensureHost().appendChild(filter);
  registered.add(id);
  return id;
}

/** The `ctx.filter` string for a grade plus a blur, in the right order. */
export function filterString(f: FilterParams, blurSigma: number): string {
  const parts: string[] = [];
  if (gradeIsExact()) {
    const id = filterFor(f);
    if (id) parts.push(`url(#${id})`);
  } else {
    // Approximate fallback: contrast and saturation are faithful, brightness is
    // the multiplicative stand-in described above.
    if (f.brightness !== 0) parts.push(`brightness(${(1 + f.brightness).toFixed(4)})`);
    if (f.contrast !== 1) parts.push(`contrast(${f.contrast.toFixed(4)})`);
    if (f.saturation !== 1) parts.push(`saturate(${f.saturation.toFixed(4)})`);
  }
  // CSS blur(r) is a Gaussian of σ = r/2; ffmpeg gblur takes σ directly.
  if (blurSigma > 0) parts.push(`blur(${(blurSigma / 2).toFixed(3)}px)`);
  return parts.join(' ');
}
