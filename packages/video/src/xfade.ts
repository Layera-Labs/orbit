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
import type { Transition, TransitionType, VisualTrackClip } from './types';
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

/** One selectable transition: a model type plus how the picker should label it. */
export interface TransitionVariant {
  type: TransitionType;
  /** The direction dot in the picker, or `undefined` for a family of one. */
  dir?: 'left' | 'right' | 'up' | 'down' | 'in' | 'out' | 'h' | 'v' | 'tl' | 'tr' | 'bl' | 'br';
  label: string;
}

export interface TransitionFamily {
  key: string;
  label: string;
  variants: TransitionVariant[];
}

/**
 * The catalogue, and the ONLY list of what this editor offers.
 *
 * Grouped the way VN's Basic tab groups them, because a flat scroll of
 * thirty-five chips is a list rather than a control: you pick the family first
 * and the direction second, and the picker is built from exactly this shape.
 *
 * Every `type` is an ffmpeg `xfade` token, checked against ffmpeg 8.1.2. The
 * families ffmpeg also ships and this list deliberately omits — `dissolve`,
 * `distance`, `fadegrays`, the `*wind` and `*slice` sets — are the ones with no
 * exact canvas-2D and Skia reproduction. Offering a transition the file has and
 * the preview does not is the drift this engine refuses, so they are not here.
 */
export const TRANSITIONS: TransitionFamily[] = [
  { key: 'cut', label: 'Cut', variants: [{ type: 'cut', label: 'Cut' }] },
  { key: 'fade', label: 'Fade', variants: [{ type: 'fade', label: 'Fade' }] },
  { key: 'black', label: 'Black', variants: [{ type: 'fadeblack', label: 'Black' }] },
  { key: 'white', label: 'White', variants: [{ type: 'fadewhite', label: 'White' }] },
  {
    key: 'wipe',
    label: 'Wipe',
    variants: [
      { type: 'wipeleft', dir: 'left', label: 'Wipe left' },
      { type: 'wiperight', dir: 'right', label: 'Wipe right' },
      { type: 'wipeup', dir: 'up', label: 'Wipe up' },
      { type: 'wipedown', dir: 'down', label: 'Wipe down' },
    ],
  },
  {
    key: 'slide',
    label: 'Slide',
    variants: [
      { type: 'slideleft', dir: 'left', label: 'Slide left' },
      { type: 'slideright', dir: 'right', label: 'Slide right' },
      { type: 'slideup', dir: 'up', label: 'Slide up' },
      { type: 'slidedown', dir: 'down', label: 'Slide down' },
    ],
  },
  {
    // ffmpeg calls it `cover`: only the incoming clip moves, over a stationary
    // outgoing one. Every editor calls that a push.
    key: 'push',
    label: 'Push',
    variants: [
      { type: 'coverleft', dir: 'left', label: 'Push left' },
      { type: 'coverright', dir: 'right', label: 'Push right' },
      { type: 'coverup', dir: 'up', label: 'Push up' },
      { type: 'coverdown', dir: 'down', label: 'Push down' },
    ],
  },
  {
    // The mirror image of Push: only the OUTGOING clip moves, sliding off a
    // stationary incoming one.
    key: 'reveal',
    label: 'Reveal',
    variants: [
      { type: 'revealleft', dir: 'left', label: 'Reveal left' },
      { type: 'revealright', dir: 'right', label: 'Reveal right' },
      { type: 'revealup', dir: 'up', label: 'Reveal up' },
      { type: 'revealdown', dir: 'down', label: 'Reveal down' },
    ],
  },
  {
    key: 'circle',
    label: 'Circle',
    variants: [
      { type: 'circleopen', dir: 'out', label: 'Circle open' },
      { type: 'circleclose', dir: 'in', label: 'Circle close' },
    ],
  },
  {
    key: 'blinds',
    label: 'Blinds',
    variants: [
      { type: 'vertopen', dir: 'v', label: 'Blinds open' },
      { type: 'vertclose', dir: 'v', label: 'Blinds close' },
      { type: 'horzopen', dir: 'h', label: 'Bars open' },
      { type: 'horzclose', dir: 'h', label: 'Bars close' },
    ],
  },
  {
    key: 'diagonal',
    label: 'Diagonal',
    variants: [
      { type: 'diagtl', dir: 'tl', label: 'Diagonal ↖' },
      { type: 'diagtr', dir: 'tr', label: 'Diagonal ↗' },
      { type: 'diagbl', dir: 'bl', label: 'Diagonal ↙' },
      { type: 'diagbr', dir: 'br', label: 'Diagonal ↘' },
    ],
  },
  {
    key: 'squeeze',
    label: 'Squeeze',
    variants: [
      { type: 'squeezeh', dir: 'h', label: 'Squeeze across' },
      { type: 'squeezev', dir: 'v', label: 'Squeeze down' },
    ],
  },
  { key: 'zoom', label: 'Zoom', variants: [{ type: 'zoomin', label: 'Zoom' }] },
  { key: 'pixelate', label: 'Pixelate', variants: [{ type: 'pixelize', label: 'Pixelate' }] },
  { key: 'radial', label: 'Radial', variants: [{ type: 'radial', label: 'Radial' }] },
  { key: 'blur', label: 'Blur', variants: [{ type: 'hblur', label: 'Blur' }] },
];

/** Every token the catalogue can produce, for validating stored data. */
const KNOWN = new Set<string>(
  TRANSITIONS.flatMap((f) => f.variants.map((v) => v.type)).filter((t) => t !== 'cut'),
);

/**
 * The four names that predate the catalogue, folded onto what they meant.
 *
 * They were never selectable — the picker has only ever offered Cut and Fade —
 * but the type allowed them and a hand-edited document may carry one. Each maps
 * to the plainest member of its family rather than being rejected, so an old
 * document keeps rendering something recognisable.
 */
const LEGACY: Record<string, TransitionType> = {
  dissolve: 'fade',
  slide: 'slideleft',
  wipe: 'wipeleft',
  zoom: 'zoomin',
};

/**
 * The `transition=` token for a model transition, or `null` for no transition.
 *
 * An unrecognised type falls back to `fade` rather than reaching ffmpeg as an
 * invalid token: `xfade` rejects an unknown `transition=` outright, so a typo in
 * a synced document would abort the whole render instead of costing one
 * boundary its effect.
 */
export function xfadeName(t: Transition | undefined): string | null {
  if (!t || t.type === 'cut' || !(t.duration > 0)) return null;
  const mapped = LEGACY[t.type] ?? t.type;
  return KNOWN.has(mapped) ? mapped : 'fade';
}

/**
 * Whether a transition is pure alpha, and therefore needs no `xfade` filter at
 * all.
 *
 * The one case is `fade`, and it matters more than it looks: with the clips
 * already overlapping, drawing the incoming one over the outgoing one at alpha
 * `p` IS `p*B + (1-p)*A`, which is exactly what `xfade=transition=fade`
 * computes. So a fade stays on the ordinary per-clip overlay path, and every
 * project that predates the geometric families emits the filtergraph it always
 * did — byte for byte. It is also what lets a fade survive on a blended clip,
 * whose export branch cannot live inside an xfade run.
 */
export function isAlphaOnly(name: string): boolean {
  return name === 'fade';
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
 * A stretch of consecutive main-track clips that has to be built as ONE stream.
 *
 * `joins[k]` is the boundary between `clipIdx[k]` and `clipIdx[k + 1]`, so a run
 * always has one more clip than it has joins.
 */
export interface MainRun {
  /** Indices into the main track's clip array, ascending and contiguous. */
  clipIdx: number[];
  joins: TransitionBoundary[];
}

/**
 * Group the main track into xfade runs.
 *
 * A geometric transition has to see both pictures at once, so the clips either
 * side of it cannot be composited one after the other onto the canvas — they go
 * into one `xfade` chain and land as a single layer. A run is the maximal
 * sequence joined that way.
 *
 * **A fade is deliberately never in a run.** It needs no `xfade` filter (see
 * `isAlphaOnly`), so leaving it on the ordinary per-clip path means every
 * project that predates the geometric families emits the graph it always did,
 * a blended clip keeps its transition, and the run machinery is exercised only
 * by the thing that actually needs it.
 *
 * A gap, a cut or a downgrade all end a run simply by not producing a
 * boundary at the next index — the contiguity check is what enforces it, so
 * there is no second list of reasons to keep in step with the resolver.
 */
export function planMainRuns(
  clips: VisualTrackClip[],
  boundaries: TransitionBoundary[],
): MainRun[] {
  const runs: MainRun[] = [];
  let cur: MainRun | null = null;
  for (const b of boundaries) {
    if (isAlphaOnly(b.name)) {
      cur = null;
      continue;
    }
    if (b.index < 1 || b.index >= clips.length) continue;
    if (cur && cur.clipIdx[cur.clipIdx.length - 1] === b.index - 1) {
      cur.clipIdx.push(b.index);
      cur.joins.push(b);
      continue;
    }
    cur = { clipIdx: [b.index - 1, b.index], joins: [b] };
    runs.push(cur);
  }
  return runs;
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
 * The remaining geometric fields (`dx`/`dy`/`scale`/`ramp`) land with the
 * families that need them.
 */
export interface XfState {
  alpha: number;
  /**
   * The region of the CANVAS this side may paint, in the same units as the
   * `W`/`H` it was resolved against. Absent means the whole canvas.
   *
   * Both sides are clipped, not just the incoming one, and that is not
   * belt-and-braces. In the export the run is composited from two
   * transparent-padded full-canvas frames, so on the outgoing side of a wipe
   * the picture is whatever the INCOMING clip covers — and where that clip is
   * a picture-in-picture, or masked, or keyed, what shows through is the
   * background. Leave the outgoing clip unclipped underneath and the preview
   * fills those holes with it instead.
   */
  clip?: { x: number; y: number; w: number; h: number };
}

/**
 * The four wipes, as the two rules they actually are.
 *
 * `forward` says which end the split point travels from: `wiperight` and
 * `wipedown` compute it as `p * L` and put the INCOMING clip on the low side,
 * `wipeleft` and `wipeup` compute it as `(1 - p) * L` and put the outgoing one
 * there. Beyond that they are the same function on a different axis.
 */
const WIPES: Record<string, { axis: 'x' | 'y'; forward: boolean }> = {
  wipeleft: { axis: 'x', forward: false },
  wipeup: { axis: 'y', forward: false },
  wiperight: { axis: 'x', forward: true },
  wipedown: { axis: 'y', forward: true },
};

/**
 * One side of a wipe, as a rectangle.
 *
 * The split rule is MEASURED, not derived: ffmpeg computes `z` as an integer
 * truncation and puts one clip on `<= z`, so the boundary column belongs to the
 * low side and the region below it is `z + 1` wide, not `z`. Reproducing that
 * off the top of one's head gives an edge one pixel out for the whole
 * transition, which looks entirely correct until it is diffed against the file.
 * `xfade-probe.json` is where the rule comes from and what holds it.
 */
function wipeState(
  cfg: { axis: 'x' | 'y'; forward: boolean },
  p: number,
  role: XfRole,
  W: number,
  H: number,
): XfState {
  /*
   * The window is half-open at the top, so at `p = 1` the transition is over
   * and the frame is entirely the incoming clip. Without this the outgoing clip
   * keeps the boundary column for exactly one frame — a one-pixel stripe of the
   * previous shot, at the one instant nobody would think to look.
   */
  if (p >= 1) return role === 'to' ? { alpha: 1 } : { alpha: 0 };
  const L = cfg.axis === 'x' ? W : H;
  const z = Math.floor((cfg.forward ? p : 1 - p) * L);
  const low = cfg.forward ? role === 'to' : role === 'from';
  const cut = Math.max(0, Math.min(L, z + 1));
  const lo = low ? 0 : cut;
  const span = (low ? cut : L) - lo;
  return {
    alpha: 1,
    clip:
      cfg.axis === 'x'
        ? { x: lo, y: 0, w: span, h: H }
        : { x: 0, y: lo, w: W, h: span },
  };
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
  W = 0,
  H = 0,
): (XfState & { role: XfRole; name: string; p: number }) | undefined {
  if (!x) return undefined;
  const live = (b: TransitionBoundary | undefined) =>
    !!b && t >= b.at && t <= b.at + b.overlap;
  const b = live(x.asTo) ? x.asTo! : live(x.asFrom) ? x.asFrom! : undefined;
  if (!b) return undefined;
  const role: XfRole = b === x.asTo ? 'to' : 'from';
  const p = xfadeProgressAt(t, b.at, b.overlap);
  return { ...xfadeStateAt(b.name, p, role, W, H), role, name: b.name, p };
}

/**
 * `W`/`H` are the canvas the geometry is resolved against, and the caller
 * chooses the units: `frameStateAt` passes PROJECT pixels, because that is what
 * a `DrawOp` speaks and what the export's filtergraph is measured in; the Skia
 * preview passes its own on-screen size, so a wipe's edge lands on a real pixel
 * there rather than on a scaled fraction of one. Same rule, resolved twice, at
 * each surface's own resolution.
 */
export function xfadeStateAt(
  name: string,
  p: number,
  role: XfRole,
  W = 0,
  H = 0,
): XfState {
  /*
   * `fade` is a straight lerp between the two pictures, and the incoming clip is
   * drawn OVER the outgoing one — so `p*B + (1-p)*A` falls out of ordinary
   * source-over compositing with B at alpha p and A left alone. Measured: at
   * p=0.5 between pure red and pure blue, ffmpeg reads `127 0 127` in RGB. A
   * linear blend is space-independent because YUV↔RGB is affine, which is why
   * this one is exact where the colour grade is not.
   */
  if (name === 'fade') return { alpha: role === 'to' ? p : 1 };
  const wipe = WIPES[name];
  if (wipe && W > 0 && H > 0) return wipeState(wipe, p, role, W, H);
  /*
   * The families that have not landed yet, plus any wipe asked for without a
   * canvas to resolve against. Alpha 1 on both sides means the previews show
   * the incoming clip for the whole overlap — a cut, not a wipe, while the
   * export really wipes. That is a preview running BEHIND the file, which is
   * the tolerable direction, and it is unreachable from the UI: the picker
   * offers Cut and Fade only.
   */
  return { alpha: 1 };
}
