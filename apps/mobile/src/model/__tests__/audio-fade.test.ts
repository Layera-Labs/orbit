import { describe, expect, it } from "vitest";
import { fadesOf, maxFadeFor, withFades, withVolume } from "../audio-fade";

const clip = (duration: number, patch: Record<string, unknown> = {}) => ({
  duration,
  ...patch,
});

describe("withFades", () => {
  it("drops the curve entirely when there are no fades", () => {
    expect(withFades(10, { volume: 0.5, fadeIn: 0, fadeOut: 0 })).toEqual({
      volume: 0.5,
      volumeCurve: undefined,
    });
  });

  it("writes the plateau as the curve's value, since a curve overrides volume", () => {
    const { volume, volumeCurve } = withFades(10, {
      volume: 0.4,
      fadeIn: 2,
      fadeOut: 1,
    });
    expect(volume).toBe(0.4);
    expect(volumeCurve).toEqual([
      { t: 0, v: 0 },
      { t: 0.2, v: 0.4 },
      { t: 0.9, v: 0.4 },
      { t: 1, v: 0 },
    ]);
  });

  it("omits the endpoint of a fade that is zero", () => {
    expect(withFades(8, { volume: 1, fadeIn: 2, fadeOut: 0 })!.volumeCurve)
      .toEqual([
        { t: 0, v: 0 },
        { t: 0.25, v: 1 },
        { t: 1, v: 1 },
      ]);
    expect(withFades(8, { volume: 1, fadeIn: 0, fadeOut: 2 })!.volumeCurve)
      .toEqual([
        { t: 0, v: 1 },
        { t: 0.75, v: 1 },
        { t: 1, v: 0 },
      ]);
  });

  it("clamps each fade to half the clip so the two can never cross", () => {
    const { volumeCurve } = withFades(4, { volume: 1, fadeIn: 9, fadeOut: 9 });
    expect(maxFadeFor(4)).toBe(2);
    expect(volumeCurve).toEqual([
      { t: 0, v: 0 },
      { t: 0.5, v: 1 },
      { t: 0.5, v: 1 },
      { t: 1, v: 0 },
    ]);
  });

  it("caps a fade at MAX_FADE however long the clip is", () => {
    expect(maxFadeFor(600)).toBe(5);
  });

  it("clamps the plateau to the ceiling, not just to zero", () => {
    // Unclamped, `volume` was pinned to 2 by `setClipVolume` while the curve
    // kept the larger number — and the curve is what the renderer reads.
    expect(withFades(10, { volume: 9, fadeIn: 2, fadeOut: 0 })).toEqual({
      volume: 2,
      volumeCurve: [
        { t: 0, v: 0 },
        { t: 0.2, v: 2 },
        { t: 1, v: 2 },
      ],
    });
  });
});

/*
 * The regression this function exists for: the Volume panel wrote `volume`
 * alone, so on a clip carrying a fade it moved a number the renderer never
 * reads and the export came back unchanged.
 */
describe("withVolume", () => {
  it("moves the plateau of a faded clip and keeps the fades", () => {
    const faded = { duration: 10, ...withFades(10, { volume: 1, fadeIn: 2, fadeOut: 1 }) };
    const next = withVolume(faded, 2);
    const read = fadesOf({ duration: 10, ...next })!;
    expect(read.volume).toBe(2);
    expect(read.fadeIn).toBeCloseTo(2, 6);
    expect(read.fadeOut).toBeCloseTo(1, 6);
    // And the plateau really is in the curve, where the export looks.
    expect(next.volumeCurve!.map((p) => p.v)).toEqual([0, 2, 2, 0]);
  });

  it("writes a plain number when the clip has no curve", () => {
    expect(withVolume({ duration: 10, volume: 1 }, 0.5)).toEqual({
      volume: 0.5,
      volumeCurve: undefined,
    });
  });

  it("scales a hand-drawn curve instead of flattening it", () => {
    const duck = [
      { t: 0, v: 1 },
      { t: 0.3, v: 0.2 },
      { t: 0.7, v: 0.2 },
      { t: 1, v: 1 },
    ];
    expect(fadesOf({ duration: 10, volumeCurve: duck })).toBeNull(); // not a fade pair
    const next = withVolume({ duration: 10, volumeCurve: duck }, 0.5);
    expect(next.volume).toBe(0.5);
    // The shape survives: the peak becomes the requested level, the duck keeps
    // its proportion to it.
    expect(next.volumeCurve).toEqual([
      { t: 0, v: 0.5 },
      { t: 0.3, v: 0.1 },
      { t: 0.7, v: 0.1 },
      { t: 1, v: 0.5 },
    ]);
  });

  it("drops a curve that is silent throughout — there is no shape to scale", () => {
    expect(
      withVolume(
        { duration: 10, volumeCurve: [{ t: 0, v: 0 }, { t: 1, v: 0 }] },
        1.5,
      ),
    ).toEqual({ volume: 1.5, volumeCurve: undefined });
  });

  it("cannot store a level above the ceiling by either route", () => {
    for (const clip of [
      { duration: 10, volume: 1 },
      { duration: 10, ...withFades(10, { volume: 1, fadeIn: 2, fadeOut: 2 }) },
      { duration: 10, volumeCurve: [{ t: 0, v: 1 }, { t: 0.5, v: 0.2 }, { t: 1, v: 1 }] },
    ]) {
      const next = withVolume(clip, 9);
      expect(next.volume).toBeLessThanOrEqual(2);
      for (const p of next.volumeCurve ?? []) expect(p.v).toBeLessThanOrEqual(2);
    }
  });
});

describe("fadesOf", () => {
  it("reads a plain volume when there is no curve", () => {
    expect(fadesOf(clip(10, { volume: 0.7 }))).toEqual({
      volume: 0.7,
      fadeIn: 0,
      fadeOut: 0,
    });
    expect(fadesOf(clip(10))).toEqual({ volume: 1, fadeIn: 0, fadeOut: 0 });
  });

  it("round-trips everything withFades can write", () => {
    for (const duration of [3, 8, 12.5, 60]) {
      for (let fadeIn of [0, 0.5, 2, maxFadeFor(duration)]) {
        for (let fadeOut of [0, 1, maxFadeFor(duration)]) {
          for (const volume of [0.25, 1, 2]) {
            const want = { volume, fadeIn, fadeOut };
            const written = withFades(duration, want);
            const read = fadesOf({ duration, ...written });
            expect(read, JSON.stringify({ duration, ...want })).not.toBeNull();
            // What comes back is what was WRITTEN, so the expectation has to
            // carry the same clamp — a 2s fade does not survive a 3s clip.
            const cap = maxFadeFor(duration);
            fadeIn = Math.min(fadeIn, cap);
            fadeOut = Math.min(fadeOut, cap);
            // Not exact: a fade is stored as a FRACTION of the clip, so it
            // comes back through a divide and a multiply. The sliders work in
            // tenths of a second, so 1e-6 is many orders past what matters.
            expect(read!.volume).toBeCloseTo(volume, 6);
            expect(read!.fadeIn).toBeCloseTo(fadeIn, 6);
            expect(read!.fadeOut).toBeCloseTo(fadeOut, 6);
          }
        }
      }
    }
  });

  it("reads the curve editor's own fade presets", () => {
    expect(
      fadesOf(
        clip(8, {
          volumeCurve: [
            { t: 0, v: 0 },
            { t: 0.25, v: 1 },
            { t: 1, v: 1 },
          ],
        }),
      ),
    ).toEqual({ volume: 1, fadeIn: 2, fadeOut: 0 });
    expect(
      fadesOf(
        clip(8, {
          volumeCurve: [
            { t: 0, v: 1 },
            { t: 0.75, v: 1 },
            { t: 1, v: 0 },
          ],
        }),
      ),
    ).toEqual({ volume: 1, fadeIn: 0, fadeOut: 2 });
  });

  it("refuses a shape that is not a pair of fades, rather than flattening it", () => {
    // A duck: the middle dips below the plateau.
    expect(
      fadesOf(
        clip(10, {
          volumeCurve: [
            { t: 0, v: 1 },
            { t: 0.3, v: 0.2 },
            { t: 0.7, v: 0.2 },
            { t: 1, v: 1 },
          ],
        }),
      ),
    ).toBeNull();
    // A ramp across the whole clip: no plateau at all.
    expect(
      fadesOf(
        clip(10, {
          volumeCurve: [
            { t: 0, v: 0 },
            { t: 1, v: 1 },
          ],
        }),
      ),
    ).toBeNull();
    // Silence throughout — a plateau of zero is not a fade pair.
    expect(
      fadesOf(
        clip(10, {
          volumeCurve: [
            { t: 0, v: 0 },
            { t: 1, v: 0 },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("is order-insensitive, because the model does not promise sorted points", () => {
    const read = fadesOf(
      clip(10, {
        volumeCurve: [
          { t: 1, v: 0 },
          { t: 0.8, v: 1 },
          { t: 0.2, v: 1 },
          { t: 0, v: 0 },
        ],
      }),
    );
    expect(read!.volume).toBe(1);
    expect(read!.fadeIn).toBeCloseTo(2, 6);
    expect(read!.fadeOut).toBeCloseTo(2, 6);
  });
});
