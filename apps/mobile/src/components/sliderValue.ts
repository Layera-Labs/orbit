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
