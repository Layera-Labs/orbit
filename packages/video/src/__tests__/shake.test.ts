/**
 * Shake: the first AUTHORED transition, held to the rule every other one is.
 *
 * `xfade` has no shake, so unlike every family beside it there is no ffmpeg
 * behaviour to reproduce — we define it. That removes the usual ground truth
 * and replaces it with a different obligation: the JS the previews sample and
 * the expression the export emits must be the same function, or the picture on
 * screen and the picture in the file diverge with nothing to catch it. So this
 * evaluates the emitted expression and compares it against `shakeOffsetAt`,
 * the way `element-anim.test.ts` does for slide.
 */
import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS,
  isAuthoredTransition,
  ridesOverlayPath,
  shakeExpr,
  shakeOffsetAt,
  unsupportedTransitions,
  xfadeHasPreview,
  xfadeStateAt,
} from '../xfade';
import type { TransitionType } from '../types';

const W = 1080;
const H = 1920;
const SHAKES = TRANSITIONS.filter((f) => f.key === 'shake' || f.key === 'shake2')
  .flatMap((f) => f.variants.map((v) => v.type as string));

/** The tiny expression grammar `shakeExpr` emits: `clip`, `sin`, `PI`, arithmetic. */
function evalExpr(expr: string, t: number): number {
  for (;;) {
    const i = Math.max(expr.lastIndexOf('clip('), expr.lastIndexOf('sin('));
    if (i < 0) break;
    const name = expr.startsWith('clip(', i) ? 'clip' : 'sin';
    const open = i + name.length;
    let depth = 0;
    let close = -1;
    const args: string[] = [];
    let last = open + 1;
    for (let j = open; j < expr.length; j++) {
      if (expr[j] === '(') depth++;
      else if (expr[j] === ')') {
        depth--;
        if (depth === 0) {
          args.push(expr.slice(last, j));
          close = j;
          break;
        }
      } else if (expr[j] === ',' && depth === 1) {
        args.push(expr.slice(last, j));
        last = j + 1;
      }
    }
    expect(close).toBeGreaterThan(0);
    const v = args.map((a) => js(a, t));
    const out = name === 'sin' ? Math.sin(v[0]) : Math.min(Math.max(v[0], v[1]), v[2]);
    expect(Number.isFinite(out)).toBe(true);
    expr = expr.slice(0, i) + `(${out})` + expr.slice(close + 1);
  }
  return js(expr, t);
}

function js(src: string, t: number): number {
  // eslint-disable-next-line no-new-func
  return Function('t', 'PI', `return (${src});`)(t, Math.PI) as number;
}

describe('shake', () => {
  it('the export expression is the same function the previews sample', () => {
    for (const name of SHAKES) {
      const at = 3;
      const overlap = 0.8;
      for (const axis of ['x', 'y'] as const) {
        const expr = shakeExpr(name, at, overlap, W, H, axis);
        for (let k = 0; k <= 20; k++) {
          const p = k / 20;
          const want = shakeOffsetAt(name, p, W, H)[axis === 'x' ? 'dx' : 'dy'];
          const got = expr === '0' ? 0 : evalExpr(expr, at + p * overlap);
          // Half a pixel: the expression carries `r3`-rounded constants and the
          // sampler carries full precision, which is the only difference there
          // can be between two spellings of one formula.
          expect([name, axis, p, Math.abs(got - want) <= 0.5]).toEqual([
            name,
            axis,
            p,
            true,
          ]);
        }
      }
    }
  });

  it('starts and ends exactly where the clip belongs', () => {
    /*
     * The envelope is the load-bearing half. Without a displacement of exactly
     * zero at both ends the frame would jump into and out of the transition,
     * which is a visibly different and much worse effect than a shake — and one
     * that only shows on the single boundary frame.
     */
    for (const name of SHAKES) {
      for (const p of [0, 1]) {
        const { dx, dy } = shakeOffsetAt(name, p, W, H);
        expect([name, p, dx, dy]).toEqual([name, p, 0, 0]);
      }
    }
  });

  it('moves both sides by the same amount', () => {
    // It is the FRAME that shakes. Displacing only the incoming clip would read
    // as that clip sliding about on top of a steady one.
    for (const name of SHAKES) {
      for (const p of [0.2, 0.5, 0.77]) {
        const to = xfadeStateAt(name, p, 'to', W, H);
        const from = xfadeStateAt(name, p, 'from', W, H);
        expect([name, to.dx ?? 0, to.dy ?? 0]).toEqual([name, from.dx ?? 0, from.dy ?? 0]);
      }
    }
  });

  it('cross-fades: the incoming clip carries the alpha, the outgoing one does not', () => {
    for (const name of SHAKES) {
      expect(xfadeStateAt(name, 0.25, 'to', W, H).alpha).toBeCloseTo(0.25, 6);
      expect(xfadeStateAt(name, 0.25, 'from', W, H).alpha).toBe(1);
    }
  });

  it('moves on one axis only, and the two directions are mirror images', () => {
    for (const [a, b] of [
      ['shakeleft', 'shakeright'],
      ['shakeup', 'shakedown'],
      ['shake2left', 'shake2right'],
      ['shake2up', 'shake2down'],
    ]) {
      const x = shakeOffsetAt(a, 0.3, W, H);
      const y = shakeOffsetAt(b, 0.3, W, H);
      // `+ 0` on both sides: negating a literal zero yields `-0`, and
      // `toEqual` uses `Object.is`, so a passing case would fail on the
      // stationary axis alone. `-0 + 0` is `+0`.
      expect([a, x.dx + 0]).toEqual([a, -y.dx + 0]);
      expect([a, x.dy + 0]).toEqual([a, -y.dy + 0]);
      // One axis at a time: a diagonal wobble is a different effect and would
      // silently change every variant at once if the table were mistyped.
      expect([a, x.dx === 0 || x.dy === 0]).toEqual([a, true]);
    }
  });

  it('the second tier really is stronger', () => {
    const peak = (n: string) =>
      Math.max(
        ...Array.from({ length: 101 }, (_, k) => {
          const { dx, dy } = shakeOffsetAt(n, k / 100, W, H);
          return Math.abs(dx) + Math.abs(dy);
        }),
      );
    expect(peak('shake2left')).toBeGreaterThan(peak('shakeleft'));
  });

  it('cannot be missing from a server, because it names no token', () => {
    /*
     * The real payoff of an authored family, and the reason `ridesOverlayPath`
     * exists as its own predicate. A shake reaches ffmpeg as an `overlay`
     * offset, not as `xfade=transition=`, so no build can lack it — it survives
     * an ffmpeg with no `xfade` filter at all, and the capability gate must
     * never subtract it.
     */
    for (const name of SHAKES) {
      expect([name, ridesOverlayPath(name)]).toEqual([name, true]);
      expect([name, isAuthoredTransition(name)]).toEqual([name, true]);
      expect([name, xfadeHasPreview(name as TransitionType)]).toEqual([name, true]);
    }
    const boundaries = SHAKES.map((name, i) => ({
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
