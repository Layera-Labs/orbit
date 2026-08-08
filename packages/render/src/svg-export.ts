/**
 * Headless SVG export for the Orbit document model.
 *
 * Produces a standalone SVG string from a `Page`, mirroring the react-konva
 * renderer (`ElementNode`) so the exported file matches the on-canvas result.
 * This is pure string building — no DOM, no Konva — so it also runs in Node,
 * which makes it reusable for server-side export later.
 *
 * Each element is a Konva `Group` positioned at `(x, y)`, rotated around its
 * top-left origin, with `opacity`/`blendMode`; we reproduce that with a wrapping
 * `<g transform="translate(x y) rotate(r)">`. Shape geometry uses the same
 * formulas Konva's `Star`/`RegularPolygon` use, so stars and polygons line up.
 *
 * Known limitations (intentional for the v2 image core):
 * - Text auto-wrapping by width is not reproduced; explicit "\n" breaks are.
 * - `video` renders as its placeholder rect; `audio`/`qr` are skipped (mirrors
 *   the renderer, which renders nothing for them).
 * - `pattern` page backgrounds are skipped; `gradient` supports `linear-gradient`.
 */
import type { Background, Element, Page } from '@orbit/model';

type El<T extends Element['type']> = Extract<Element, { type: T }>;

interface Defs {
  out: string[];
  n: number;
}

export interface SvgExportOptions {
  /** Draw the page background rect/image (default true). */
  background?: boolean;
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Compact number formatting: round to 3dp and drop trailing zeros. */
function num(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 1000) / 1000);
}

function pairs(flat: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

/** Build a drop-shadow filter, return the ` filter="url(#id)"` attribute. */
function shadowAttr(el: Element, defs: Defs): string {
  const s = el.shadow;
  if (!s) return '';
  const id = `o-sh-${defs.n++}`;
  defs.out.push(
    `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">` +
      `<feDropShadow dx="${num(s.offsetX)}" dy="${num(s.offsetY)}" ` +
      `stdDeviation="${num((s.blur ?? 0) / 2)}" flood-color="${esc(s.color)}" ` +
      `flood-opacity="${num(s.opacity)}"/>` +
      `</filter>`,
  );
  return ` filter="url(#${id})"`;
}

function wrap(el: Element, inner: string, extraAttr: string): string {
  const t =
    `translate(${num(el.x)} ${num(el.y)})` +
    (el.rotation ? ` rotate(${num(el.rotation)})` : '');
  const op = el.opacity != null && el.opacity < 1 ? ` opacity="${num(el.opacity)}"` : '';
  const blend =
    el.blendMode && el.blendMode !== 'normal'
      ? ` style="mix-blend-mode:${el.blendMode}"`
      : '';
  return `<g transform="${t}"${op}${blend}${extraAttr}>${inner}</g>`;
}

function textSvg(el: El<'text'>): string {
  const lines = (el.text ?? '').split('\n');
  const lh = (el.lineHeight ?? 1.2) * el.fontSize;
  const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
  const ax = el.align === 'center' ? el.width / 2 : el.align === 'right' ? el.width : 0;
  const fontStyle = el.fontStyle === 'italic' ? ' font-style="italic"' : '';
  const deco = el.underline ? ' text-decoration="underline"' : '';
  const ls = el.letterSpacing ? ` letter-spacing="${num(el.letterSpacing)}"` : '';
  const strokeAttr =
    el.stroke && (el.strokeWidth ?? 0) > 0
      ? ` stroke="${esc(el.stroke)}" stroke-width="${num(el.strokeWidth!)}" paint-order="stroke"`
      : '';
  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${num(ax)}" y="${num(el.fontSize * 0.8 + i * lh)}">${esc(line) || ' '}</tspan>`,
    )
    .join('');
  return (
    `<text font-family="${esc(el.fontFamily)}" font-size="${num(el.fontSize)}" ` +
    `font-weight="${el.fontWeight ?? 400}"${fontStyle}${deco}${ls} ` +
    `fill="${esc(el.fill)}" text-anchor="${anchor}"${strokeAttr}>${tspans}</text>`
  );
}

function imageSvg(el: El<'image'> | El<'svg'>, defs: Defs): string {
  const radius = el.type === 'image' ? (el.cornerRadius ?? 0) : 0;
  /*
   * The crop.
   *
   * `Crop` is FRACTIONS of the source, and both it and Konva's `crop` mean the
   * same thing: map that window of the source onto the whole destination box.
   * SVG has no crop attribute, so it is expressed the way it actually works —
   * draw the image bigger than the box, offset so the window lands on the
   * origin, and clip to the box.
   *
   * The clip is therefore needed whenever there is a crop OR a corner radius,
   * and the two share one path. That is also why this had to be fixed rather
   * than documented: the still editor can now set a crop, and until this
   * landed the PNG and PDF exports (which go through Konva's own stage)
   * honoured it while the SVG export silently drew the whole picture.
   */
  const crop = el.type === 'image' ? el.crop : undefined;
  const cw = crop && crop.width > 0 ? crop.width : 1;
  const ch = crop && crop.height > 0 ? crop.height : 1;
  const drawW = el.width / cw;
  const drawH = el.height / ch;
  const drawX = -(crop?.x ?? 0) * drawW;
  const drawY = -(crop?.y ?? 0) * drawH;

  let clip = '';
  if (radius > 0 || crop) {
    const id = `o-clip-${defs.n++}`;
    defs.out.push(
      `<clipPath id="${id}"><rect x="0" y="0" width="${num(el.width)}" ` +
        `height="${num(el.height)}" rx="${num(radius)}" ry="${num(radius)}"/></clipPath>`,
    );
    clip = ` clip-path="url(#${id})"`;
  }
  const img =
    `<image href="${esc(el.src)}" x="${num(drawX)}" y="${num(drawY)}" width="${num(drawW)}" ` +
    `height="${num(drawH)}" preserveAspectRatio="none"${clip}/>`;
  const sw = el.type === 'image' ? (el.strokeWidth ?? 0) : 0;
  if (el.type === 'image' && el.stroke && sw > 0) {
    return (
      img +
      `<rect x="0" y="0" width="${num(el.width)}" height="${num(el.height)}" ` +
      `rx="${num(radius)}" ry="${num(radius)}" fill="none" stroke="${esc(el.stroke)}" ` +
      `stroke-width="${num(sw)}"/>`
    );
  }
  return img;
}

function shapeSvg(el: El<'shape'>): string {
  const w = el.width;
  const h = el.height;
  const sw = el.strokeWidth ?? 0;
  const strokeAttr =
    el.stroke && el.stroke !== 'transparent' && sw > 0
      ? ` stroke="${esc(el.stroke)}" stroke-width="${num(sw)}"`
      : '';
  const fill = ` fill="${esc(el.fill)}"`;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2;

  switch (el.shape) {
    case 'ellipse':
      return `<ellipse cx="${num(cx)}" cy="${num(cy)}" rx="${num(w / 2)}" ry="${num(h / 2)}"${fill}${strokeAttr}/>`;
    case 'triangle':
      return `<polygon points="${num(cx)},0 ${num(w)},${num(h)} 0,${num(h)}"${fill}${strokeAttr}/>`;
    case 'star': {
      const numPoints = el.points ?? 5;
      const outer = r;
      const inner = Math.min(w, h) / 4;
      const pts: string[] = [];
      for (let i = 0; i < numPoints * 2; i++) {
        const rad = i % 2 === 0 ? outer : inner;
        const a = (i * Math.PI) / numPoints;
        pts.push(`${num(cx + rad * Math.sin(a))},${num(cy - rad * Math.cos(a))}`);
      }
      return `<polygon points="${pts.join(' ')}"${fill}${strokeAttr}/>`;
    }
    case 'polygon': {
      const sides = el.points ?? 6;
      const pts: string[] = [];
      for (let i = 0; i < sides; i++) {
        const a = (i * 2 * Math.PI) / sides;
        pts.push(`${num(cx + r * Math.sin(a))},${num(cy - r * Math.cos(a))}`);
      }
      return `<polygon points="${pts.join(' ')}"${fill}${strokeAttr}/>`;
    }
    case 'rect':
    default: {
      const rx = el.cornerRadius ? ` rx="${num(el.cornerRadius)}" ry="${num(el.cornerRadius)}"` : '';
      return `<rect x="0" y="0" width="${num(w)}" height="${num(h)}"${rx}${fill}${strokeAttr}/>`;
    }
  }
}

function lineSvg(el: El<'line'>): string {
  const pts = pairs(el.points);
  const ptsStr = pts.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
  const dash = el.dash && el.dash.length ? ` stroke-dasharray="${el.dash.map(num).join(',')}"` : '';
  const poly =
    `<polyline points="${ptsStr}" fill="none" stroke="${esc(el.stroke)}" ` +
    `stroke-width="${num(el.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
  if (!el.arrow || pts.length < 2) return poly;
  // Filled arrowhead at the final point, matching Konva's Arrow defaults.
  const [px, py] = pts[pts.length - 1];
  const [qx, qy] = pts[pts.length - 2];
  const ang = Math.atan2(py - qy, px - qx);
  const len = Math.max(8, el.strokeWidth * 3);
  const wid = Math.max(8, el.strokeWidth * 3) / 2;
  const baseX = px - len * Math.cos(ang);
  const baseY = py - len * Math.sin(ang);
  const nx = Math.cos(ang + Math.PI / 2);
  const ny = Math.sin(ang + Math.PI / 2);
  const head =
    `<polygon points="${num(px)},${num(py)} ` +
    `${num(baseX + nx * wid)},${num(baseY + ny * wid)} ` +
    `${num(baseX - nx * wid)},${num(baseY - ny * wid)}" fill="${esc(el.stroke)}"/>`;
  return poly + head;
}

function groupSvg(el: El<'group'>, defs: Defs): string {
  return el.children.map((child) => elementSvg(child, defs)).join('');
}

function elementSvg(el: Element, defs: Defs): string {
  if (el.visible === false) return '';
  let inner = '';
  switch (el.type) {
    case 'text':
      inner = textSvg(el);
      break;
    case 'image':
    case 'svg':
      inner = imageSvg(el, defs);
      break;
    case 'shape':
      inner = shapeSvg(el);
      break;
    case 'line':
      inner = lineSvg(el);
      break;
    case 'group':
      inner = groupSvg(el, defs);
      break;
    case 'video':
      inner = `<rect x="0" y="0" width="${num(el.width)}" height="${num(el.height)}" rx="4" ry="4" fill="#1f2937"/>`;
      break;
    case 'audio':
    case 'qr':
    default:
      return '';
  }
  if (!inner) return '';
  return wrap(el, inner, shadowAttr(el, defs));
}

// ---- Page background ----------------------------------------------------

function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const SIDE_ANGLE: Record<string, number> = {
  top: 0,
  right: 90,
  bottom: 180,
  left: 270,
  'top right': 45,
  'right top': 45,
  'bottom right': 135,
  'right bottom': 135,
  'bottom left': 225,
  'left bottom': 225,
  'top left': 315,
  'left top': 315,
};

/** Best-effort `linear-gradient(...)` → `<linearGradient>` def. Returns id or null. */
function linearGradientDef(css: string, defs: Defs): string | null {
  try {
    const m = /linear-gradient\((.*)\)/is.exec(css.trim());
    if (!m) return null;
    let parts = splitTopLevel(m[1]);
    if (parts.length < 2) return null;
    let angle = 180;
    const head = parts[0];
    const deg = /^(-?[\d.]+)deg$/i.exec(head);
    if (deg) {
      angle = parseFloat(deg[1]);
      parts = parts.slice(1);
    } else if (/^to\s+/i.test(head)) {
      angle = SIDE_ANGLE[head.replace(/^to\s+/i, '').trim().toLowerCase()] ?? 180;
      parts = parts.slice(1);
    }
    if (parts.length < 2) return null;
    const rad = (angle * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const x1 = 0.5 - dx / 2;
    const y1 = 0.5 - dy / 2;
    const x2 = 0.5 + dx / 2;
    const y2 = 0.5 + dy / 2;
    const stops = parts
      .map((stop, i) => {
        const sm = /^(.*?)(?:\s+([\d.]+)%)?$/.exec(stop.trim());
        const color = sm ? sm[1].trim() : stop.trim();
        const offset =
          sm && sm[2] != null ? `${sm[2]}%` : `${num((i / (parts.length - 1)) * 100)}%`;
        return `<stop offset="${offset}" stop-color="${esc(color)}"/>`;
      })
      .join('');
    const id = `o-grad-${defs.n++}`;
    defs.out.push(
      `<linearGradient id="${id}" x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}">${stops}</linearGradient>`,
    );
    return id;
  } catch {
    return null;
  }
}

function backgroundSvg(bg: Background, w: number, h: number, defs: Defs): string {
  const box = `x="0" y="0" width="${num(w)}" height="${num(h)}"`;
  switch (bg.type) {
    case 'solid':
      return `<rect ${box} fill="${esc(bg.color)}"/>`;
    case 'image':
      return `<image href="${esc(bg.src)}" ${box} preserveAspectRatio="xMidYMid slice"/>`;
    case 'gradient': {
      const id = linearGradientDef(bg.css, defs);
      return id ? `<rect ${box} fill="url(#${id})"/>` : '';
    }
    case 'pattern':
    default:
      return '';
  }
}

// ---- Public API ---------------------------------------------------------

/** Serialize a single page to a standalone SVG document string. */
export function exportPageToSVG(page: Page, opts: SvgExportOptions = {}): string {
  const defs: Defs = { out: [], n: 0 };
  const body: string[] = [];
  if (opts.background !== false) {
    body.push(backgroundSvg(page.background, page.width, page.height, defs));
  }
  for (const el of page.children) body.push(elementSvg(el, defs));
  const defsBlock = defs.out.length ? `<defs>${defs.out.join('')}</defs>` : '';
  return (
    XML_HEADER +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(page.width)}" ` +
    `height="${num(page.height)}" viewBox="0 0 ${num(page.width)} ${num(page.height)}">` +
    defsBlock +
    body.join('') +
    `</svg>`
  );
}

/** Wrap an SVG string in a Blob for download (browser). */
export function svgStringToBlob(svg: string): Blob {
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}
