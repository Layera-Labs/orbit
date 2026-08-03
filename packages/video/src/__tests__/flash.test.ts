/**
 * Blink and Light: the second AUTHORED family, and the one that proved `fade`
 * is the wrong primitive for a ramp.
 *
 * Like the shakes, `xfade` has no flash, so there is no ffmpeg behaviour to
 * reproduce — we define it, and the obligation that replaces ground truth is
 * that the JS the previews sample and the expression the export emits are the
 * same function.
 *
 * They were first built on a pair of chained `fade` filters, which reads as the
 * obvious spelling and is wrong by up to a quarter of the ramp. Measured
 * against ffmpeg 8.1.2 at `st=0.25:d=0.25` on a 30fps source, `fade` does not
 * ramp on the clock at all:
 *
 *     frame 8  t=0.2667  alpha=0     (a continuous ramp is already at 0.067)
 *     frame 9  t=0.3000  alpha=32    (= 1/8, not 0.2)
 *     ...
 *     frame 15 t=0.5000  alpha=223   (= 7/8, not 1)
 *
 * It counts FRAMES: it starts at the first frame at or after `st` and gives
 * that frame a factor of exactly zero, then steps by `1/round(d*fps)`. So the
 * ramp is displaced by however far `st` sits from a frame boundary — here half
 * a frame out of a four-frame ramp. `geq` on an expression in `T` has none of
 * that, and measured back the same way it reproduces the triangle to 1/255.
 */
import { describe, expect, it } from 'vitest';
import {
  flashAlphaAt,
  flashColor,
  flashExpr,
  isAuthoredTransition,
  ridesOverlayPath,
  unsupportedTransitions,
  xfadeHasPreview,
  xfadeStateAt,
  xfadeVeilAt,
} from '../xfade';
import type { TransitionType } from '../types';

const FLASHES: TransitionType[] = ['blink', 'light'];

/** The expression `flashExpr` emits, evaluated the way ffmpeg's `eval` would. */
function evalExpr(expr: string, t: number): number {
  const js = expr
    .replace(/abs\(/g, 'Math.abs(')
    .replace(/\bclip\(/g, 'CLIP(')
    .replace(/\bT\b/g, 't');
  // eslint-disable-next-line no-new-func
  return Function(
    't',
    'CLIP',
    `return (${js});`,
  )(t, (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)) as number;
}

describe('flash', () => {
  it('the export expression is the same function the previews sample', () => {
    for (const at of [0, 1.5, 3.25]) {
      for (const overlap of [0.4, 0.8, 1.2]) {
        const expr = flashExpr(at, overlap);
        for (let k = 0; k <= 40; k++) {
          const p = k / 40;
          const got = evalExpr(expr, at + p * overlap);
          expect([at, overlap, p, got]).toEqual([at, overlap, p, expect.closeTo(flashAlphaAt(p), 6)]);
        }
      }
    }
  });

  it('leaves both ends of the overlap untouched', () => {
    /*
     * The load-bearing half, exactly as the shake envelope is. A veil that is
     * not zero at `p = 0` would darken (or blow out) the frame the instant the
     * transition begins, which reads as a one-frame glitch rather than a flash.
     */
    for (const p of [0, 0.1, 0.25, 0.75, 0.9, 1]) {
      expect([p, flashAlphaAt(p)]).toEqual([p, 0]);
    }
    expect(flashAlphaAt(0.5)).toBe(1);
  });

  it('blooms through the colour it names, and only over the middle half', () => {
    expect(flashColor('blink')).toBe('#000000');
    expect(flashColor('light')).toBe('#ffffff');
    expect(flashColor('fade')).toBeNull();
    for (const name of FLASHES) {
      expect([name, xfadeVeilAt(name, 0.5)]).toEqual([
        name,
        { color: flashColor(name), alpha: 1 },
      ]);
      expect([name, xfadeVeilAt(name, 0.1)?.alpha]).toEqual([name, 0]);
    }
  });

  it('cross-fades underneath the veil', () => {
    // The veil is a third op BETWEEN the clips, so the clips themselves do the
    // ordinary thing. Getting this wrong is invisible at the peak, where the
    // veil hides everything, and obvious at both edges.
    for (const name of FLASHES) {
      expect(xfadeStateAt(name, 0.25, 'to', 1080, 1920).alpha).toBeCloseTo(0.25, 6);
      expect(xfadeStateAt(name, 0.25, 'from', 1080, 1920).alpha).toBe(1);
    }
  });

  it('cannot be missing from a server, because it names no token', () => {
    for (const name of FLASHES) {
      expect([name, ridesOverlayPath(name)]).toEqual([name, true]);
      expect([name, isAuthoredTransition(name)]).toEqual([name, true]);
      expect([name, xfadeHasPreview(name)]).toEqual([name, true]);
    }
    const boundaries = FLASHES.map((name, i) => ({
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
