/**
 * Rotation and source-crop geometry (preview side) — MIRRORED from
 * `packages/video/src/transform.ts`.
 *
 * This app is outside the pnpm workspace and cannot import `@orbit/video`, the
 * same arrangement as `motion.ts`, `curve.ts` and the rest.
 * `__tests__/transform.test.ts` compares the OUTPUTS of the two copies over a
 * sweep rather than trusting that they look alike.
 *
 * Every function carries a `'worklet'` directive: the Skia preview computes a
 * cropped clip's draw rect inside a `useDerivedValue`, on the UI thread, from
 * the decoded frame's own dimensions — which is the only place a video's
 * natural size is actually known.
 *
 * The conventions, restated because getting either backwards is silent:
 * rotation is CLOCKWISE in DEGREES about the centre of the clip's `rect`, and
 * crop is normalized to the SOURCE's own size.
 */
import { FULL_SOURCE, type SourceRect } from "../model/types";

/**
 * Round UP to an even integer.
 *
 * Up, not to-nearest: this sizes the box a rotated clip is drawn into, and
 * rounding down shaves a pixel off the corners of the very shape the box exists
 * to contain. Even because H.264 chroma subsampling needs even dimensions —
 * and because a `rect` is already even-sized, so an even box keeps the growth
 * `dx`/`dy` a whole number and the rotation centre off a half pixel.
 */
export function evenUp(n: number): number {
  'worklet';
  return Math.max(2, Math.ceil(n / 2) * 2);
}

/** Wrap any angle into (-180, 180], so 370, -350 and 10 are one value. */
export function normalizeRotation(deg: number | undefined): number {
  'worklet';
  if (typeof deg !== 'number' || !Number.isFinite(deg)) return 0;
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  // -0 compares equal to 0 but prints as "-0" into a filtergraph.
  return d === 0 ? 0 : d;
}

/** Multiples of 90 are exact: no resampling, so no antialiasing is needed. */
export function isRightAngle(deg: number): boolean {
  'worklet';
  return normalizeRotation(deg) % 90 === 0;
}

/** Float noise below this is a zero that a `cos`/`sin` failed to reach. */
const TRIG_EPS = 1e-9;
const trunc0 = (n: number) => (n < TRIG_EPS ? 0 : n);

/**
 * The axis-aligned box a rotated clip occupies, and how far it grew.
 *
 * Computed HERE rather than left to ffmpeg's own `rotw()`/`roth()` expressions,
 * for the same reason as `regionBoxPx`: the preview and the dual-render test
 * have to be able to reproduce the exact number the encoder used.
 *
 * `evenUp` rather than a plain round: see its own note — rounding to nearest
 * would let the box land a pixel inside the shape it is meant to contain, and
 * shave the corner the rotation just created.
 */
export function rotatedBoxPx(
  box: { w: number; h: number },
  deg: number,
): { ow: number; oh: number; dx: number; dy: number } {
  'worklet';
  const d = normalizeRotation(deg);
  if (d === 0) return { ow: evenUp(box.w), oh: evenUp(box.h), dx: 0, dy: 0 };
  const rad = (d * Math.PI) / 180;
  /*
   * Snap the float noise to zero before rounding UP. `Math.cos(Math.PI / 2)` is
   * 6.1e-17, not 0, so a quarter turn of a 128x96 box came out 98 wide instead
   * of 96 — a 2px box error and a 1px offset at every right angle, from a
   * rotation ffmpeg performs bit-exactly.
   */
  const ca = trunc0(Math.abs(Math.cos(rad)));
  const sa = trunc0(Math.abs(Math.sin(rad)));
  const ow = evenUp(box.w * ca + box.h * sa);
  const oh = evenUp(box.w * sa + box.h * ca);
  return { ow, oh, dx: (ow - box.w) / 2, dy: (oh - box.h) / 2 };
}

/** Whether a crop actually selects a sub-rectangle, or is just the whole frame. */
export function isFullSource(crop: SourceRect | undefined): boolean {
  'worklet';
  if (!crop) return true;
  return (
    crop.x <= 0 && crop.y <= 0 && crop.w >= 1 && crop.h >= 1
  );
}

/** Clamp a crop to the source and to a floor that cannot collapse to nothing. */
export function clampSourceRect(crop: SourceRect): SourceRect {
  'worklet';
  const MIN = 0.02;
  const w = Math.min(1, Math.max(MIN, crop.w));
  const h = Math.min(1, Math.max(MIN, crop.h));
  return {
    w,
    h,
    x: Math.min(1 - w, Math.max(0, crop.x)),
    y: Math.min(1 - h, Math.max(0, crop.y)),
  };
}

/**
 * The source rectangle to draw, in SOURCE PIXELS, ready for the 9-argument
 * `drawImage`: `coverCrop` applied INSIDE the crop window rather than to the
 * whole frame.
 *
 * With no crop this must return exactly what `coverCrop(nw, nh, bw, bh)`
 * returns — that identity is the unit-level proof that nothing crops twice, and
 * it is asserted in the tests.
 */
export function sourceCropPx(
  naturalW: number,
  naturalH: number,
  crop: SourceRect | undefined,
  boxW: number,
  boxH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  'worklet';
  const safeW = Math.max(1, naturalW);
  const safeH = Math.max(1, naturalH);
  const c = isFullSource(crop) ? FULL_SOURCE : clampSourceRect(crop!);
  // The window the user chose, in source pixels…
  const wx = c.x * safeW;
  const wy = c.y * safeH;
  const ww = Math.max(1, c.w * safeW);
  const wh = Math.max(1, c.h * safeH);
  if (boxW <= 0 || boxH <= 0) return { sx: wx, sy: wy, sw: ww, sh: wh };
  // …then the ordinary cover-fit, resolved against that window.
  const scale = Math.max(boxW / ww, boxH / wh);
  const sw = Math.min(ww, boxW / scale);
  const sh = Math.min(wh, boxH / scale);
  return { sx: wx + (ww - sw) / 2, sy: wy + (wh - sh) / 2, sw, sh };
}

/** Angles a rotate handle settles onto, in degrees. */
export const SNAP_ANGLES = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];

/**
 * Pull an angle onto the nearest snap target when it is close enough.
 *
 * Both signs are considered, so -44° snaps to -45° rather than to +45°. The
 * default tolerance is deliberately small: a handle that grabs from far away
 * feels like it is fighting you.
 */
export function snapAngle(deg: number, toleranceDeg = 4): number {
  'worklet';
  const d = normalizeRotation(deg);
  let best = d;
  let bestGap = toleranceDeg;
  for (const target of SNAP_ANGLES) {
    for (const signed of target === 0 || target === 180 ? [target] : [target, -target]) {
      const gap = Math.abs(d - signed);
      if (gap <= bestGap) {
        bestGap = gap;
        best = signed;
      }
    }
  }
  return normalizeRotation(best);
}

/**
 * Where to draw the WHOLE image so its crop window lands exactly on `box`.
 *
 * Skia's `<Image>` has no source-rect prop, so a crop cannot be expressed the
 * way the canvas compositor expresses it (a 9-argument `drawImage`). Instead
 * the full image is drawn oversized, positioned so the chosen window sits on
 * the box, and clipped to the box.
 *
 * Derived FROM `sourceCropPx` rather than reworked from the crop rect, so the
 * two cannot disagree: `sourceCropPx` says which source pixels fill the box, and
 * the scale that maps them there is `box.w / sw`.
 *
 * Mobile-only — there is nothing to mirror this against, because no other
 * renderer draws through a shader that lacks a source rect.
 */
export function cropDrawRect(
  naturalW: number,
  naturalH: number,
  crop: SourceRect | undefined,
  box: { x: number; y: number; w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  'worklet';
  const { sx, sy, sw } = sourceCropPx(naturalW, naturalH, crop, box.w, box.h);
  const k = sw > 0 ? box.w / sw : 1;
  return {
    x: box.x - sx * k,
    y: box.y - sy * k,
    w: Math.max(1, naturalW) * k,
    h: Math.max(1, naturalH) * k,
  };
}

/** Which corner or edge of a selection box a handle belongs to. */
export type Corner = "tl" | "tr" | "bl" | "br";
export type Edge = "left" | "right" | "top" | "bottom";

/** Smallest a clip may be scaled to, as a fraction of the canvas. */
const MIN_SIDE = 0.06;

/**
 * Resize a clip by dragging a corner, holding the OPPOSITE corner still.
 *
 * The delta arrives in canvas pixels but the box may be turned, so it is first
 * rotated INTO the box's own frame — otherwise dragging the corner of a clip at
 * 45 degrees moves it sideways instead of outwards. The scale is uniform (the
 * mean of the two axes' factors), which also keeps a crop's aspect agreeing
 * with the box's, so the picture does not start sliding when you resize a
 * clip you have already cropped.
 *
 * Mobile-only for now — the web editor has no direct-manipulation handles. If
 * it grows them, this moves up into `packages/video/src/transform.ts` beside
 * the geometry the renderers share.
 */
export function resizeFromCorner(
  r: { x: number; y: number; w: number; h: number },
  deg: number,
  corner: Corner,
  dxPx: number,
  dyPx: number,
  W: number,
  H: number,
): { x: number; y: number; w: number; h: number } {
  'worklet';
  const rad = (normalizeRotation(deg) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Canvas delta -> box-local delta (rotate by -deg).
  const lx = dxPx * cos + dyPx * sin;
  const ly = -dxPx * sin + dyPx * cos;
  // Which way this corner grows the box.
  const sx = corner === "tr" || corner === "br" ? 1 : -1;
  const sy = corner === "bl" || corner === "br" ? 1 : -1;

  const w0 = Math.max(1, r.w * W);
  const h0 = Math.max(1, r.h * H);
  const k = Math.max(
    (MIN_SIDE * W) / w0,
    (MIN_SIDE * H) / h0,
    ((w0 + sx * lx) / w0 + (h0 + sy * ly) / h0) / 2,
  );
  const w1 = w0 * k;
  const h1 = h0 * k;

  // Hold the anchor corner still ON SCREEN: the centre moves by half the growth
  // in the box's own frame, rotated back into canvas space.
  const gx = ((w1 - w0) / 2) * sx;
  const gy = ((h1 - h0) / 2) * sy;
  const cx = (r.x + r.w / 2) * W + (gx * cos - gy * sin);
  const cy = (r.y + r.h / 2) * H + (gx * sin + gy * cos);

  return {
    x: (cx - w1 / 2) / W,
    y: (cy - h1 / 2) / H,
    w: w1 / W,
    h: h1 / H,
  };
}

/**
 * Trim one side of the picture by dragging a mid-edge handle.
 *
 * Two things move together: the box loses that side, and the crop window loses
 * the matching share of the source. Doing both is what makes it a CROP rather
 * than a resize — the remaining picture stays exactly where it was on screen,
 * and only its extent changes.
 *
 * Everything is in normalized units, so no decoded natural size is needed. The
 * mapping "one box pixel is `crop.w / w0` of the source" is exact whenever the
 * box and the crop window share an aspect, which is the invariant these two ops
 * maintain between them.
 */
export function cropFromEdge(
  r: { x: number; y: number; w: number; h: number },
  crop: SourceRect | undefined,
  deg: number,
  edge: Edge,
  dxPx: number,
  dyPx: number,
  W: number,
  H: number,
): { rect: { x: number; y: number; w: number; h: number }; crop: SourceRect } {
  'worklet';
  const rad = (normalizeRotation(deg) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const lx = dxPx * cos + dyPx * sin;
  const ly = -dxPx * sin + dyPx * cos;

  const c = crop ? clampSourceRect(crop) : { x: 0, y: 0, w: 1, h: 1 };
  const w0 = Math.max(1, r.w * W);
  const h0 = Math.max(1, r.h * H);
  const out = { x: r.x, y: r.y, w: r.w, h: r.h };
  const nc = { x: c.x, y: c.y, w: c.w, h: c.h };

  if (edge === "left" || edge === "right") {
    const inward = edge === "left" ? lx : -lx;
    const d = Math.max(-w0 + MIN_SIDE * W, Math.min(w0 - MIN_SIDE * W, inward));
    const share = (d / w0) * c.w;
    out.w = (w0 - d) / W;
    if (edge === "left") {
      // The box shrinks from its left edge, which in canvas space means its
      // origin moves along the box's own x axis — not the screen's.
      out.x = r.x + (d * cos) / W;
      out.y = r.y + (d * sin) / H;
      nc.x = c.x + share;
    }
    nc.w = c.w - share;
  } else {
    const inward = edge === "top" ? ly : -ly;
    const d = Math.max(-h0 + MIN_SIDE * H, Math.min(h0 - MIN_SIDE * H, inward));
    const share = (d / h0) * c.h;
    out.h = (h0 - d) / H;
    if (edge === "top") {
      out.x = r.x - (d * sin) / W;
      out.y = r.y + (d * cos) / H;
      nc.y = c.y + share;
    }
    nc.h = c.h - share;
  }
  return { rect: out, crop: clampSourceRect(nc) };
}
