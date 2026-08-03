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
    /*
     * AUTHORED, not an `xfade` token — the whole frame jitters while the two
     * clips cross-fade. `xfade` has no shake at all, and the editors this app
     * is modelled on all ship one.
     *
     * Two intensities because VN's list pairs them that way throughout (Zoom
     * 1/2, Dissolve 1/2, Rotate 1/2): the numbered sibling is the same idea
     * harder, not a different one.
     */
    key: 'shake',
    label: 'Shake',
    variants: [
      { type: 'shakeleft', dir: 'left', label: 'Shake left' },
      { type: 'shakeright', dir: 'right', label: 'Shake right' },
      { type: 'shakeup', dir: 'up', label: 'Shake up' },
      { type: 'shakedown', dir: 'down', label: 'Shake down' },
    ],
  },
  {
    /*
     * AUTHORED. A sharp flash through a colour, where `fadeblack`/`fadewhite`
     * are a slow asymmetric DIP — different enough to be worth both. The veil
     * is confined to the middle half of the overlap, so the cut lands inside a
     * bloom rather than under a long wash.
     */
    key: 'flash',
    label: 'Flash',
    variants: [
      { type: 'light', label: 'Light' },
      { type: 'blink', label: 'Blink' },
    ],
  },
  {
    key: 'shake2',
    label: 'Shake 2',
    variants: [
      { type: 'shake2left', dir: 'left', label: 'Shake left 2' },
      { type: 'shake2right', dir: 'right', label: 'Shake right 2' },
      { type: 'shake2up', dir: 'up', label: 'Shake up 2' },
      { type: 'shake2down', dir: 'down', label: 'Shake down 2' },
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

/**
 * Whether this transition is performed by the clips themselves rather than by
 * an `xfade` filter joining them.
 *
 * True for `fade` (see `isAlphaOnly`) and for every AUTHORED family, and the
 * consequences run further than the filtergraph. Such a transition **cannot be
 * missing from a build**, because it names no `xfade` token — so it is never
 * subtracted by the server capability gate, never refused by `renderProject`,
 * and works against an ffmpeg that has no `xfade` filter whatsoever. It is also
 * the one kind that survives on a blended clip, whose export branch reads the
 * canvas underneath it and therefore cannot live inside a run.
 */
export function ridesOverlayPath(name: string): boolean {
  return isAlphaOnly(name) || isAuthoredTransition(name);
}

/**
 * Whether this transition is ours rather than ffmpeg's.
 *
 * Distinct from `ridesOverlayPath`, and the difference is not pedantry: `fade`
 * rides the overlay path too, but it IS an `xfade` token and
 * `xfade-probe.test.ts` measures it as one. Only an authored family has nothing
 * for that file to point ffmpeg at.
 */
export function isAuthoredTransition(name: string): boolean {
  return !!SHAKES[name] || !!FLASHES[name];
}

/**
 * Whether BOTH previews render this transition, and therefore whether a picker
 * may offer it.
 *
 * It reads the same tables the renderers read, so a family becomes selectable
 * at the moment it lands in `xfadeStateAt` and not a commit before. The
 * alternative — a hand-kept list of "the ones that work" — is how a picker ends
 * up promising a wipe while the preview shows a cut, which is the exact drift
 * this engine is built to refuse. `cut` is always offered: it is the absence of
 * a transition, and nothing has to render it.
 */
export function xfadeHasPreview(type: TransitionType): boolean {
  if (type === 'cut') return true;
  const name = xfadeName({ type, duration: 1 });
  return !!name && (isAlphaOnly(name) || PREVIEWED.has(name));
}

/**
 * The transition tokens an `ffmpeg -hide_banner -h filter=xfade` listing says
 * this build accepts.
 *
 * Needed because **a token is not a property of ffmpeg, it is a property of the
 * build in front of you**. `cover*` and `reveal*` — this editor's Push and
 * Reveal — did not exist before ffmpeg 6.1, and the render service's image
 * installs Debian bookworm's 5.1. Naming one there does not render something
 * slightly wrong; the filtergraph fails to BUILD and takes the whole render with
 * it, several minutes after the user pressed Export.
 *
 * Parses the enum CONSTANTS out of the option dump, which is why the integer
 * column is what the pattern keys on:
 *
 *     transition        <int>        ..FV....... set cross fade transition
 *       fade            0            ..FV....... fade transition
 *       wipeleft        1            ..FV....... wipe left transition
 *
 * A real option carries `<int>`/`<duration>`/`<string>` in that column and a
 * constant carries a bare number, so `transition` itself and the `duration`,
 * `offset` and `expr` options fall out without needing to be named — which
 * matters, because a future ffmpeg may add options here but will keep listing
 * its constants this way.
 */
export function parseXfadeTokens(help: string): string[] {
  const out = new Set<string>();
  for (const line of help.split('\n')) {
    const m = /^\s+([A-Za-z][\w]*)\s+-?\d+\s/.exec(line);
    // `custom` is an escape hatch taking a per-pixel expression, not a
    // transition anyone can pick, and counting it would make an ffmpeg that has
    // it look like it has the family it cannot do.
    if (m && m[1] !== 'custom') out.add(m[1]);
  }
  return [...out];
}

/**
 * The catalogue, filtered to what a picker may show, with empty families
 * dropped.
 *
 * `supported` is the render server's answer from `parseXfadeTokens`. Pass it and
 * a family whose token that ffmpeg cannot parse disappears from the picker;
 * pass `undefined` and nothing is subtracted.
 *
 * **Unknown means offer it, which is the opposite of the HDR gate, and
 * deliberately.** HDR is hidden when unprobed because offering it produces a
 * file whose tags lie — the cost of hiding is one checkbox. Here the editor has
 * to work with no server at all: a phone on a plane still lays out a project,
 * and a rule that hid every transition whenever `/health` was unreachable would
 * do far more damage than the case it prevents. So the client subtracts only
 * what it has been TOLD is missing, and `renderProject` refuses by name if a
 * project reaches an ffmpeg that cannot do it anyway. Two lines of defence, and
 * neither one silently changes what the file contains.
 */
export function previewableTransitions(
  supported?: readonly string[] | null,
): TransitionFamily[] {
  const ok = supported && supported.length ? new Set(supported) : null;
  return TRANSITIONS.map((f) => ({
    ...f,
    variants: f.variants.filter((v) => {
      if (!xfadeHasPreview(v.type)) return false;
      if (!ok) return true;
      const name = xfadeName({ type: v.type, duration: 1 });
      // A cut names no filter, and a fade is drawn by the compositor rather
      // than by `xfade` (see `isAlphaOnly`) — neither can be missing from a
      // build, so neither is ever subtracted.
      return !name || ridesOverlayPath(name) || ok.has(name);
    }),
  })).filter((f) => f.variants.length > 0);
}

/**
 * The `xfade` tokens a project needs that this ffmpeg does not have.
 *
 * Distinct in shape from the picker filter above: that one asks "may this be
 * offered", this one asks "can this project be rendered", and the answer has to
 * come from the resolved boundaries rather than the catalogue — a project can
 * carry a transition no current picker offers, because it was authored against
 * a different build or synced from another device.
 */
export function unsupportedTransitions(
  boundaries: readonly TransitionBoundary[],
  supported: readonly string[],
): string[] {
  if (!supported.length) return [];
  const ok = new Set(supported);
  const missing = new Set<string>();
  for (const b of boundaries) {
    if (b.name && !ridesOverlayPath(b.name) && !ok.has(b.name)) missing.add(b.name);
  }
  return [...missing];
}

/** What to tell someone whose ffmpeg is too old for the transitions they used. */
export function transitionUnsupportedMessage(missing: readonly string[]): string {
  return (
    `This server's ffmpeg cannot do ${missing.join(', ')}. ` +
    `Push and Reveal need ffmpeg 6.1 or newer; this build is older. ` +
    `Change those transitions, or run the render service on a newer ffmpeg.`
  );
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
    if (ridesOverlayPath(b.name)) {
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
  /**
   * Translation applied to this side's picture, in the same units as `clip`.
   *
   * A whole-CANVAS translation, not a nudge to the clip's box: the export
   * slides the transparent-padded full-canvas frame, so a picture-in-picture
   * travels the same distance as a full-frame clip and leaves background
   * behind it either way.
   */
  dx?: number;
  dy?: number;
  /**
   * Scale about the CENTRE of the canvas, `1` meaning none.
   *
   * A whole-canvas scale for the same reason `dx`/`dy` are a whole-canvas
   * translation: the export scales the transparent-padded full-canvas frame, so
   * a picture-in-picture shrinks toward the canvas centre rather than its own.
   */
  scale?: { x: number; y: number };
  /**
   * A per-pixel alpha mask over this side's picture, sampled with
   * `xfadeMaskAt`.
   *
   * Eleven of ffmpeg's families are one shape — the incoming clip drawn over
   * the outgoing one through a `smoothstep` of some scalar field — so this is a
   * described field rather than a family name, and the renderers stay
   * executors. A new family that fits the shape costs a table entry here and
   * nothing at all in the two compositors.
   */
  mask?: XfMask;
  /**
   * Paint everywhere EXCEPT this rect, in the units of `clip`.
   *
   * The squeeze families put the outgoing clip on TOP of the incoming one,
   * which the compositors cannot do — they always draw the incoming clip over
   * the outgoing. Punching the band out of the incoming side is the same
   * picture with the layers in the order everything else uses, and both
   * renderers already have the primitive from the canvas mat (`evenodd` in SVG,
   * `<DiffRect>` in Skia).
   */
  hole?: { x: number; y: number; w: number; h: number };
  /** Quantize this side to blocks this many canvas units across. */
  block?: number;
  /**
   * Box-blur this side horizontally, this many canvas units wide.
   *
   * The width of ffmpeg's box, not a gaussian sigma — see `hblurState` for why
   * that distinction is the whole difficulty of this one family.
   */
  blurX?: number;
}

/** The scalar field a mask family's `smoothstep` is taken over. */
export type XfMaskField =
  /** Distance from the canvas centre, over the half-diagonal. */
  | 'radius'
  /** Distance from the vertical centre line, over the half-width. */
  | 'absx'
  /** Distance from the horizontal centre line, over the half-height. */
  | 'absy'
  /** `x/W * y/H`, with either factor optionally mirrored — picks a corner. */
  | 'prod'
  /** `atan2(x - W/2, y - H/2)`, in radians. Note the argument order. */
  | 'angle';

/**
 * A per-pixel alpha for the incoming clip: `smoothstep(0, 1, sign*field + bias)`,
 * optionally inverted.
 *
 * Every constant here is lifted from `libavfilter/vf_xfade.c` rather than
 * matched by eye against probe output, and two details in it are the reason
 * that mattered. **ffmpeg's `mix(a, b, t)` is `a*t + b*(1-t)`, the REVERSE of
 * GLSL's**, and **its internal `progress` runs 1 → 0** — so a formula ported
 * from habit comes out inverted while still looking like a transition, which is
 * the hardest kind of wrong to notice.
 */
export interface XfMask {
  field: XfMaskField;
  sign: 1 | -1;
  bias: number;
  /** `prod` only: mirror the x and/or y factor. Together they pick the corner. */
  flipX?: boolean;
  flipY?: boolean;
  /** Take `1 - alpha`, which is `circleopen` against `circleclose`. */
  invert?: boolean;
}

/** A full-canvas solid drawn BETWEEN the two clips. See `xfadeVeilAt`. */
export interface XfVeil {
  color: string;
  alpha: number;
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
 * The sliding families: which axis, which way, and which clip actually moves.
 *
 * Twelve variants, three behaviours, one function. `slide` moves both pictures;
 * `cover` (which ffmpeg spells that way and every editor calls a push) moves
 * only the incoming one over a stationary outgoing one; `reveal` is its mirror,
 * moving only the outgoing one off a stationary incoming one. `neg` is the
 * direction of travel: left and up move toward the origin.
 */
const SLIDES: Record<
  string,
  { axis: 'x' | 'y'; neg: boolean; from: boolean; to: boolean }
> = {
  slideleft: { axis: 'x', neg: true, from: true, to: true },
  slideright: { axis: 'x', neg: false, from: true, to: true },
  slideup: { axis: 'y', neg: true, from: true, to: true },
  slidedown: { axis: 'y', neg: false, from: true, to: true },
  coverleft: { axis: 'x', neg: true, from: false, to: true },
  coverright: { axis: 'x', neg: false, from: false, to: true },
  coverup: { axis: 'y', neg: true, from: false, to: true },
  coverdown: { axis: 'y', neg: false, from: false, to: true },
  revealleft: { axis: 'x', neg: true, from: true, to: false },
  revealright: { axis: 'x', neg: false, from: true, to: false },
  revealup: { axis: 'y', neg: true, from: true, to: false },
  revealdown: { axis: 'y', neg: false, from: true, to: false },
};

/**
 * One side of a slide, push or reveal.
 *
 * **The split sits one pixel from where a wipe's does**, and that is measured,
 * not a rounding preference: a wipe keeps the outgoing clip on `<= z` and this
 * family keeps it on `< z`. Two rules that differ by one column, in filters
 * that otherwise travel the same distance at the same rate — precisely the kind
 * of thing the probe exists to settle.
 *
 * Both sides carry a region as well as a travel, even where the travel alone
 * would seem to do it. In the export the run is composited from two padded
 * full-canvas frames and every pixel takes one side or the other outright; if
 * the incoming clip is a picture-in-picture, the pixels around it inside its
 * own region are BACKGROUND, not the outgoing clip that happens to still be
 * under them.
 */
function slideState(
  cfg: { axis: 'x' | 'y'; neg: boolean; from: boolean; to: boolean },
  p: number,
  role: XfRole,
  W: number,
  H: number,
): XfState {
  if (p >= 1) return role === 'to' ? { alpha: 1 } : { alpha: 0 };
  const L = cfg.axis === 'x' ? W : H;
  /** How much of the canvas the outgoing clip still holds. */
  const z = Math.floor((1 - p) * L);
  /** How far the travel has got. */
  const s = L - z;
  const isFrom = role === 'from';
  const lo = cfg.neg ? (isFrom ? 0 : z) : isFrom ? s : 0;
  const hi = cfg.neg ? (isFrom ? z : L) : isFrom ? L : s;
  const moves = isFrom ? cfg.from : cfg.to;
  const d = !moves ? 0 : cfg.neg ? (isFrom ? -s : z) : isFrom ? s : -z;
  return {
    alpha: 1,
    clip:
      cfg.axis === 'x'
        ? { x: lo, y: 0, w: hi - lo, h: H }
        : { x: 0, y: lo, w: W, h: hi - lo },
    ...(cfg.axis === 'x' ? { dx: d } : { dy: d }),
  };
}

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
/**
 * The shake families: amplitude as a fraction of the short edge, and how many
 * times the frame swings across the transition.
 *
 * `sign` is the direction the FIRST swing goes, which is the only thing that
 * separates `shakeleft` from `shakeright` — an oscillation is symmetric, so a
 * direction can only mean which way it starts.
 */
const SHAKES: Record<
  string,
  { axis: 'x' | 'y'; sign: 1 | -1; amp: number; freq: number }
> = {
  shakeleft: { axis: 'x', sign: -1, amp: 0.03, freq: 3 },
  shakeright: { axis: 'x', sign: 1, amp: 0.03, freq: 3 },
  shakeup: { axis: 'y', sign: -1, amp: 0.03, freq: 3 },
  shakedown: { axis: 'y', sign: 1, amp: 0.03, freq: 3 },
  shake2left: { axis: 'x', sign: -1, amp: 0.06, freq: 5 },
  shake2right: { axis: 'x', sign: 1, amp: 0.06, freq: 5 },
  shake2up: { axis: 'y', sign: -1, amp: 0.06, freq: 5 },
  shake2down: { axis: 'y', sign: 1, amp: 0.06, freq: 5 },
};

/**
 * The flash families: which colour the frame blooms through.
 *
 * `blink` is black — an eye-blink — and `light` is white. They differ in
 * nothing else, because what separates a flash from `fadeblack` is the CURVE,
 * and both share it.
 */
const FLASHES: Record<string, string> = {
  blink: '#000000',
  light: '#ffffff',
};

/** The colour a flash blooms through, or `null` when this is not a flash. */
export function flashColor(name: string): string | null {
  return FLASHES[name] ?? null;
}

/** Where the veil starts and stops, as a fraction of the overlap. */
const FLASH_EDGE = 0.25;

/**
 * The veil's alpha through a flash: a triangle over the middle half.
 *
 * Linear, and deliberately so. The export draws this as a pair of chained
 * `fade` filters on a colour source, and ffmpeg's `fade` ramps LINEARLY — a
 * prettier eased curve here would be a curve only the previews had, which is
 * the drift this engine refuses. Zero at `p <= 0.25` and `p >= 0.75`, so the
 * frame is untouched at both ends of the overlap.
 */
export function flashAlphaAt(p: number): number {
  const a = 1 - Math.abs(p - 0.5) / FLASH_EDGE;
  return Math.min(1, Math.max(0, a));
}

/**
 * The two `fade` filters that draw the same triangle in the export, as
 * `[start, duration]` pairs in seconds — in, then out.
 */
export function flashFadeWindows(
  at: number,
  overlap: number,
): { inAt: number; outAt: number; ramp: number } {
  const ramp = overlap * FLASH_EDGE;
  return { inAt: at + ramp, outAt: at + overlap / 2, ramp };
}

/**
 * How far the frame is displaced, at progress `p`.
 *
 * `sin(PI*p)` is the ENVELOPE and it is the load-bearing half: it is zero at
 * both ends, so the frame is exactly where it belongs on the first and last
 * frame of the transition. An oscillation without it would start and stop
 * mid-swing and read as the picture jumping, which is a different and much
 * worse effect than a shake.
 *
 * Written twice, as `element-anim.ts` writes its ramps — once here for the
 * previews and once as an ffmpeg expression in `shakeExpr` — with a test
 * asserting the two agree numerically rather than by inspection.
 */
export function shakeOffsetAt(
  name: string,
  p: number,
  W: number,
  H: number,
): { dx: number; dy: number } {
  const s = SHAKES[name];
  if (!s) return { dx: 0, dy: 0 };
  const d =
    s.sign *
      s.amp *
      Math.min(W, H) *
      Math.sin(Math.PI * p) *
      Math.sin(2 * Math.PI * s.freq * p);
  /*
   * Snap trig noise to a true zero, the way `rotatedBoxPx` does for the same
   * reason. `Math.sin(Math.PI)` is 1.22e-16, not 0, so the envelope never quite
   * closes and the displacement at `p = 1` comes out around 1e-30 with a
   * NEGATIVE sign on the leftward variants. Neither is visible; both are
   * corrosive. A negative zero survives JSON and `Object.is(-0, 0)` is false,
   * so two identical frames compare unequal — and "the frame is exactly where
   * it belongs on the last frame of the transition" stops being something that
   * can be asserted at all.
   */
  const snapped = Math.abs(d) < 1e-6 ? 0 : d;
  return s.axis === 'x' ? { dx: snapped, dy: 0 } : { dx: 0, dy: snapped };
}

/**
 * The same displacement as an ffmpeg `overlay=x:y` expression, or `'0'` when
 * this axis does not move.
 *
 * `'0'` rather than an expression that evaluates to zero, because
 * `emitClipLayer` tests for exactly that literal to decide whether to compose a
 * term at all — which is what keeps the filtergraph byte-identical for every
 * clip that has no shake.
 *
 * `at` is in the SAME frame of reference as the `t` the expression will be
 * evaluated in. On the ordinary overlay path that is timeline seconds; the
 * caller is what knows which, so it is not assumed here.
 */
export function shakeExpr(
  name: string,
  at: number,
  overlap: number,
  W: number,
  H: number,
  axis: 'x' | 'y',
): string {
  const s = SHAKES[name];
  if (!s || s.axis !== axis || !(overlap > 0)) return '0';
  const a = r3(s.sign * s.amp * Math.min(W, H));
  const prog = `clip((t-${r3(at)})/${r3(overlap)},0,1)`;
  return `${a}*sin(PI*${prog})*sin(${r3(2 * s.freq)}*PI*${prog})`;
}

/** ffmpeg's own `smoothstep`, cubic and clamped (`vf_xfade.c:290`). */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * The mask families, as `p ↦ XfMask`.
 *
 * `P` is ffmpeg's internal progress and runs the other way — `1 - p` — which is
 * why every bias below is written in terms of it rather than being pre-flipped.
 * Keeping the source's own variable makes each line diffable against the C, and
 * that is worth more here than an expression one step shorter.
 */
const MASKS: Record<string, (p: number) => XfMask> = {
  // `mix(A, B, ss)` — A where the field is large, so the incoming clip arrives
  // in the CENTRE and grows. The 3x ramp means it is over by p ≈ 0.83 and has
  // not begun before p ≈ 0.17.
  circleopen: (p) => ({ field: 'radius', sign: 1, bias: (1 - p - 0.5) * 3, invert: true }),
  circleclose: (p) => ({ field: 'radius', sign: 1, bias: (p - 0.5) * 3 }),
  vertopen: (p) => ({ field: 'absx', sign: -1, bias: 2 - (1 - p) * 2 }),
  vertclose: (p) => ({ field: 'absx', sign: 1, bias: 1 - (1 - p) * 2 }),
  horzopen: (p) => ({ field: 'absy', sign: -1, bias: 2 - (1 - p) * 2 }),
  horzclose: (p) => ({ field: 'absy', sign: 1, bias: 1 - (1 - p) * 2 }),
  diagtl: (p) => ({ field: 'prod', sign: 1, bias: 1 - (1 - p) * 2 }),
  diagtr: (p) => ({ field: 'prod', sign: 1, bias: 1 - (1 - p) * 2, flipX: true }),
  diagbl: (p) => ({ field: 'prod', sign: 1, bias: 1 - (1 - p) * 2, flipY: true }),
  diagbr: (p) => ({
    field: 'prod',
    sign: 1,
    bias: 1 - (1 - p) * 2,
    flipX: true,
    flipY: true,
  }),
  radial: (p) => ({ field: 'angle', sign: 1, bias: -(1 - p - 0.5) * Math.PI * 2.5 }),
};

/**
 * The incoming clip's alpha at one canvas pixel, in `[0, 1]`.
 *
 * Callable at fractional coordinates so a renderer can sample a small grid and
 * scale it up — every one of these fields ramps over a whole unit of its
 * normalized coordinate, so they are all low-frequency and a coarse grid costs
 * almost nothing. The exception is `angle`, which is singular at the exact
 * centre; that is a handful of pixels and a recorded tolerance.
 *
 * The integer divisions are ffmpeg's and are reproduced rather than tidied:
 * `radius` and `angle` take `width / 2` on an `int` (so a half-pixel offset on
 * an odd dimension) while `absx`/`absy` take `width / 2.0` on a float. The
 * difference is sub-pixel and invisible, but the fixture compares numbers.
 */
export function xfadeMaskAt(m: XfMask, x: number, y: number, W: number, H: number): number {
  let f: number;
  switch (m.field) {
    case 'radius': {
      const cx = Math.floor(W / 2);
      const cy = Math.floor(H / 2);
      const z = Math.hypot(cx, cy);
      f = z > 0 ? Math.hypot(x - cx, y - cy) / z : 0;
      break;
    }
    case 'absx': {
      const w2 = W / 2;
      f = w2 > 0 ? Math.abs((x - w2) / w2) : 0;
      break;
    }
    case 'absy': {
      const h2 = H / 2;
      f = h2 > 0 ? Math.abs((y - h2) / h2) : 0;
      break;
    }
    case 'prod': {
      const fx = m.flipX ? (W - 1 - x) / W : x / W;
      const fy = m.flipY ? (H - 1 - y) / H : y / H;
      f = fx * fy;
      break;
    }
    case 'angle':
      // atan2(dx, dy), NOT the usual atan2(dy, dx) — ffmpeg passes them in this
      // order, which rotates where the sweep starts by a quarter turn.
      f = Math.atan2(x - Math.floor(W / 2), y - Math.floor(H / 2));
      break;
  }
  const a = smoothstep(0, 1, m.sign * f + m.bias);
  return m.invert ? 1 - a : a;
}

/**
 * The solid drawn between the two clips, for the families that dip through a
 * colour.
 *
 * `fadeblack` is a NESTED mix, not a sum — the earlier note here recorded a
 * two-term sum guessed from probe output and it was simply wrong:
 *
 *     mix(mix(A, bg, ss(1-phase, 1, P)), mix(bg, B, ss(phase, 1, P)), P)
 *
 * with `phase = 0.2`. Expanded, the three weights are `A = P*s1`,
 * `B = p*(1-s2)` and whatever is left for the background, and they sum to 1.
 * Note how asymmetric that is: at `p = 0.5` it is already 34% B against 66%
 * black, nowhere near the halfway point it looks like it should be.
 *
 * A compositor draws in layers rather than weighting three sources at once, so
 * the veil's own alpha is solved backwards from the weights: after A at 1 and
 * the veil at `t1`, the surface holds `(1-t1)*A + t1*bg`, and B at `t2` on top
 * leaves A at `(1-t2)(1-t1)`. Setting that equal to `P*s1` gives `t1`.
 */
export function xfadeVeilAt(name: string, p: number): XfVeil | null {
  const flash = FLASHES[name];
  if (flash) return { color: flash, alpha: flashAlphaAt(p) };
  const color = name === 'fadeblack' ? '#000000' : name === 'fadewhite' ? '#ffffff' : null;
  if (!color) return null;
  const P = 1 - p;
  const wA = P * smoothstep(0.8, 1, P);
  const wB = p * (1 - smoothstep(0.2, 1, P));
  // `wB >= 1` is exactly `p = 1`, where A carries no weight at all and any veil
  // would be painting under an opaque incoming clip.
  const alpha = wB >= 1 ? 0 : Math.min(1, Math.max(0, 1 - wA / (1 - wB)));
  return { color, alpha };
}

/** `squeezeh` squeezes vertically, `squeezev` horizontally — ffmpeg's naming. */
const SQUEEZES: Record<string, 'x' | 'y'> = { squeezeh: 'y', squeezev: 'x' };

/**
 * `zoomin`: the outgoing clip magnifies about the centre while the incoming one
 * fades up over the SECOND half only.
 *
 * ffmpeg samples A at `0.5 + (u - 0.5) * zf`, so contracting the sampling
 * coordinate magnifies the picture by `1/zf` — and `zf` reaches 0 at `p = 0.5`,
 * which is a magnification of infinity. `MAX_ZOOM` is where that is truncated:
 * past it every pixel on the canvas is already the same one pixel of A, so a
 * larger number cannot change what is drawn and a smaller one visibly can.
 */
const MAX_ZOOM = 4096;

/**
 * The squeeze families: the outgoing clip is compressed to a band across the
 * canvas centre, and the incoming one fills what is left.
 *
 * ffmpeg draws A on TOP of B here, which is the one place its layering
 * disagrees with the compositors'. Rather than teach both of them to reorder,
 * the band is punched out of B — the same picture, drawn the way everything
 * else in this engine is drawn.
 *
 * ffmpeg resamples with `lrintf`, nearest-neighbour, where both previews
 * interpolate, so this family carries a recorded tolerance rather than being
 * exact. It is the same trade the grade makes and for the same reason: matching
 * a nearest-neighbour resample would mean giving up filtering everywhere else.
 */
function squeezeState(
  axis: 'x' | 'y',
  p: number,
  role: XfRole,
  W: number,
  H: number,
): XfState {
  const P = 1 - p;
  if (role === 'from') {
    return { alpha: 1, scale: axis === 'y' ? { x: 1, y: P } : { x: P, y: 1 } };
  }
  const hole =
    axis === 'y'
      ? { x: 0, y: ((1 - P) / 2) * H, w: W, h: P * H }
      : { x: ((1 - P) / 2) * W, y: 0, w: P * W, h: H };
  return { alpha: 1, hole };
}

/**
 * The families BOTH previews draw, and therefore the ones a picker may offer.
 *
 * A single set rather than a condition per family, because it is the list that
 * has to advance in step with two compositors: the maths for every family below
 * lives in this file already and the export renders all of them, so what gates
 * a name here is whether the canvas-2D AND the Skia preview have landed it. Add
 * a name the moment the second one does, never before — a picker offering
 * something one preview shows as a cut is exactly the drift this engine exists
 * to refuse, and the drift is invisible until someone exports.
 */
const PREVIEWED = new Set<string>([
  ...Object.keys(WIPES),
  ...Object.keys(SLIDES),
  ...Object.keys(MASKS),
  ...Object.keys(SQUEEZES),
  ...Object.keys(SHAKES),
  /*
   * NOT the flashes yet. Both render, in the export and in both previews, and
   * the shape is right — but measured against ffmpeg the veil peaks about one
   * frame later than `flashAlphaAt` says, a **16/255** disagreement at the top
   * of the ramp that is almost certainly ffmpeg's `fade` discretising its own
   * ramp per frame. Almost certainly is not measured, and an unexplained
   * difference between the file and the picture is the one thing this engine
   * does not ship. They stay out of the pickers until the frame is accounted
   * for. See `flashFadeWindows`.
   */

  'fadeblack',
  'fadewhite',
  'zoomin',
  /*
   * `pixelize` and `hblur` are deliberately absent, and this is the honest half
   * of the rule rather than a TODO. Both render in the export and both are
   * drawn by the canvas-2D preview; neither is drawn by Skia yet, so offering
   * them would put a family in the picker that one of the two previews shows as
   * a plain cut. `hblur` is the harder of the two by a distance: ffmpeg's is a
   * FORWARD box filter, so it displaces the picture by half the box as well as
   * softening it, and a centred gaussian of the same width sits visibly in the
   * wrong place beside the file.
   */
]);

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
  if (FLASHES[name]) return { alpha: role === 'to' ? p : 1 };
  if (SHAKES[name]) {
    /*
     * BOTH sides carry the same displacement, because it is the frame that
     * shakes and not one picture inside it — offsetting only the incoming clip
     * would read as that clip sliding around on top of a steady one.
     */
    const { dx, dy } = shakeOffsetAt(name, p, W, H);
    return { alpha: role === 'to' ? p : 1, ...(dx ? { dx } : {}), ...(dy ? { dy } : {}) };
  }
  /*
   * The dip families. The outgoing clip is left alone and the incoming one
   * carries the weight solved in `xfadeVeilAt`; the solid between them is a
   * third op, emitted by `frame.ts`, because it belongs to neither side.
   */
  if (name === 'fadeblack' || name === 'fadewhite') {
    if (role === 'from') return { alpha: 1 };
    const P = 1 - p;
    return { alpha: p * (1 - smoothstep(0.2, 1, P)) };
  }
  if (W > 0 && H > 0) {
    const wipe = WIPES[name];
    if (wipe) return wipeState(wipe, p, role, W, H);
    const slide = SLIDES[name];
    if (slide) return slideState(slide, p, role, W, H);
    const mask = MASKS[name];
    if (mask) {
      /*
       * Only the INCOMING side is masked. ffmpeg blends the two padded
       * full-canvas frames, so where the incoming clip does not cover the
       * canvas — a picture-in-picture, a keyed or masked clip — it blends the
       * outgoing one toward transparency, and drawing over the top the way a
       * compositor does leaves it alone instead. That divergence is confined to
       * a main-track clip with its own `rect`, which the geometric families
       * already refuse for the same underlying reason, and the alternative is
       * compositing both sides additively into a shared scratch. Exact for a
       * full-frame clip, which is what the main track carries.
       */
      if (role === 'from') return { alpha: 1 };
      return { alpha: 1, mask: mask(p) };
    }
    const axis = SQUEEZES[name];
    if (axis) return squeezeState(axis, p, role, W, H);
    if (name === 'zoomin') {
      const P = 1 - p;
      if (role === 'to') return { alpha: 1 - smoothstep(0, 0.5, P) };
      const zf = smoothstep(0.5, 1, P);
      const s = zf > 1 / MAX_ZOOM ? 1 / zf : MAX_ZOOM;
      return { alpha: 1, scale: { x: s, y: s } };
    }
    if (name === 'pixelize') {
      // `dist` is quantized to fiftieths by ffmpeg, so the block size STEPS
      // rather than sliding. Reproducing the quantization matters more than it
      // looks: the steps are visible, and a smooth ramp reads as a different
      // effect even where the average error is small.
      const dist = Math.ceil(Math.min(p, 1 - p) * 50) / 50;
      const block = (2 * dist * Math.min(W, H)) / 20;
      return { alpha: role === 'to' ? p : 1, ...(block > 0 ? { block } : {}) };
    }
    if (name === 'hblur') {
      const blurX = 1 + (W / 2) * (Math.min(p, 1 - p) * 2);
      return { alpha: role === 'to' ? p : 1, blurX };
    }
  }
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
