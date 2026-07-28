/**
 * The compositor. It executes a `DrawOp[]` and computes nothing.
 *
 * Every number it draws with — destination rect, alpha, blur sigma, motion
 * transform, the SVG for a caption — arrives already resolved from
 * `frameStateAt` in `@orbit/video`. That is the whole anti-drift design: if this
 * file did its own maths, the preview and the exported MP4 could disagree and
 * only a human eye would ever notice.
 *
 * THE TWO-CANVAS RULE
 * `ctx.filter` and a non-`source-over` `globalCompositeOperation` apply to the
 * WHOLE canvas, not the region you happen to draw into. ffmpeg crops the base to
 * the clip rect, blends there, and overlays the patch back. So each clip is
 * drawn into a scratch canvas sized to its rect (grade, blur, motion and mask
 * live there), and only then composited onto the frame under its alpha and blend
 * mode. Skip the scratch and every blurred or blended clip is subtly wrong.
 */
import {
  blendToCanvas,
  coverCrop,
  magnifierCropPx,
  mosaicBlurSigma,
  mosaicStepPx,
  regionBoxPx,
  ROUNDED_R,
  type DrawOp,
} from '@orbit/video/browser';
import { filterString } from './grade';
import type { MediaPool, Decoded } from './sources';

/** Reusable scratch canvases, keyed by size, so we don't allocate per frame. */
const scratchPool = new Map<string, HTMLCanvasElement>();

/**
 * `ns` namespaces the pool. Without it a mosaic's downsample buffer could be
 * handed the very canvas it is reading from whenever the two happen to share a
 * size, and the region would resample itself into mush.
 */
function scratch(w: number, h: number, ns = 'clip'): HTMLCanvasElement {
  const key = `${ns}:${w}x${h}`;
  let c = scratchPool.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    scratchPool.set(key, c);
    // Bound the pool: a timeline with many rect sizes would otherwise grow it
    // without limit as the user drags a PiP around.
    if (scratchPool.size > 24) {
      const oldest = scratchPool.keys().next().value;
      if (oldest && oldest !== key) scratchPool.delete(oldest);
    }
  }
  return c;
}

/** `ctx.filter` for a grade + blur — see `grade.ts` for why it is not CSS-only. */
export function cssFilter(op: DrawOp): string {
  return filterString(op.filter, op.blurSigma);
}

/** True when the runtime can actually apply `ctx.filter` (Safari < 18 cannot). */
export function supportsCanvasFilter(): boolean {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  if (!ctx) return false;
  ctx.filter = 'brightness(2)';
  return ctx.filter !== 'none' && ctx.filter !== '';
}

export interface ComposeDeps {
  pool: MediaPool;
  /** `orbit-media:`/http src → an object URL the browser can decode. */
  resolved: Record<string, string>;
  /** SVG markup → a decoded image, for backgrounds and captions. */
  svgImages: Map<string, HTMLImageElement>;
  playing: boolean;
  /** Whether `ctx.filter` works here; when false, grades are skipped. */
  filterOK: boolean;
}

/**
 * Draw one frame.
 *
 * `ctx` must be sized to the PROJECT resolution; the canvas element is then
 * scaled down by CSS for display, so the preview composites at the same pixel
 * geometry the export does.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  ops: DrawOp[],
  deps: ComposeDeps,
): void {
  const { width, height } = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, width, height);

  for (const op of ops) {
    const source = sourceFor(op, deps);
    if (!source) continue;

    const dw = Math.max(1, Math.round(op.dst.w));
    const dh = Math.max(1, Math.round(op.dst.h));
    const patch = scratch(dw, dh);
    const sctx = patch.getContext('2d');
    if (!sctx) continue;

    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = 'source-over';
    sctx.filter = 'none';
    sctx.clearRect(0, 0, dw, dh);

    sctx.save();

    // Mask first: clip the patch, so everything drawn after is confined to it.
    if (op.mask) applyMask(sctx, op.mask, dw, dh);

    // Motion (Ken Burns) is a centred zoom plus a pan expressed as a fraction
    // of the box — exactly what `motionStateAt` returns for the export's zoompan.
    if (op.motion) {
      sctx.translate(dw / 2, dh / 2);
      sctx.scale(op.motion.scale, op.motion.scale);
      sctx.translate(-dw / 2 + op.motion.tx * dw, -dh / 2 + op.motion.ty * dh);
    }

    if (deps.filterOK) {
      const filter = cssFilter(op);
      if (filter) sctx.filter = filter;
    }

    drawFitted(sctx, source, op, dw, dh, deps);
    sctx.restore();

    // Local region effects run AFTER the clip is drawn and inside its own patch,
    // exactly as the filtergraph does — they resample what is already there.
    if (op.mosaic) applyMosaic(sctx, patch, op.mosaic, dw, dh);
    if (op.magnifier) applyMagnifier(sctx, patch, op.magnifier, dw, dh);

    ctx.globalAlpha = op.alpha;
    ctx.globalCompositeOperation =
      (blendToCanvas(op.blend) as GlobalCompositeOperation | null) ?? 'source-over';
    ctx.drawImage(patch, Math.round(op.dst.x), Math.round(op.dst.y), dw, dh);
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
}

/**
 * Clip the context to a region's shape.
 *
 * The four shapes match `localEffectPatch` in `ffmpeg.ts`, including the corner
 * radius factor the export uses for `rounded` — a tighter or looser radius here
 * would put the effect's edge in a different place than the finished file.
 */
function clipToRegion(
  ctx: CanvasRenderingContext2D,
  shape: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (shape === 'diamond') {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
  } else if (shape === 'rounded') {
    const r = Math.min(w, h) * ROUNDED_R;
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.clip();
}

/** Pixelate (or soften) a region by resampling it through a smaller buffer. */
function applyMosaic(
  ctx: CanvasRenderingContext2D,
  patch: HTMLCanvasElement | OffscreenCanvas,
  mosaic: NonNullable<DrawOp['mosaic']>,
  dw: number,
  dh: number,
): void {
  const { ew, eh, ex, ey } = regionBoxPx(mosaic, dw, dh);
  ctx.save();
  ctx.globalAlpha = mosaic.opacity ?? 1;
  clipToRegion(ctx, mosaic.shape, ex, ey, ew, eh);

  if (mosaic.pattern === 'blur') {
    // `gblur=sigma=n` and CSS `blur(n px)` agree closely enough that the same
    // sigma reads the same; the shared helper keeps the number itself identical.
    ctx.filter = `blur(${mosaicBlurSigma(mosaic.amount)}px)`;
    ctx.drawImage(patch, ex, ey, ew, eh, ex, ey, ew, eh);
  } else {
    const { sw, sh } = mosaicStepPx(mosaic.pattern, mosaic.amount, ew, eh);
    const small = scratch(sw, sh, 'mosaic');
    const sctx = small.getContext('2d');
    if (sctx) {
      sctx.clearRect(0, 0, sw, sh);
      sctx.imageSmoothingEnabled = true; // matches ffmpeg's `flags=area` downscale
      sctx.drawImage(patch, ex, ey, ew, eh, 0, 0, sw, sh);
      // …and `flags=neighbor` on the way back up, which is what makes blocks.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, sw, sh, ex, ey, ew, eh);
      ctx.imageSmoothingEnabled = true;
    }
  }
  ctx.restore();
}

/** A lens: re-draw a centred crop of the region enlarged to fill it. */
function applyMagnifier(
  ctx: CanvasRenderingContext2D,
  patch: HTMLCanvasElement | OffscreenCanvas,
  lens: NonNullable<DrawOp['magnifier']>,
  dw: number,
  dh: number,
): void {
  const { ew, eh, ex, ey } = regionBoxPx(lens, dw, dh);
  const { sw, sh, sx, sy } = magnifierCropPx(lens.zoom, ew, eh);
  ctx.save();
  ctx.globalAlpha = lens.opacity ?? 1;
  clipToRegion(ctx, lens.shape, ex, ey, ew, eh);
  ctx.drawImage(patch, ex + sx, ey + sy, sw, sh, ex, ey, ew, eh);
  ctx.restore();

  const borderPx = Math.round(
    Math.min(0.5, Math.max(0, lens.borderWidth ?? 0)) * Math.min(dw, dh),
  );
  if (borderPx >= 1) {
    ctx.save();
    // `clip()` leaves the path intact, so the same path is then stroked — which
    // keeps the stroke exactly ON the region edge, matching the export's border.
    clipToRegion(ctx, lens.shape, ex, ey, ew, eh);
    ctx.lineWidth = borderPx * 2; // half is clipped away, leaving borderPx inside
    ctx.strokeStyle = lens.borderColor ?? '#ffffff';
    ctx.stroke();
    ctx.restore();
  }
}

function sourceFor(op: DrawOp, deps: ComposeDeps): Decoded | null {
  if (op.svg) return deps.svgImages.get(op.svg) ?? null;
  if (!op.src) return null;
  const url = deps.resolved[op.src] ?? (op.src.startsWith('http') ? op.src : null);
  if (!url) return null;
  const isVideo = op.srcTime != null;
  deps.pool.acquire(url, isVideo ? 'video' : 'image');
  return deps.pool.frameAt(url, op.srcTime ?? 0, deps.playing && isVideo, 1);
}

/** `cover` reproduces scale+crop; `stretch` is the identity fill. */
function drawFitted(
  ctx: CanvasRenderingContext2D,
  source: Decoded,
  op: DrawOp,
  dw: number,
  dh: number,
  deps: ComposeDeps,
): void {
  if (op.fit === 'stretch') {
    ctx.drawImage(source, 0, 0, dw, dh);
    return;
  }
  const natural = deps.pool.sizeOf(source);
  if (!natural) {
    ctx.drawImage(source, 0, 0, dw, dh);
    return;
  }
  const { sx, sy, sw, sh } = coverCrop(natural.w, natural.h, dw, dh);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
}

function applyMask(
  ctx: CanvasRenderingContext2D,
  mask: NonNullable<DrawOp['mask']>,
  w: number,
  h: number,
): void {
  const cx = mask.cx * w;
  const cy = mask.cy * h;
  const rx = mask.rx * w;
  const ry = mask.ry * h;
  ctx.beginPath();
  if (mask.shape === 'circle') ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  else ctx.rect(cx - rx, cy - ry, rx * 2, ry * 2);
  if (mask.invert) {
    // Even-odd against the full box turns the shape into a hole.
    ctx.rect(0, 0, w, h);
    ctx.clip('evenodd');
  } else {
    ctx.clip();
  }
}
