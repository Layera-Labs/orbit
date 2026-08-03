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
  sourceCropPx,
  magnifierCropPx,
  mosaicBlurSigma,
  mosaicStepPx,
  regionBoxPx,
  ROUNDED_R,
  xfadeMaskAt,
  type DrawOp,
  type XfMask,
} from '@orbit/video/browser';
import { filterString } from './grade';
import { applyCutout, cutoutIsSupported } from './cutout';
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
  /** Sources this frame draws twice. Filled in by `renderFrame`. */
  duplicated?: Set<string>;
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

  const frameDeps: ComposeDeps = { ...deps, duplicated: duplicatedSrcs(ops) };
  for (const op of ops) {
    const source = sourceFor(op, frameDeps);
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

    /*
     * The export orders these `grade → colorkey → blur`. So when a clip is being
     * keyed the blur has to be held back to a second pass: blurring first would
     * smear the key colour into its neighbours and the matte would be cut on
     * different pixels than the rendered file cuts it on.
     */
    const keying = !!op.cutout && cutoutIsSupported();
    if (deps.filterOK) {
      const filter = keying ? filterString(op.filter, 0) : cssFilter(op);
      if (filter) sctx.filter = filter;
    }

    drawFitted(sctx, source, op, dw, dh, deps);
    sctx.restore();

    if (keying && applyCutout(patch, sctx, op.cutout!, dw, dh) && op.blurSigma > 0) {
      // Deferred blur. `copy` through a separate namespace, because a canvas
      // cannot read and write itself in one drawImage.
      const blurred = scratch(dw, dh, 'blur');
      const bctx = blurred.getContext('2d');
      if (bctx) {
        bctx.setTransform(1, 0, 0, 1, 0, 0);
        bctx.globalCompositeOperation = 'copy';
        bctx.filter = filterString({ ...op.filter, brightness: 0, contrast: 1, saturation: 1, temperature: 0 }, op.blurSigma);
        bctx.drawImage(patch, 0, 0);
        bctx.filter = 'none';
        sctx.globalCompositeOperation = 'copy';
        sctx.drawImage(blurred, 0, 0);
        sctx.globalCompositeOperation = 'source-over';
      }
    }

    // Local region effects run AFTER the clip is drawn and inside its own patch,
    // exactly as the filtergraph does — they resample what is already there.
    if (op.mosaic) applyMosaic(sctx, patch, op.mosaic, dw, dh);
    if (op.magnifier) applyMagnifier(sctx, patch, op.magnifier, dw, dh);

    const xf = op.xf;
    const blend =
      (blendToCanvas(op.blend) as GlobalCompositeOperation | null) ?? 'source-over';
    /*
     * Some transition families are a FIELD over the whole canvas rather than a
     * region of it — a soft alpha mask, a pixelation grid, a box blur. Those
     * cannot run on the clip's own patch: they are expressed in canvas
     * coordinates and the export applies them to a full-canvas frame, so a
     * patch sized to the clip's own rect would quantize or blur on a different
     * grid than the file does. This side is therefore composed full-frame first, the
     * field runs over that, and only then does it reach the frame under its
     * alpha and blend. A wipe or a slide needs none of it and keeps the direct
     * blit — this is the same "only when it is asked for" rule that decides
     * whether `xf` is present at all.
     */
    const field =
      xf && (xf.mask || xf.block || xf.blurX) ? scratch(width, height, 'xf') : null;
    const fctx = field ? field.getContext('2d') : null;
    const out = fctx ?? ctx;
    if (fctx) {
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.globalAlpha = 1;
      fctx.globalCompositeOperation = 'source-over';
      fctx.filter = 'none';
      fctx.clearRect(0, 0, width, height);
    } else {
      ctx.globalAlpha = op.alpha;
      ctx.globalCompositeOperation = blend;
    }

    /*
     * A transition's geometry sits on the OUTER context, around the blit —
     * the same seam rotation uses, and for the same reason: everything already
     * composed into the patch (grade, blur, mask, motion, the local effects) is
     * then confined by it for free.
     *
     * It has to be outer rather than a clip inside the patch, because the
     * region is in CANVAS coordinates. A wipe cuts the frame, not the clip: a
     * picture-in-picture halfway across the split is half gone, which is
     * exactly what the export does when it composites the run from two
     * full-canvas frames.
     */
    out.save();
    if (xf) {
      if (xf.clip) {
        out.beginPath();
        out.rect(xf.clip.x, xf.clip.y, xf.clip.w, xf.clip.h);
        out.clip();
      }
      /*
       * A hole is a rect's COMPLEMENT, drawn even-odd — the same primitive the
       * canvas mat punches its window with. It is what lets the squeeze
       * families keep the incoming clip on top, where every other family puts
       * it, instead of teaching both compositors to reorder their layers.
       */
      if (xf.hole) {
        out.beginPath();
        out.rect(0, 0, width, height);
        out.rect(xf.hole.x, xf.hole.y, xf.hole.w, xf.hole.h);
        out.clip('evenodd');
      }
      // About the canvas centre, matching the export scaling a full-canvas
      // padded frame rather than the clip's own box.
      if (xf.scale) {
        out.translate(width / 2, height / 2);
        out.scale(xf.scale.x, xf.scale.y);
        out.translate(-width / 2, -height / 2);
      }
      /*
       * Translate AFTER clipping, never before: the region is in canvas
       * coordinates and the travel is the picture moving inside it. Swap the
       * two and a slide drags its own window along with it, which looks like a
       * cut rather than a slide.
       */
      if (xf.dx || xf.dy) out.translate(xf.dx ?? 0, xf.dy ?? 0);
    }
    if (op.rotation) {
      /*
       * Rotation is one transform on the BLIT, so everything already composed
       * into the patch — grade, blur, mask, motion, the local effects — turns
       * with the clip for free. Positive is clockwise, the same direction the
       * export's `rotate` goes, so there is no sign flip anywhere.
       *
       * About the centre of `dst`, matching the export's overlay origin being
       * pulled back by half the rotated box's growth (`rotatedBoxPx`).
       */
      const cx = Math.round(op.dst.x) + dw / 2;
      const cy = Math.round(op.dst.y) + dh / 2;
      out.save();
      out.translate(cx, cy);
      out.rotate((op.rotation * Math.PI) / 180);
      out.drawImage(patch, -dw / 2, -dh / 2, dw, dh);
      out.restore();
    } else {
      out.drawImage(patch, Math.round(op.dst.x), Math.round(op.dst.y), dw, dh);
    }
    out.restore();

    if (field && fctx && xf) {
      // Order matches the filter: ffmpeg quantizes or blurs the frame and THEN
      // cross-fades, so the field runs before the alpha reaches it.
      if (xf.block) pixelizeField(fctx, field, xf.block, width, height);
      if (xf.blurX) boxBlurField(fctx, xf.blurX, width, height);
      if (xf.mask) maskField(fctx, xf.mask, width, height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = op.alpha;
      ctx.globalCompositeOperation = blend;
      /*
       * The authored blur rides the composite rather than getting its own pass
       * over the field: `ctx.filter` applies to the draw, so one `drawImage`
       * both blurs and lays it down. `blur(Npx)` takes a standard deviation, the
       * same number `gblur=sigma=` and Skia's `Blur` take, so the three agree
       * without a conversion.
       */
      ctx.filter = xf.blur ? `blur(${xf.blur}px)` : 'none';
      ctx.drawImage(field, 0, 0);
    }
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
}

/**
 * The grid a soft transition mask is sampled on, per axis.
 *
 * Every one of ffmpeg's mask fields ramps over a WHOLE unit of its normalized
 * coordinate — the full half-diagonal, the full half-width, a radian of arc —
 * so they are all low-frequency and a coarse grid bilinearly upscaled is
 * indistinguishable from evaluating per pixel, at a fraction of the cost. The
 * one exception is `angle`, which is singular at the exact centre; that shows
 * as a few soft pixels there and is recorded as a tolerance rather than chased.
 */
const MASK_GRID = 192;

/** Multiply a full-canvas layer's alpha by a transition mask. */
function maskField(
  ctx: CanvasRenderingContext2D,
  m: XfMask,
  W: number,
  H: number,
): void {
  const gw = Math.max(2, Math.min(W, MASK_GRID));
  const gh = Math.max(2, Math.min(H, MASK_GRID));
  const g = scratch(gw, gh, 'xfmask');
  const gctx = g.getContext('2d');
  if (!gctx) return;
  const img = gctx.createImageData(gw, gh);
  const d = img.data;
  for (let j = 0; j < gh; j++) {
    // Sample at the texel CENTRE, which is where bilinear upscaling will put
    // this value back. Sampling at the corner shifts the whole mask by half a
    // grid cell, which at this grid size is several canvas pixels.
    const y = ((j + 0.5) * H) / gh;
    for (let i = 0; i < gw; i++) {
      const x = ((i + 0.5) * W) / gw;
      const a = xfadeMaskAt(m, x, y, W, H);
      d[(j * gw + i) * 4 + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  }
  gctx.putImageData(img, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(g, 0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
}

/** Quantize a full-canvas layer to square blocks, as `pixelize` does. */
function pixelizeField(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  block: number,
  W: number,
  H: number,
): void {
  const bw = Math.max(1, Math.round(W / block));
  const bh = Math.max(1, Math.round(H / block));
  if (bw >= W && bh >= H) return;
  const small = scratch(bw, bh, 'xfpix');
  const sctx = small.getContext('2d');
  if (!sctx) return;
  /*
   * Smoothing OFF in both directions. ffmpeg reads ONE pixel per block — the
   * one nearest the block's centre — rather than averaging it, so a smoothed
   * downscale would give every block the mean of its contents and read as a
   * different effect on any detailed picture.
   */
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalCompositeOperation = 'copy';
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(canvas, 0, 0, bw, bh);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'copy';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * The widest working buffer a box blur is computed in.
 *
 * `hblur`'s box reaches half the frame, so a running sum over a 4K canvas is
 * millions of operations per frame in JS and would drop the preview below the
 * playhead. The result of a wide box blur is smooth by construction, so
 * computing it small and scaling up is visually the same picture — the error
 * concentrates where the box is NARROW, which is the first and last instants of
 * the transition where the effect is barely visible anyway.
 */
const BLUR_MAX_W = 640;

/**
 * ffmpeg's `hblur`, which is not a gaussian and not centred.
 *
 * `vf_xfade.c` accumulates `xf[x .. x+size-1]` and divides by the count, so it
 * is a FORWARD box: the picture shifts left by half the box as well as
 * softening, and near the right edge the window shortens instead of wrapping or
 * clamping. Reproducing the shift matters more than the profile — a centred
 * gaussian of the same width looks similar in isolation and sits visibly in the
 * wrong place beside the file.
 */
function boxBlurField(
  ctx: CanvasRenderingContext2D,
  width: number,
  W: number,
  H: number,
): void {
  const size = Math.max(1, Math.round(width));
  if (size <= 1) return;
  const scale = Math.min(1, BLUR_MAX_W / W);
  const bw = Math.max(2, Math.round(W * scale));
  const bh = Math.max(2, Math.round(H * scale));
  const box = Math.max(1, Math.round(size * scale));
  const buf = scratch(bw, bh, 'xfblur');
  const bctx = buf.getContext('2d', { willReadFrequently: true });
  if (!bctx) return;
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.globalCompositeOperation = 'copy';
  bctx.imageSmoothingEnabled = true;
  bctx.drawImage(ctx.canvas, 0, 0, bw, bh);
  bctx.globalCompositeOperation = 'source-over';

  const img = bctx.getImageData(0, 0, bw, bh);
  const d = img.data;
  const row = new Float32Array(bw * 4);
  for (let y = 0; y < bh; y++) {
    const o = y * bw * 4;
    let s0 = 0;
    let s1 = 0;
    let s2 = 0;
    let s3 = 0;
    const n0 = Math.min(box, bw);
    for (let x = 0; x < n0; x++) {
      s0 += d[o + x * 4];
      s1 += d[o + x * 4 + 1];
      s2 += d[o + x * 4 + 2];
      s3 += d[o + x * 4 + 3];
    }
    let cnt = n0;
    for (let x = 0; x < bw; x++) {
      row[x * 4] = s0 / cnt;
      row[x * 4 + 1] = s1 / cnt;
      row[x * 4 + 2] = s2 / cnt;
      row[x * 4 + 3] = s3 / cnt;
      if (x + box < bw) {
        const a = o + (x + box) * 4;
        const b = o + x * 4;
        s0 += d[a] - d[b];
        s1 += d[a + 1] - d[b + 1];
        s2 += d[a + 2] - d[b + 2];
        s3 += d[a + 3] - d[b + 3];
      } else {
        const b = o + x * 4;
        s0 -= d[b];
        s1 -= d[b + 1];
        s2 -= d[b + 2];
        s3 -= d[b + 3];
        cnt--;
        if (cnt < 1) cnt = 1;
      }
    }
    for (let x = 0; x < bw * 4; x++) d[o + x] = row[x];
  }
  bctx.putImageData(img, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'copy';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(buf, 0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
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
  /*
   * One decoder per FILE, except where this frame draws the same file twice —
   * which a transition between two halves of a split clip does routinely. Two
   * layers on one `<video>` would fight over its `currentTime`, so those get a
   * decoder each, keyed by the clip. An `<img>` has no position to fight over,
   * so images are always shared.
   */
  const key = isVideo && deps.duplicated?.has(op.src) ? `${op.id}|${url}` : url;
  deps.pool.acquire(key, url, isVideo ? 'video' : 'image');
  return deps.pool.frameAt(key, op.srcTime ?? 0, deps.playing && isVideo, 1);
}

/** Sources this frame draws more than once — see `sourceFor`. */
export function duplicatedSrcs(ops: DrawOp[]): Set<string> {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const op of ops) {
    if (op.srcTime == null || !op.src) continue;
    if (seen.has(op.src)) dup.add(op.src);
    else seen.add(op.src);
  }
  return dup;
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
  // The user's crop and the cover-fit resolve TOGETHER, in one shared function:
  // the cover-fit reads from the crop window rather than the whole frame, so
  // nothing crops twice. With no crop this is exactly `coverCrop`.
  const { sx, sy, sw, sh } = sourceCropPx(natural.w, natural.h, op.srcRect, dw, dh);
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
