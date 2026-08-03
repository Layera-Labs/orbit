/**
 * Zoom: the third AUTHORED family, and the first whose export needs `scale` to
 * re-evaluate per frame.
 *
 * Held to the same rule as the shakes and the flashes — `xfade` has no punch,
 * so there is no ffmpeg behaviour to reproduce and the obligation that replaces
 * ground truth is that the JS the previews sample and the expression the export
 * emits are the same function.
 *
 * The emission was measured once against real ffmpeg before this was written,
 * by rendering two white clips on black and reading the box's extent back off
 * the frame. It tracks `zoomScaleAt` to within ~1.5px at 128px wide, which is
 * the even-dimension rounding the 4:2:0 stream forces (`2*round(w/2)`, so the
 * box quantises in 2px steps) plus the interpolated edge. That is a geometric
 * tolerance of the same class as `squeeze`, and for the same reason: this is a
 * resampling family, where the edge families are exact.
 */
import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS,
  isAuthoredTransition,
  ridesOverlayPath,
  unsupportedTransitions,
  xfadeHasPreview,
  xfadeStateAt,
  zoomExpr,
  zoomScaleAt,
} from '../xfade';
import type { TransitionType } from '../types';

const ZOOMS = TRANSITIONS.filter((f) => f.key === 'zoom1' || f.key === 'zoom2')
  .flatMap((f) => f.variants.map((v) => v.type as string));

/** The expression `zoomExpr` emits, evaluated the way ffmpeg's `eval` would. */
function evalExpr(expr: string, t: number): number {
  const js = expr
    .replace(/\bpow\(/g, 'Math.pow(')
    .replace(/\bclip\(/g, 'CLIP(')
    .replace(/\bt\b/g, 'tt');
  // eslint-disable-next-line no-new-func
  return Function(
    'tt',
    'CLIP',
    `return (${js});`,
  )(t, (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)) as number;
}

describe('zoom', () => {
  it('the export expression is the same function the previews sample', () => {
    for (const name of ZOOMS) {
      for (const at of [0, 2.5]) {
        for (const overlap of [0.4, 1]) {
          for (const role of ['from', 'to'] as const) {
            const expr = zoomExpr(name, at, overlap, role);
            for (let k = 0; k <= 20; k++) {
              const p = k / 20;
              expect([name, role, p, evalExpr(expr, at + p * overlap)]).toEqual([
                name,
                role,
                p,
                expect.closeTo(zoomScaleAt(name, p, role), 6),
              ]);
            }
          }
        }
      }
    }
  });

  it('each clip is at its own scale on the side of the cut where it stands alone', () => {
    /*
     * The load-bearing property, and the same one the shake envelope has. A
     * clip that is not at 1 on the first (or last) frame of the transition
     * reads as the picture JUMPING into the move, which is a different and much
     * worse effect than a punch — and one that shows on a single frame.
     */
    for (const name of ZOOMS) {
      expect([name, zoomScaleAt(name, 0, 'from')]).toEqual([name, 1]);
      expect([name, zoomScaleAt(name, 1, 'to')]).toEqual([name, 1]);
    }
  });

  it('is 1 outside its own window, so two of them multiply', () => {
    /*
     * What lets `ffmpeg.ts` multiply a clip's two sides together without asking
     * which boundary the playhead is in. `p` is clamped inside the expression,
     * so a clip that is the outgoing side of a zoom is at exactly its own scale
     * for the whole of the rest of its length.
     */
    for (const name of ZOOMS) {
      for (const t of [-3, -0.001, 1.001, 5]) {
        expect([name, t, evalExpr(zoomExpr(name, 0, 1, 'from'), t)]).toEqual([
          name,
          t,
          t < 0 ? 1 : expect.closeTo(zoomScaleAt(name, 1, 'from'), 6),
        ]);
      }
    }
  });

  it('the two clips meet at the midpoint, which is where the punch peaks', () => {
    for (const name of ZOOMS) {
      expect(zoomScaleAt(name, 0.5, 'from')).toBeCloseTo(zoomScaleAt(name, 0.5, 'to'), 9);
    }
  });

  it('out is exactly in, undone', () => {
    // Geometric rather than linear is what buys this: a zoom out is a zoom in
    // of the same tier with a negated exponent, so the pair are true mirrors
    // instead of merely looking like they might be.
    for (const [a, b] of [
      ['zoom1in', 'zoom1out'],
      ['zoom2in', 'zoom2out'],
    ]) {
      for (const p of [0.2, 0.5, 0.85]) {
        for (const role of ['from', 'to'] as const) {
          expect([a, p, zoomScaleAt(a, p, role) * zoomScaleAt(b, p, role)]).toEqual([
            a,
            p,
            expect.closeTo(1, 9),
          ]);
        }
      }
    }
    // And the second tier really is stronger, in both directions.
    expect(zoomScaleAt('zoom2in', 0.5, 'from')).toBeGreaterThan(
      zoomScaleAt('zoom1in', 0.5, 'from'),
    );
    expect(zoomScaleAt('zoom2out', 0.5, 'from')).toBeLessThan(
      zoomScaleAt('zoom1out', 0.5, 'from'),
    );
  });

  it('cross-fades, and scales both sides differently', () => {
    for (const name of ZOOMS) {
      const to = xfadeStateAt(name, 0.25, 'to', 1080, 1920);
      const from = xfadeStateAt(name, 0.25, 'from', 1080, 1920);
      expect(to.alpha).toBeCloseTo(0.25, 6);
      expect(from.alpha).toBe(1);
      // Uniform on both axes: a non-square scale is a squeeze, a different
      // family, and mistyping the table is how one silently becomes the other.
      expect([name, to.scale!.x]).toEqual([name, to.scale!.y]);
      expect([name, to.scale!.x === from.scale!.x]).toEqual([name, false]);
    }
  });

  it('cannot be missing from a server, because it names no token', () => {
    for (const name of ZOOMS) {
      expect([name, ridesOverlayPath(name)]).toEqual([name, true]);
      expect([name, isAuthoredTransition(name)]).toEqual([name, true]);
      expect([name, xfadeHasPreview(name as TransitionType)]).toEqual([name, true]);
    }
    const boundaries = ZOOMS.map((name, i) => ({
      index: i + 1,
      prevId: 'a',
      nextId: 'b',
      name,
      overlap: 0.5,
      at: 1,
    }));
    expect(unsupportedTransitions(boundaries, ['fade'])).toEqual([]);
  });
});
