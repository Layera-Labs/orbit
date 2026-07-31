/**
 * Rotation and source-crop geometry, shared by the ffmpeg export and both
 * previews.
 *
 * Same reason `layout.ts` exists: if the three renderers each work out the size
 * of a rotated box, they will disagree, and a PiP will sit a pixel or two off in
 * the MP4 with nothing to point at. One implementation, three callers — and the
 * mobile app, which cannot import this package, mirrors it and compares OUTPUTS
 * in a test rather than trusting that the two look alike.
 *
 * Two conventions worth stating once, because getting either backwards is a
 * silent, whole-feature bug:
 *
 * 1. **Rotation is CLOCKWISE, in DEGREES, about the centre of the clip's
 *    `rect`.** Clockwise is what ffmpeg's `rotate` actually does (measured, not
 *    assumed), and it is also what Skia's `{rotate}` and canvas `ctx.rotate` do
 *    — so no renderer needs a sign flip. Degrees because 90 survives a JSON
 *    round trip and the snap targets are exactly representable.
 *
 * 2. **Crop is in SOURCE space**, normalized to the media's own decoded size.
 *    It has to be: `ffmpeg.ts` never probes the media and `frameStateAt` is
 *    synchronous and pure, so neither can know a file's natural size. ffmpeg
 *    resolves the fractions with `iw`/`ih`; the compositors resolve them after
 *    decode. See `coverCrop`'s note in `layout.ts` for the same argument.
 *
 * The order of operations, identical everywhere:
 *
 *     decode → user crop → grade → cover-fit into `rect` → effects
 *            → rotate about the rect centre → composite
 *
 * There is still exactly ONE cover-fit; it simply reads from the crop window
 * instead of the whole frame. Crop chooses WHAT, cover-fit chooses how the
 * remainder fills the box. Nothing crops twice.
 */
import { FULL_SOURCE, type SourceRect } from './types';

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
  return Math.max(2, Math.ceil(n / 2) * 2);
}

/** Wrap any angle into (-180, 180], so 370, -350 and 10 are one value. */
export function normalizeRotation(deg: number | undefined): number {
  if (typeof deg !== 'number' || !Number.isFinite(deg)) return 0;
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  // -0 compares equal to 0 but prints as "-0" into a filtergraph.
  return d === 0 ? 0 : d;
}

/** Multiples of 90 are exact: no resampling, so no antialiasing is needed. */
export function isRightAngle(deg: number): boolean {
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
  if (!crop) return true;
  return (
    crop.x <= 0 && crop.y <= 0 && crop.w >= 1 && crop.h >= 1
  );
}

/** Clamp a crop to the source and to a floor that cannot collapse to nothing. */
export function clampSourceRect(crop: SourceRect): SourceRect {
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
