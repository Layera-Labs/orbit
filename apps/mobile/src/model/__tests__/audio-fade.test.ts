import { describe, expect, it } from "vitest";
import { fadesOf, maxFadeFor, withFades } from "../audio-fade";

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
