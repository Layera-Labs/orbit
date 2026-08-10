/**
 * A shape mask has to clip the same pixels in the preview and in the file.
 *
 * `blend.ts` has always shipped all three targets — `blendToFFmpeg`,
 * `blendToSkia`, `blendToCanvas` — so the three surfaces read one table. `mask`
 * shipped only the ffmpeg half, and the canvas half was written by hand in the
 * web app's compositor. Two implementations of the same geometry, in two repos,
 * with nothing comparing them: the exact arrangement the dual-render rule
 * exists to forbid.
 *
 * It had already drifted. `frame.ts` passes `c.mask` through unconditionally,
 * so a mask whose radius is zero — a real document, one drag away in the editor
 * — reaches both surfaces. `maskToFFmpeg` returns `''` for it and the clip
 * renders WHOLE; a canvas clipping to a zero-radius path renders NOTHING. An
 * entire layer, present in the export and absent from the preview, and no test
 * could see it because only one side lived here.
 *
 * So the claim under test is not "the numbers are close". It is that both
 * surfaces resolve one normalized mask to the SAME pixels, and — the part that
 * actually broke — that they agree about when there is no mask at all.
 */
import { describe, expect, it } from 'vitest';
import { maskToCanvas, maskToFFmpeg } from '../mask';
import type { ClipMask } from '../types';

const W = 640;
const H = 360;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Pull the resolved pixel geometry back out of the `geq` expression.
 *
 * Reading the real filter string rather than trusting a shared constant is the
 * point: it is what the encoder is actually handed.
 *
 * The two branches state their extents differently and the test has to respect
 * that. A rectangle writes its half-extents directly, so it compares exactly. A
 * circle writes the SQUARES of its radii — the ellipse test divides by them —
 * and each square is itself rounded to three decimals, so taking a square root
 * back out cannot recover the radius to better than about `0.0005 / r`. That is
 * a lossy round-trip, not a disagreement, and asserting through it would be
 * measuring the test's own arithmetic. Both shapes are therefore compared in
 * the units the filter actually stores.
 */
function geometryOfFilter(filter: string) {
  const inverted = filter.includes('not(');
  const circle = filter.match(
    /lte\(\(X-(-?[\d.]+)\)\^2\/(-?[\d.]+)\+\(Y-(-?[\d.]+)\)\^2\/(-?[\d.]+),1\)/,
  );
  if (circle) {
    return {
      shape: 'circle' as const,
      cx: Number(circle[1]),
      cy: Number(circle[3]),
      /** Stored squared, so a canvas radius is squared and rounded to match. */
      extentX: Number(circle[2]),
      extentY: Number(circle[4]),
      extentOf: (radius: number) => r3(radius * radius),
      inverted,
    };
  }
  const rect = filter.match(
    /lte\(abs\(X-(-?[\d.]+)\),(-?[\d.]+)\)\*lte\(abs\(Y-(-?[\d.]+)\),(-?[\d.]+)\)/,
  );
  if (!rect) throw new Error(`unrecognised mask filter: ${filter}`);
  return {
    shape: 'rectangle' as const,
    cx: Number(rect[1]),
    cy: Number(rect[3]),
    extentX: Number(rect[2]),
    extentY: Number(rect[4]),
    extentOf: (radius: number) => radius,
    inverted,
  };
}

describe('the canvas mask and the ffmpeg mask agree', () => {
  const cases: Array<[string, ClipMask]> = [
    ['a centred circle', { shape: 'circle', cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.25 }],
    ['an off-centre ellipse', { shape: 'circle', cx: 0.3, cy: 0.7, rx: 0.4, ry: 0.15 }],
    ['a rectangle', { shape: 'rectangle', cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.2 }],
    [
      'an inverted rectangle',
      { shape: 'rectangle', cx: 0.25, cy: 0.25, rx: 0.1, ry: 0.1, invert: true },
    ],
    ['an inverted circle', { shape: 'circle', cx: 0.6, cy: 0.4, rx: 0.2, ry: 0.3, invert: true }],
    // Radii that do not land on whole pixels, so a surface rounding differently
    // from the other shows up here rather than as a one-pixel seam in a file.
    ['a mask on fractional pixels', { shape: 'circle', cx: 0.333, cy: 0.777, rx: 0.111, ry: 0.239 }],
  ];

  it.each(cases)('resolves %s to the same pixels', (_name, mask) => {
    const canvas = maskToCanvas(mask, W, H)!;
    const ffmpeg = geometryOfFilter(maskToFFmpeg(mask, W, H));

    expect(canvas).not.toBeNull();
    expect(canvas.cx).toBe(ffmpeg.cx);
    expect(canvas.cy).toBe(ffmpeg.cy);
    // Exact, in whatever units this shape's filter stores — see `extentOf`.
    expect(ffmpeg.extentOf(canvas.rx)).toBe(ffmpeg.extentX);
    expect(ffmpeg.extentOf(canvas.ry)).toBe(ffmpeg.extentY);
  });

  it.each(cases)('makes the same keep-inside-or-outside choice for %s', (_name, mask) => {
    expect(maskToCanvas(mask, W, H)!.invert).toBe(geometryOfFilter(maskToFFmpeg(mask, W, H)).inverted);
  });

  it.each(cases)('dispatches %s on the same shape', (_name, mask) => {
    expect(maskToCanvas(mask, W, H)!.shape).toBe(geometryOfFilter(maskToFFmpeg(mask, W, H)).shape);
  });
});

describe('the two agree about there being no mask', () => {
  /*
   * The regression this file was written for. Each of these produced an empty
   * filter — a clip drawn whole — while a hand-written canvas path clipped to
   * nothing and drew an empty layer.
   */
  const degenerate: Array<[string, ClipMask | undefined]> = [
    ['no mask at all', undefined],
    ['zero width', { shape: 'circle', cx: 0.5, cy: 0.5, rx: 0, ry: 0.25 }],
    ['zero height', { shape: 'rectangle', cx: 0.5, cy: 0.5, rx: 0.25, ry: 0 }],
    ['both zero', { shape: 'circle', cx: 0.5, cy: 0.5, rx: 0, ry: 0 }],
    ['a negative radius', { shape: 'rectangle', cx: 0.5, cy: 0.5, rx: -0.2, ry: 0.2 }],
  ];

  it.each(degenerate)('draws the clip whole for %s', (_name, mask) => {
    expect(maskToFFmpeg(mask, W, H)).toBe('');
    expect(maskToCanvas(mask, W, H)).toBeNull();
  });
});

describe('the mask scales with the clip, not with the frame', () => {
  const mask: ClipMask = { shape: 'circle', cx: 0.5, cy: 0.5, rx: 0.5, ry: 0.5 };

  it('fills a clip of any size, because the coordinates are normalized', () => {
    for (const [w, h] of [
      [100, 100],
      [1920, 1080],
      [7, 13],
    ]) {
      const m = maskToCanvas(mask, w, h)!;
      expect(m.cx).toBe(w / 2);
      expect(m.cy).toBe(h / 2);
      expect(m.rx).toBe(w / 2);
      expect(m.ry).toBe(h / 2);
    }
  });

  it('reads an absent invert as false rather than leaving it undefined', () => {
    // The canvas caller branches on this to choose even-odd clipping. `false`
    // and `undefined` behave the same in an `if`, but only one of them survives
    // a strict comparison in a parity test against another surface.
    expect(maskToCanvas(mask, W, H)!.invert).toBe(false);
  });
});
