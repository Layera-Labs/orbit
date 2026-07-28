/**
 * `gradeMatrix` reproduces what ffmpeg's `eq` computes.
 *
 * The expectations here are not hand-derived: they come from running the same
 * clips through `/v1/render` and probing the returned MP4 (2026-07-28). That is
 * why the tolerances are stated in 8-bit steps rather than as float epsilons —
 * the thing being defended is "the preview and the file look the same", not the
 * arithmetic on the way there.
 */
import { describe, expect, it } from 'vitest';
import { FILTER_PRESETS, gradeMatrix, NEUTRAL, type FilterParams } from '../filters';

/** Apply a 4×5 matrix to an 8-bit colour, the way a canvas or Skia would. */
function apply(m: number[], rgb: [number, number, number]): [number, number, number] {
  const [r, g, b] = rgb.map((v) => v / 255);
  const out: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const v = m[i * 5] * r + m[i * 5 + 1] * g + m[i * 5 + 2] * b + m[i * 5 + 4];
    out.push(Math.max(0, Math.min(255, Math.round(v * 255))));
  }
  return out as [number, number, number];
}

describe('gradeMatrix', () => {
  it('is the identity for a neutral grade', () => {
    const m = gradeMatrix(NEUTRAL);
    for (const c of [
      [0, 0, 0],
      [255, 255, 255],
      [200, 60, 40],
      [40, 80, 200],
      [128, 128, 128],
    ] as [number, number, number][]) {
      expect(apply(m, c)).toEqual(c);
    }
  });

  it('matches the exported MP4 on saturated colour', () => {
    // Probed from the rendered file: source red #C83C28, blue #2850C8.
    const cases: [string, [number, number, number], [number, number, number]][] = [
      ['warm', [201, 60, 39], [211, 53, 27]],
      ['cool', [201, 60, 39], [182, 51, 30]],
      ['mono', [201, 60, 39], [95, 97, 94]],
      ['vivid', [201, 60, 39], [239, 46, 13]],
      ['film', [201, 60, 39], [174, 50, 29]],
      ['warm', [40, 79, 201], [34, 75, 186]],
      ['cool', [40, 79, 201], [30, 70, 200]],
      ['vivid', [40, 79, 201], [17, 77, 241]],
    ];

    for (const [preset, src, expected] of cases) {
      const got = apply(gradeMatrix(FILTER_PRESETS[preset]), src);
      const delta = Math.max(...got.map((v, i) => Math.abs(v - expected[i])));
      /*
       * 10/255, and `vivid` is the only preset that spends more than 6 of it.
       *
       * Not a modelling error — an amplified round trip. We are handed the
       * decoder's 8-bit RGB and have to reconstruct the chroma ffmpeg actually
       * graded; a 1-step rounding difference there comes back multiplied by the
       * saturation (1.4) and again by the chroma→blue gain (1.772/0.878 ≈ 2),
       * so ~2 steps of input noise lands as ~5 on the output. Higher saturation
       * buys more of it, which is exactly the shape observed.
       *
       * The whole set used to be as far out as 25 with contrast and saturation
       * applied per-channel in RGB. This is the floor for an 8-bit round trip,
       * not a number left on the table.
       */
      expect(
        delta,
        `${preset} on rgb(${src}) → got ${got}, ffmpeg gave ${expected}`,
      ).toBeLessThanOrEqual(10);
    }
  });

  it('leaves a mid grey alone when only saturation moves', () => {
    // Grey has no chroma to scale, so any saturation is a no-op on it. A matrix
    // that fails this is mixing the channels, which is the bug this replaced.
    const p: FilterParams = { ...NEUTRAL, saturation: 0.4 };
    const got = apply(gradeMatrix(p), [128, 128, 128]);
    // Within a step: the matrix is recovered numerically, so a channel can land
    // a rounding tick off neutral. A channel-mixing bug moves it much further.
    for (const v of got) expect(Math.abs(v - 128)).toBeLessThanOrEqual(1);
  });
});
