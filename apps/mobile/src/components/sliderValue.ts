/**
 * The arithmetic behind the sliders and the typed fields next to them.
 *
 * Pure and separate from `VSlider` because it is the part that can be wrong
 * without anything catching it: a step that does not divide the range, a clamp
 * that lets 900% through, a rounding that leaves `0.15000000000000002` where a
 * comparison expects `0.15`. The components around it cannot be run off-device;
 * this can.
 */

/** Fine enough to feel continuous, coarse enough to bound the writes. */
export const DEFAULT_STEPS = 200;

/** The grid a slider snaps to when the caller does not name one. */
export function defaultStep(min: number, max: number): number {
  return (max - min) / DEFAULT_STEPS;
}

/**
 * Snap `v` to the step, clamp it into range, then round off floating-point
 * fuzz.
 *
 * That last part is not cosmetic. `0.05 * 3` is `0.15000000000000002`, so two
 * values a user cannot tell apart compare unequal — and `VSlider` skips a
 * report only when the new value EQUALS the last one. Without this, nothing is
 * ever deduplicated and a drag writes the store on every touch event, which is
 * the crash this whole module exists to prevent.
 */
export function quantize(v: number, min: number, max: number, step: number): number {
  const snapped = step > 0 ? min + Math.round((v - min) / step) * step : v;
  return Math.round(Math.max(min, Math.min(max, snapped)) * 1e6) / 1e6;
}

/**
 * Above this many marks a scale stops being a scale and becomes a texture — a
 * comb of hairlines that says nothing about where you are. A slider asked for
 * more than this draws none.
 */
export const MAX_TICKS = 40;

/** The values a slider draws a mark at, every `interval` from `min`. */
export function tickValues(min: number, max: number, interval: number): number[] {
  if (!(interval > 0) || max <= min) return [];
  // The epsilon is what puts the final mark on `max` when the interval divides
  // the range exactly: 5 / 0.5 comes out as 9.999999999999998 in binary.
  const n = Math.floor((max - min) / interval + 1e-9);
  if (n < 1 || n > MAX_TICKS) return [];
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(Math.round((min + i * interval) * 1e6) / 1e6);
  return out;
}

/**
 * Is the finger close enough to `target` to be taken as meaning it?
 *
 * A detent, not a magnet: the radius is small enough that the neighbouring
 * steps are still reachable, and it exists so that tapping the mark drawn at
 * 100% lands on exactly 100% rather than a few percent either side of it.
 */
export function withinDetent(
  x: number,
  w: number,
  min: number,
  max: number,
  target: number,
  px: number,
): boolean {
  if (w <= 0 || max <= min) return false;
  const at = ((target - min) / (max - min)) * w;
  return Math.abs(x - at) <= px;
}

/**
 * What a typed percentage means, or `null` when it means nothing.
 *
 * Returns a GAIN (1 = 100%), because that is what the model stores. Anything
 * that is not a number — an empty field, a stray "%", a pasted word — is
 * rejected rather than coerced: `Number("")` is 0, and silently reading an
 * empty field as "mute this clip" is the kind of helpfulness that loses work.
 */
export function parsePercent(
  text: string,
  minPct: number,
  maxPct: number,
  stepPct: number,
): number | null {
  // Only the suffix and whitespace. NOT commas: stripping them reads "1,5" —
  // one and a half in most of the world — as a hundred and fifty.
  const cleaned = text.replace(/[%\s]/g, "");
  if (cleaned === "") return null;
  const pct = Number(cleaned);
  if (!Number.isFinite(pct)) return null;
  return quantize(pct, minPct, maxPct, stepPct) / 100;
}
