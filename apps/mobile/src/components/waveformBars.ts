/**
 * Bar heights for the timeline's audio strip.
 *
 * **The amplitude is synthetic and the envelope is real.** Nothing installed here
 * can decode PCM — `expo-audio` plays files and never exposes samples, and Skia
 * decodes video frames only — so the per-bar amplitude is deterministic noise.
 * What is NOT invented is the height it gets scaled by: `clipGainAt` is the same
 * function `preview/audioGraph.ts` sets the player's gain from, so a fade you can
 * hear is a fade you can see, and the two cannot drift.
 *
 * Two things the old strip got wrong, both fixed by sampling a field indexed on
 * SOURCE time rather than on the bar's ordinal:
 *
 * - It **re-rolled on every trim**. The sequence restarted at bar 0 each render,
 *   so dragging a handle redrew a different song. Now trimming slides a window
 *   through a fixed field and the shape stays put.
 * - It was seeded by `clip.id`, so splitting one piece of music into two clips
 *   drew two unrelated waveforms. The seed is the `src`, so the same audio always
 *   looks the same.
 *
 * Unity gain deliberately lands at HALF the lane. Most clips sit at 100%, so this
 * draws them a little shorter than the old strip did — bought in exchange for
 * 200% having somewhere to go. Nothing ever clips at the top.
 */
import type { VolumePoint } from "../model/types";
import { clipGainAt } from "../preview/curve";

/** Pixels between bars. Unchanged from the strip this replaces. */
export const BAR_PITCH = 5;
/** Buckets per second of SOURCE audio — the resolution of the fixed field. */
export const FIELD_HZ = 60;
/** Bar height at unity gain, as a fraction of the lane. Gain 2 reaches 1.0. */
export const UNITY_H = 0.5;
/** The gain that fills the lane. Matches the UI's ceiling (`setClipVolume`). */
export const GAIN_MAX = 2;
/** Silence is still a hairline, never an empty box — as the web strip does. */
export const FLOOR_H = 0.02;

/** 32-bit string hash. Stable across runs, which is the whole point. */
export function seedOf(src: string): number {
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) h = Math.imul(h ^ src.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Pseudo-amplitude 0.25..0.95 for one bucket.
 *
 * A hash of (seed, bucket), NOT a running generator: the caller must be able to
 * ask for bucket 900 without having walked the 899 before it, because a trimmed
 * clip starts in the middle of the field.
 */
export function bucketAmp(seed: number, bucket: number): number {
  let h = (seed ^ Math.imul(bucket + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return 0.25 + ((h % 1000) / 1000) * 0.7;
}

export interface BarInput {
  /** Seeds the field. Two clips of one song share a shape because they share this. */
  src?: string;
  width: number;
  trimIn?: number;
  duration: number;
  volume?: number;
  volumeCurve?: VolumePoint[];
}

/** Height of each bar as a fraction of the lane, left to right. */
export function barHeights(clip: BarInput): number[] {
  const bars = Math.max(4, Math.floor(clip.width / BAR_PITCH));
  const seed = seedOf(clip.src ?? "");
  const trimIn = clip.trimIn ?? 0;
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    // Centre of the bar, so the first and last are not half off the ends.
    const p = (i + 0.5) / bars;
    // The epsilon is load-bearing. `trimIn + p*duration` reaches a given source
    // time by two different routes for a trimmed and an untrimmed clip, and
    // they differ in the last bits — so a value sitting exactly on a bucket
    // boundary floors either side of it and the trimmed clip draws a different
    // shape. 1e-6 of a bucket is 17 nanoseconds; the float error is smaller
    // still, and no real value is within it.
    const bucket = Math.floor((trimIn + p * clip.duration) * FIELD_HZ + 1e-6);
    const gain = Math.min(GAIN_MAX, clipGainAt(clip, p));
    const h = bucketAmp(seed, bucket) * UNITY_H * gain;
    out.push(Math.max(FLOOR_H, Math.min(1, h)));
  }
  return out;
}
