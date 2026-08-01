/**
 * Transitions between consecutive main-track clips.
 *
 * **What changed, and why it had to.** A transition used to be a dip to the
 * background: clip A's alpha ramped to 0 over its last `d`, then clip B's ramped
 * up over its first `d`, with the background visible in between and the whole
 * thing costing `2d` of wall time. That is the only shape available when clips
 * are butt-joined, because two of them can never be on screen at the same
 * instant — and it is why every non-`fade` type was collapsed away rather than
 * implemented (`transitions.ts`, before this).
 *
 * A real transition needs both clips at once, so the clips **overlap**. Clip B
 * starts `overlap` seconds before clip A ends, exactly as ffmpeg's `xfade`
 * wants, and exactly as every editor this app is modelled on behaves: adding a
 * transition makes the track shorter.
 *
 * **Geometry is authoritative for timing; `transitionIn` is authoritative for
 * intent.** `transitionIn.duration` is what the user ASKED for — the packer
 * applies it, laying B's `start` back by that much. What actually renders is
 * `prevEnd - nextStart`, the overlap you can see on the timeline. One direction,
 * request → ops → geometry → renderers, so a drag that changes the picture can
 * never leave the export rendering something else. `transitionIn.type` is the
 * only thing read from the model at render time besides that geometry.
 *
 * Built to the `element-anim.ts` pattern: one module, sampled in JS by the
 * previews and emitted as filter arguments by the export, so the two agree by
 * construction rather than by inspection. Mirrored into
 * `apps/mobile/src/preview/xfade.ts` (mobile cannot import this package) and
 * compared by OUTPUT in a test there.
 */
import type { Transition, VisualTrackClip } from './types';
import { blendToFFmpeg } from './blend';

/**
 * The most of a clip a transition may consume, per side.
 *
 * Half, which is the same clamp `animWindows` applies to an element's own
 * in/out pair and for the same reason: past it the two transitions on either
 * end of a clip would meet, and the clip would never once be shown whole.
 */
export const MAX_OVERLAP_FRAC = 0.5;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Why a boundary is not rendering the transition that was asked for.
 *
 * Reported rather than hidden, because the SAME value drives the export, both
 * previews and the picker's disabled state — a preview cannot promise something
 * the file will not contain if all four are told the same thing by the same
 * function.
 */
export type TransitionDowngrade =
  /** A blend mode on either side. See `resolveTransitions`. */
  | 'blend'
  /**
   * The clips do not overlap — they touch exactly, or there is a gap. Either
   * way there is no interval in which both are on screen, so there is nothing
   * to cross-fade between.
   */
  | 'no-overlap'
  /** Nothing precedes this clip — it can only fade up from the background. */
  | 'no-predecessor';

export interface TransitionBoundary {
  /** Index of the INCOMING clip in the track's array. Never 0 for an xfade. */
  index: number;
  prevId: string;
  nextId: string;
  /** The ffmpeg `transition=` token. */
  name: string;
  /** Seconds the two clips overlap and the transition runs over. */
  overlap: number;
  /** Absolute timeline second the transition starts (the incoming clip's start). */
  at: number;
  downgraded?: TransitionDowngrade;
}

/** A boundary that could not overlap, and falls back to a ramp from the background. */
export interface EdgeFade {
  index: number;
  clipId: string;
  duration: number;
  reason: TransitionDowngrade;
}

export interface ResolvedTransitions {
  /** Real overlapping transitions, in track order. */
  boundaries: TransitionBoundary[];
  /** The ones that could not overlap and fade through the background instead. */
  edges: EdgeFade[];
}

/**
 * The `transition=` token for a model transition, or `null` for no transition.
 *
 * **Stage 1 maps every live type to `fade`**, which is exactly what the engine
 * has always done — `buildFadeMap` read only `type !== 'cut'` and threw the rest
 * away. The difference is that the collapse now happens in ONE named place that
 * the picker can also read, instead of being implied by what a fade map chose to
 * ignore. The remaining families land here.
 */
export function xfadeName(t: Transition | undefined): string | null {
  if (!t || t.type === 'cut' || !(t.duration > 0)) return null;
  return 'fade';
}

/** Whether a clip's compositing forbids joining it into an xfade run. */
function isBlended(c: VisualTrackClip): boolean {
  return !!blendToFFmpeg(c.blend);
}

/**
 * How far `next` should be laid back over `prev` — the LAYOUT side of a
 * transition, as distinct from `resolveTransitions`, which reads back what the
 * layout produced.
 *
 * This is the one place that turns a stored `transitionIn.duration` into
 * geometry, so the packer, the migration and the ripple ops all place clips the
 * same way. Clamped here as well as in the resolver, because a request that
 * exceeds the clamp must not be silently written into `start` and then read
 * back as a shorter transition — the picture would disagree with the number in
 * the sheet.
 */
export function requestedOverlap(
  prev: VisualTrackClip | undefined,
  next: VisualTrackClip,
): number {
  const t = next.transitionIn;
  if (!prev || !t || t.type === 'cut' || !(t.duration > 0)) return 0;
  return r3(
    Math.min(t.duration, MAX_OVERLAP_FRAC * Math.min(prev.duration, next.duration)),
  );
}

/**
 * Every boundary on one visual track, resolved once for all four consumers.
 *
 * The clips are taken in ARRAY order, not sorted — that is the order the export
 * composites in and the order `visualClipsOf` reports, and sorting here would
 * silently disagree with both.
 */
export function resolveTransitions(clips: VisualTrackClip[]): ResolvedTransitions {
  const boundaries: TransitionBoundary[] = [];
  const edges: EdgeFade[] = [];

  clips.forEach((next, i) => {
    const name = xfadeName(next.transitionIn);
    if (!name) return;
    const requested = next.transitionIn!.duration;

    const prev = clips[i - 1];
    if (!prev) {
      edges.push({
        index: i,
        clipId: next.id,
        duration: requested,
        reason: 'no-predecessor',
      });
      return;
    }

    /*
     * A blended clip's export branch crops the region of the ACCUMULATED CANVAS
     * under its box, blends against it and overlays the patch back. Inside an
     * xfade run there is no such canvas — the run is composited as one unit —
     * so the two cannot both happen.
     *
     * It downgrades to a fade rather than to a cut. With overlap that costs
     * nothing: drawing B over A at alpha p IS `p*B + (1-p)*A`, which is exactly
     * what `xfade=fade` computes. Dropping the transition entirely would remove
     * something the user set, for a reason internal to the renderer.
     */
    const blended = isBlended(prev) || isBlended(next);

    // What the timeline actually shows. Positive = overlap, negative = a gap.
    const geo = r3(prev.start + prev.duration - next.start);
    if (geo <= 0) {
      edges.push({ index: i, clipId: next.id, duration: requested, reason: 'no-overlap' });
      return;
    }

    const overlap = r3(
      Math.min(geo, MAX_OVERLAP_FRAC * Math.min(prev.duration, next.duration)),
    );
    if (overlap <= 0) {
      edges.push({ index: i, clipId: next.id, duration: requested, reason: 'no-overlap' });
      return;
    }

    boundaries.push({
      index: i,
      prevId: prev.id,
      nextId: next.id,
      name: blended ? 'fade' : name,
      overlap,
      at: r3(next.start),
      ...(blended ? { downgraded: 'blend' as const } : {}),
    });
  });

  return { boundaries, edges };
}

/**
 * How far through a transition timeline second `t` is, in 0..1.
 *
 * Half-open at the top, which is measured rather than assumed: rendering a
 * `wipeleft` frame by frame, the frame at `offset + duration` is already
 * entirely the incoming clip, so the window is `[offset, offset+duration)`.
 */
export function xfadeProgressAt(t: number, offset: number, duration: number): number {
  if (!(duration > 0)) return t >= offset ? 1 : 0;
  return Math.max(0, Math.min(1, (t - offset) / duration));
}

/** Which side of a transition an op is. */
export type XfRole = 'from' | 'to';

/**
 * What a renderer has to do to one side of a transition at progress `p`.
 *
 * Per-SIDE on purpose: each clip's op carries its own already-resolved state, so
 * no compositor ever needs to know about the other clip. That keeps the standing
 * contract that the draw list is executed, not interpreted.
 *
 * Stage 1 carries alpha alone. The geometric fields (`dx`/`dy`/`scale`/`clip`/
 * `ramp`) land with the families that need them.
 */
export interface XfState {
  alpha: number;
}

/** The boundaries a single clip takes part in. At most one of each. */
export interface ClipXfades {
  /** The transition this clip is arriving through. */
  asTo?: TransitionBoundary;
  /** The transition this clip is leaving through. */
  asFrom?: TransitionBoundary;
}

/** clip id → its boundaries, so a renderer can look itself up once. */
export function xfadeMapOf(boundaries: TransitionBoundary[]): Map<string, ClipXfades> {
  const map = new Map<string, ClipXfades>();
  const at = (id: string) => {
    let e = map.get(id);
    if (!e) map.set(id, (e = {}));
    return e;
  };
  for (const b of boundaries) {
    at(b.nextId).asTo = b;
    at(b.prevId).asFrom = b;
  }
  return map;
}

/**
 * What this clip's side of a live transition looks like at timeline second `t`,
 * or `undefined` when it is not in one.
 *
 * Only ever one at a time: `MAX_OVERLAP_FRAC` keeps a clip's two transitions
 * from meeting, so the windows cannot both be open.
 */
export function xfadeStateFor(
  x: ClipXfades | undefined,
  t: number,
): (XfState & { role: XfRole; name: string; p: number }) | undefined {
  if (!x) return undefined;
  const live = (b: TransitionBoundary | undefined) =>
    !!b && t >= b.at && t <= b.at + b.overlap;
  const b = live(x.asTo) ? x.asTo! : live(x.asFrom) ? x.asFrom! : undefined;
  if (!b) return undefined;
  const role: XfRole = b === x.asTo ? 'to' : 'from';
  const p = xfadeProgressAt(t, b.at, b.overlap);
  return { ...xfadeStateAt(b.name, p, role), role, name: b.name, p };
}

export function xfadeStateAt(name: string, p: number, role: XfRole): XfState {
  /*
   * `fade` is a straight lerp between the two pictures, and the incoming clip is
   * drawn OVER the outgoing one — so `p*B + (1-p)*A` falls out of ordinary
   * source-over compositing with B at alpha p and A left alone. Measured: at
   * p=0.5 between pure red and pure blue, ffmpeg reads `127 0 127` in RGB. A
   * linear blend is space-independent because YUV↔RGB is affine, which is why
   * this one is exact where the colour grade is not.
   */
  if (name === 'fade') return { alpha: role === 'to' ? p : 1 };
  return { alpha: 1 };
}
