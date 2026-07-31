/**
 * The timeline's audio bars.
 *
 * The amplitude is synthetic, so there is nothing to compare it against — what
 * these tests hold are the three properties that make the strip worth drawing:
 * it is stable under trim, it obeys the clip's real gain, and silence is still
 * visible.
 */
import { describe, expect, it } from "vitest";
import {
  BAR_PITCH,
  FIELD_HZ,
  FLOOR_H,
  UNITY_H,
  barHeights,
  bucketAmp,
  seedOf,
} from "../waveformBars";

const SRC = "file:///media/song.m4a";

describe("the field", () => {
  it("is deterministic, and addressable at any bucket", () => {
    const seed = seedOf(SRC);
    // Asked for out of order, because a trimmed clip starts in the middle.
    for (const b of [900, 3, 41231, 0, 900])
      expect(bucketAmp(seed, b)).toBe(bucketAmp(seed, b));
    expect(bucketAmp(seed, 12)).not.toBe(bucketAmp(seed, 13));
  });

  it("gives different sources different shapes, and one source one shape", () => {
    const a = seedOf(SRC);
    const b = seedOf("file:///media/other.m4a");
    expect(a).not.toBe(b);
    expect(seedOf(SRC)).toBe(a);
    const spread = Array.from({ length: 200 }, (_, i) => bucketAmp(a, i));
    expect(Math.min(...spread)).toBeGreaterThanOrEqual(0.25);
    expect(Math.max(...spread)).toBeLessThan(0.95);
  });
});

describe("stability under trim", () => {
  /*
   * The bug this replaces: the old strip walked a generator from bar 0 on every
   * render, so trimming a clip drew a DIFFERENT song. Here the field is indexed
   * on source time, so at one zoom level a trimmed clip's bars are exactly the
   * tail of the untrimmed clip's bars.
   */
  it("a trimmed window is a slice of the whole, at the same zoom", () => {
    const pxPerSec = 30;
    const whole = barHeights({ src: SRC, width: 10 * pxPerSec, duration: 10 });
    const tail = barHeights({
      src: SRC,
      width: 5 * pxPerSec,
      trimIn: 5,
      duration: 5,
    });
    expect(tail.length).toBe(whole.length / 2);
    expect(tail).toEqual(whole.slice(whole.length / 2));
  });

  it("bar count follows the pitch", () => {
    expect(barHeights({ src: SRC, width: 100, duration: 4 })).toHaveLength(
      100 / BAR_PITCH,
    );
    // Never fewer than a few, or a very short clip draws nothing at all.
    expect(barHeights({ src: SRC, width: 3, duration: 0.1 }).length).toBe(4);
  });
});

describe("the envelope", () => {
  const bars = (opts: Partial<Parameters<typeof barHeights>[0]>) =>
    barHeights({ src: SRC, width: 600, duration: 10, ...opts });

  it("scales with gain, and 200% draws taller than 100%", () => {
    const unity = bars({ volume: 1 });
    const loud = bars({ volume: 2 });
    const quiet = bars({ volume: 0.5 });
    for (let i = 0; i < unity.length; i++) {
      expect(loud[i]).toBeCloseTo(unity[i] * 2, 6);
      expect(quiet[i]).toBeCloseTo(unity[i] / 2, 6);
    }
    expect(Math.max(...loud)).toBeLessThanOrEqual(1);
  });

  it("holds gain above the ceiling at the ceiling", () => {
    expect(bars({ volume: 9 })).toEqual(bars({ volume: 2 }));
  });

  it("floors silence to a hairline rather than an empty box", () => {
    expect(bars({ volume: 0 })).toEqual(
      Array.from({ length: 120 }, () => FLOOR_H),
    );
  });

  it("ramps up through a fade in and down through a fade out", () => {
    // 2s in, 2s out on a 10s clip.
    const faded = bars({
      volume: 1,
      volumeCurve: [
        { t: 0, v: 0 },
        { t: 0.2, v: 1 },
        { t: 0.8, v: 1 },
        { t: 1, v: 0 },
      ],
    });
    const flat = bars({ volume: 1 });
    // Divide out the per-bar amplitude to see the envelope alone. Only where
    // the bar is still ABOVE the floor: once a bar bottoms out at FLOOR_H the
    // envelope is no longer recoverable from it, which is the point of a floor.
    const env = faded.map((h, i) => (h > FLOOR_H ? h / flat[i] : null));
    const n = env.length;
    const rising = (i: number) =>
      env[i] !== null && env[i - 1] !== null && env[i]! > env[i - 1]!;
    const falling = (i: number) =>
      env[i] !== null && env[i - 1] !== null && env[i]! < env[i - 1]!;
    for (let i = 1; i < n * 0.2; i++)
      if (env[i] !== null && env[i - 1] !== null) expect(rising(i)).toBe(true);
    for (let i = Math.ceil(n * 0.8) + 1; i < n; i++)
      if (env[i] !== null && env[i - 1] !== null) expect(falling(i)).toBe(true);
    // The ramps really do reach the floor at both ends.
    expect(faded[0]).toBe(FLOOR_H);
    expect(faded[n - 1]).toBe(FLOOR_H);
    // The plateau is untouched.
    for (let i = Math.ceil(n * 0.25); i < n * 0.75; i++)
      expect(env[i]).toBeCloseTo(1, 6);
  });

  it("puts unity at half the lane, so there is room above it", () => {
    const b = bars({ volume: 1 });
    expect(Math.max(...b)).toBeLessThan(UNITY_H);
    expect(Math.max(...bars({ volume: 2 }))).toBeGreaterThan(UNITY_H);
  });
});

describe("field resolution", () => {
  it("resolves finer than any zoom the timeline reaches", () => {
    // The timeline tops out well under this; if a bar were wider than a bucket
    // the shape would stair-step visibly as you zoomed in.
    expect(FIELD_HZ).toBeGreaterThan(200 / BAR_PITCH);
  });
});
