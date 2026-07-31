/**
 * Element entrance/exit animation.
 *
 * The load-bearing test here is the numeric one: `slideOffsetAt` (what both
 * previews draw) and `slideExpr` (what ffmpeg evaluates) are the same function
 * written twice, so they are compared by EVALUATING the expression and diffing
 * the two across the element's whole window. `keyframes.ts` has the identical
 * shape and has never been held to that bar — `clip-effects.test.ts` only
 * asserts its expression contains certain substrings — so this is a new bar
 * rather than a copied one.
 */
import { describe, expect, it } from 'vitest';
import {
  LEGACY_FADE_D,
  SLIDE_DISTANCE,
  animWindows,
  elementFadeAt,
  hasAnim,
  hasFade,
  hasSlide,
  resolveAnim,
  slideExpr,
  slideOffsetAt,
  type ElementAnimPair,
} from '../element-anim';

const W = 1080;
const H = 1920;

/**
 * Evaluate an ffmpeg expression of the subset this module emits.
 *
 * `if(lt(a,b),x,y)`, `if(gt(a,b),x,y)` and arithmetic — no variables but `t`.
 * Translating to JS is honest here because the grammar is tiny and fixed; the
 * point is to catch a sign, a clamp or an endpoint being wrong, and any of
 * those survive a substring assertion.
 */
function evalExpr(expr: string, t: number): number {
  let s = expr;
  // Rewrite innermost-first, so a call's arguments are plain JS by the time
  // its own turn comes. `lastIndexOf` finds the innermost of any nesting.
  for (;;) {
    const i = Math.max(
      s.lastIndexOf('if('),
      s.lastIndexOf('lt('),
      s.lastIndexOf('gt('),
      s.lastIndexOf('clip('),
    );
    if (i < 0) break;
    const name = s.startsWith('clip(', i) ? 'clip' : s.slice(i, i + 3);
    const open = i + name.length;
    let depth = 0;
    let close = -1;
    const args: string[] = [];
    let last = open + 1;
    for (let j = open; j < s.length; j++) {
      if (s[j] === '(') depth++;
      else if (s[j] === ')') {
        depth--;
        if (depth === 0) {
          args.push(s.slice(last, j));
          close = j;
          break;
        }
      } else if (s[j] === ',' && depth === 1) {
        args.push(s.slice(last, j));
        last = j + 1;
      }
    }
    if (close < 0) throw new Error(`unbalanced: ${s}`);
    const js =
      name === 'if'
        ? `((${args[0]})?(${args[1]}):(${args[2]}))`
        : name === 'clip'
          ? `Math.min(Math.max((${args[0]}),(${args[1]})),(${args[2]}))`
          : `((${args[0]})${name === 'lt' ? '<' : '>'}(${args[1]}))`;
    s = s.slice(0, i) + js + s.slice(close + 1);
  }
  // eslint-disable-next-line no-new-func
  return Function('t', `return ${s};`)(t) as number;
}

describe('resolveAnim', () => {
  it('resolves the legacy caption fade to the constant the export used', () => {
    // Old documents are not rewritten; this is where `animation:'fade'` keeps
    // meaning what it has always meant.
    expect(resolveAnim({ animation: 'fade' })).toEqual({
      in: { type: 'fade', duration: LEGACY_FADE_D },
    });
    expect(resolveAnim({ animation: 'none' })).toEqual({});
    expect(resolveAnim({})).toEqual({});
  });

  it('lets an explicit animation win over the legacy field', () => {
    const el = {
      animation: 'fade' as const,
      animateIn: { type: 'slide' as const, duration: 1, edge: 'left' as const },
    };
    expect(resolveAnim(el).in?.type).toBe('slide');
  });
});

describe('the gates', () => {
  it('treat a zero duration and an explicit none as no animation', () => {
    for (const a of [
      {},
      { in: { type: 'none' as const, duration: 1 } },
      { in: { type: 'fade' as const, duration: 0 } },
    ]) {
      expect(hasAnim(a)).toBe(false);
      expect(hasFade(a)).toBe(false);
      expect(hasSlide(a)).toBe(false);
    }
  });

  it('separate fade from slide, because the export treats them differently', () => {
    // `hasFade` in particular decides the pixel format: without an alpha plane
    // `fade=alpha=1` is a silent no-op.
    const f: ElementAnimPair = { in: { type: 'fade', duration: 1 } };
    const s: ElementAnimPair = { in: { type: 'slide', duration: 1 } };
    expect([hasFade(f), hasSlide(f)]).toEqual([true, false]);
    expect([hasFade(s), hasSlide(s)]).toEqual([false, true]);
  });
});

describe('animWindows', () => {
  it('clamps each end to half the window so the ramps cannot cross', () => {
    // Two 3s fades on a 4s element would leave it never fully opaque, which
    // reads as a bug rather than as the animation that was asked for.
    const a: ElementAnimPair = {
      in: { type: 'fade', duration: 3 },
      out: { type: 'fade', duration: 3 },
    };
    expect(animWindows(a, 0, 4, 'fade')).toEqual({ fin: 2, fout: 2 });
  });

  it('reports only the kind asked for', () => {
    const a: ElementAnimPair = {
      in: { type: 'fade', duration: 1 },
      out: { type: 'slide', duration: 1 },
    };
    expect(animWindows(a, 0, 10, 'fade')).toEqual({ fin: 1, fout: 0 });
    expect(animWindows(a, 0, 10, 'slide')).toEqual({ fin: 0, fout: 1 });
  });
});

describe('elementFadeAt', () => {
  it('is the transition ramp, on the element window', () => {
    const a: ElementAnimPair = {
      in: { type: 'fade', duration: 1 },
      out: { type: 'fade', duration: 1 },
    };
    expect(elementFadeAt(a, 2, 6, 2)).toBe(0);
    expect(elementFadeAt(a, 2, 6, 2.5)).toBeCloseTo(0.5, 9);
    expect(elementFadeAt(a, 2, 6, 4)).toBe(1);
    expect(elementFadeAt(a, 2, 6, 5.5)).toBeCloseTo(0.5, 9);
    expect(elementFadeAt(a, 2, 6, 6)).toBe(0);
  });

  it('is 1 with no fade, so an untouched element is untouched', () => {
    expect(elementFadeAt({}, 0, 4, 2)).toBe(1);
    expect(elementFadeAt({ in: { type: 'slide', duration: 1 } }, 0, 4, 0)).toBe(1);
  });
});

describe('slideOffsetAt', () => {
  it('starts fully off and arrives at zero', () => {
    const a: ElementAnimPair = {
      in: { type: 'slide', duration: 1, edge: 'left' },
    };
    const travel = SLIDE_DISTANCE * W;
    expect(slideOffsetAt(a, 0, 4, 0, W, H)).toEqual({ dx: -travel, dy: 0 });
    expect(slideOffsetAt(a, 0, 4, 0.5, W, H).dx).toBe(-travel / 2);
    expect(slideOffsetAt(a, 0, 4, 1, W, H)).toEqual({ dx: 0, dy: 0 });
    expect(slideOffsetAt(a, 0, 4, 3, W, H)).toEqual({ dx: 0, dy: 0 });
  });

  it('leaves toward the edge it is given on the way out', () => {
    const a: ElementAnimPair = {
      out: { type: 'slide', duration: 1, edge: 'down' },
    };
    expect(slideOffsetAt(a, 0, 4, 3, W, H)).toEqual({ dx: 0, dy: 0 });
    expect(slideOffsetAt(a, 0, 4, 4, W, H).dy).toBe(SLIDE_DISTANCE * W);
  });

  it('measures travel against the SHORT side, like every other fraction', () => {
    const a: ElementAnimPair = {
      in: { type: 'slide', duration: 1, edge: 'left' },
    };
    expect(slideOffsetAt(a, 0, 4, 0, 1080, 1920).dx).toBe(-SLIDE_DISTANCE * 1080);
    expect(slideOffsetAt(a, 0, 4, 0, 1920, 1080).dx).toBe(-SLIDE_DISTANCE * 1080);
  });

  it('is zero without a slide', () => {
    expect(slideOffsetAt({}, 0, 4, 1, W, H)).toEqual({ dx: 0, dy: 0 });
    expect(
      slideOffsetAt({ in: { type: 'fade', duration: 1 } }, 0, 4, 0, W, H),
    ).toEqual({ dx: 0, dy: 0 });
  });
});

describe('slideExpr agrees with slideOffsetAt', () => {
  /* The whole point of the module: what ffmpeg computes and what the previews
     draw are the same function. Sampled densely across the window and past
     both ends, because the endpoints and the clamps are where two copies of
     "the same" ramp come apart. */
  const CASES: { name: string; a: ElementAnimPair; s: number; e: number }[] = [
    {
      name: 'slide in from the left',
      a: { in: { type: 'slide', duration: 1, edge: 'left' } },
      s: 0,
      e: 4,
    },
    {
      name: 'slide out downward',
      a: { out: { type: 'slide', duration: 0.8, edge: 'down' } },
      s: 2,
      e: 7,
    },
    {
      name: 'both ends, opposite axes',
      a: {
        in: { type: 'slide', duration: 1.2, edge: 'up' },
        out: { type: 'slide', duration: 0.6, edge: 'right' },
      },
      s: 1,
      e: 6,
    },
    {
      name: 'clamped: two long slides on a short element',
      a: {
        in: { type: 'slide', duration: 5, edge: 'left' },
        out: { type: 'slide', duration: 5, edge: 'left' },
      },
      s: 0,
      e: 2,
    },
    {
      name: 'a custom distance',
      a: { in: { type: 'slide', duration: 1, edge: 'right', distance: 0.6 } },
      s: 0,
      e: 3,
    },
  ];

  for (const { name, a, s, e } of CASES) {
    it(name, () => {
      for (const axis of ['x', 'y'] as const) {
        const expr = slideExpr(a, s, e, W, H, axis);
        for (let i = -2; i <= 42; i++) {
          const t = s + ((e - s) * i) / 40;
          const want = axis === 'x'
            ? slideOffsetAt(a, s, e, t, W, H).dx
            : slideOffsetAt(a, s, e, t, W, H).dy;
          // The sampler rounds to whole pixels (a preview draws on a pixel
          // grid); the expression does not, because ffmpeg's overlay takes the
          // float. Agreement to within that rounding is the claim.
          expect(Math.abs(evalExpr(expr, t) - want)).toBeLessThanOrEqual(0.51);
        }
      }
    });
  }

  it('collapses to a literal 0 when nothing slides on that axis', () => {
    // So the caller can leave the expression out entirely and keep the graph
    // byte-identical to a project without animation.
    const a: ElementAnimPair = {
      in: { type: 'slide', duration: 1, edge: 'left' },
    };
    expect(slideExpr(a, 0, 4, W, H, 'y')).toBe('0');
    expect(slideExpr({}, 0, 4, W, H, 'x')).toBe('0');
    expect(slideExpr(a, 0, 4, W, H, 'x')).not.toBe('0');
  });
});
