/**
 * Entrance and exit animation for any element — a clip, a sticker, a PiP or a
 * caption.
 *
 * Structured like `curve.ts` and `keyframes.ts`, which are the two places this
 * codebase already writes the same function twice: once as a JS sampler and
 * once as an ffmpeg expression string. That shape is what lets a preview and an
 * export agree by construction rather than by inspection, so this is the third.
 *
 * **Fade is deliberately not a new implementation.** `animWindows` returns a
 * `ClipFade` and `elementFadeAt` delegates to `fadeFactorAt`, so an element's
 * fade is provably the same ramp as a transition's — and the export emits the
 * same `fade=t=in:…:alpha=1` pair it already emitted, which `dual-render.test.ts`
 * already asserts. A second ramp would be a second thing to keep in step.
 *
 * **Scale is absent on purpose.** ffmpeg cannot animate scale per frame —
 * `CLAUDE.md` records that as a settled non-feature — so a "pop" entrance is
 * unavailable, and offering one that only worked in the preview would be the
 * more damaging direction of drift. The same reasoning removed four transition
 * types that had never worked.
 */
import { fadeFactorAt, type ClipFade } from './transitions';
import type { AnimKind, ElementAnim, SlideEdge } from './types';

export type { AnimKind, ElementAnim, SlideEdge } from './types';

export interface ElementAnimPair {
  in?: ElementAnim;
  out?: ElementAnim;
}

/**
 * The fade the export has always applied to a caption whose legacy
 * `animation` is `'fade'`. It was a literal `0.3` copy-pasted into three files;
 * `resolveAnim` is now the only place it lives.
 */
export const LEGACY_FADE_D = 0.3;
/** How far a slide travels by default, as a fraction of min(W,H). */
export const SLIDE_DISTANCE = 0.25;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const live = (a: ElementAnim | undefined): a is ElementAnim =>
  !!a && a.type !== 'none' && a.duration > 0;

/**
 * An element's in/out pair, resolving the legacy `TextOverlay.animation`.
 *
 * Old documents are NOT rewritten. A stored `animation: 'fade'` resolves here
 * to exactly the fade the engine has always given it, so every existing project
 * renders byte-identically — which is asserted rather than asserted about.
 */
export function resolveAnim(el: {
  animateIn?: ElementAnim;
  animateOut?: ElementAnim;
  animation?: 'none' | 'fade';
}): ElementAnimPair {
  if (el.animateIn || el.animateOut)
    return { in: el.animateIn, out: el.animateOut };
  if (el.animation === 'fade')
    return { in: { type: 'fade', duration: LEGACY_FADE_D } };
  return {};
}

/** Whether this pair animates anything at all. */
export function hasAnim(a: ElementAnimPair): boolean {
  return live(a.in) || live(a.out);
}

/** Whether either end fades — the gate the export's pixel format depends on. */
export function hasFade(a: ElementAnimPair): boolean {
  return (
    (live(a.in) && a.in.type === 'fade') ||
    (live(a.out) && a.out.type === 'fade')
  );
}

/** Whether either end slides. */
export function hasSlide(a: ElementAnimPair): boolean {
  return (
    (live(a.in) && a.in.type === 'slide') ||
    (live(a.out) && a.out.type === 'slide')
  );
}

/**
 * The in/out durations for `kind`, clamped so they cannot cross.
 *
 * Half the element's window each: past that the two ramps would overlap and the
 * element would never reach full opacity, which reads as a bug rather than as
 * the animation the user asked for.
 */
export function animWindows(
  a: ElementAnimPair,
  start: number,
  end: number,
  kind: AnimKind,
): ClipFade {
  const half = Math.max(0, (end - start) / 2);
  const pick = (x: ElementAnim | undefined) =>
    live(x) && x.type === kind ? Math.min(x.duration, half) : 0;
  return { fin: pick(a.in), fout: pick(a.out) };
}

/**
 * The alpha multiplier this element's fade contributes at timeline time `t`.
 *
 * Literally the transition ramp, applied to a different window — which is the
 * point. The export emits the same filter for both.
 */
export function elementFadeAt(
  a: ElementAnimPair,
  start: number,
  end: number,
  t: number,
): number {
  if (!hasFade(a)) return 1;
  return fadeFactorAt(animWindows(a, start, end, 'fade'), start, end, t);
}

/** Unit travel direction for an edge: where the element comes FROM. */
function dir(edge: SlideEdge | undefined): { x: number; y: number } {
  switch (edge) {
    case 'right':
      return { x: 1, y: 0 };
    case 'up':
      return { x: 0, y: -1 };
    case 'down':
      return { x: 0, y: 1 };
    default:
      return { x: -1, y: 0 }; // 'left'
  }
}

/**
 * The slide offset in PIXELS at timeline time `t`.
 *
 * A DELTA, not a position, so it composes with whatever already placed the
 * element — a static rect, a keyframed position, or a caption's baked anchor —
 * without any of them needing to know about it.
 *
 * The ramps are linear, matching `keyframeExpr` and `volumeCurveExpr`. Easing
 * would be three more chances for the three renderers to disagree, and it can
 * be added in this one file later if it earns its place.
 */
export function slideOffsetAt(
  a: ElementAnimPair,
  start: number,
  end: number,
  t: number,
  W: number,
  H: number,
): { dx: number; dy: number } {
  if (!hasSlide(a)) return { dx: 0, dy: 0 };
  const unit = Math.min(W, H);
  const w = animWindows(a, start, end, 'slide');
  let dx = 0;
  let dy = 0;
  if (w.fin > 0 && t < start + w.fin) {
    // 1 at the start (fully off), 0 once it has arrived.
    const k = Math.max(0, Math.min(1, 1 - (t - start) / w.fin));
    const d = dir(a.in!.edge);
    const travel = (a.in!.distance ?? SLIDE_DISTANCE) * unit;
    dx += d.x * travel * k;
    dy += d.y * travel * k;
  }
  if (w.fout > 0 && t > end - w.fout) {
    const k = Math.max(0, Math.min(1, 1 - (end - t) / w.fout));
    const d = dir(a.out!.edge);
    const travel = (a.out!.distance ?? SLIDE_DISTANCE) * unit;
    dx += d.x * travel * k;
    dy += d.y * travel * k;
  }
  return { dx: Math.round(dx), dy: Math.round(dy) };
}

/**
 * The same offset as an ffmpeg expression in `tvar` (absolute seconds).
 *
 * Nested `if(lt(tvar,…),…)` in the idiom `keyframeExpr` and `volumeCurveExpr`
 * already use — the numeric agreement between this and `slideOffsetAt` is what
 * `__tests__/element-anim.test.ts` checks, which is a bar `keyframes.ts` has
 * never actually been held to.
 */
export function slideExpr(
  a: ElementAnimPair,
  start: number,
  end: number,
  W: number,
  H: number,
  axis: 'x' | 'y',
  tvar = 't',
): string {
  if (!hasSlide(a)) return '0';
  const unit = Math.min(W, H);
  const w = animWindows(a, start, end, 'slide');
  /*
   * `clip(…,0,1)` rather than an `if` window, and that is a correctness fix
   * rather than a tidy-up. The first version guarded with `if(lt(t,t1),…)` and
   * had nothing bounding the ramp BELOW `start`, where `(t-start)` goes
   * negative and `1-(t-start)/fin` exceeds 1 — so an element was pushed
   * further than fully off-screen before its window opened, while the JS
   * sampler (which clamps) said zero. Clipping the progress does the guarding
   * and the clamping in one, and matches how `geq`'s alpha is already written.
   */
  const parts: string[] = [];
  if (w.fin > 0) {
    const d = dir(a.in!.edge)[axis];
    const travel = (a.in!.distance ?? SLIDE_DISTANCE) * unit * d;
    if (travel !== 0)
      parts.push(
        `${r3(travel)}*clip(1-(${tvar}-${r3(start)})/${r3(w.fin)},0,1)`,
      );
  }
  if (w.fout > 0) {
    const d = dir(a.out!.edge)[axis];
    const travel = (a.out!.distance ?? SLIDE_DISTANCE) * unit * d;
    if (travel !== 0)
      parts.push(
        `${r3(travel)}*clip(1-(${r3(end)}-${tvar})/${r3(w.fout)},0,1)`,
      );
  }
  if (!parts.length) return '0';
  return parts.length === 1 ? parts[0] : `(${parts.join('+')})`;
}

/** True when the expression is a constant zero, so a caller can omit it. */
export function slideIsIdentity(
  a: ElementAnimPair,
  start: number,
  end: number,
  W: number,
  H: number,
  axis: 'x' | 'y',
): boolean {
  return slideExpr(a, start, end, W, H, axis) === '0';
}
