/**
 * `frameStateAt` — the frame at time `t` as a flat, declarative draw list.
 *
 * This is the anti-drift seam. `buildMultiTrackArgs` describes a frame to
 * ffmpeg; this describes the SAME frame to a canvas renderer, from the same
 * project and the same helpers. The renderer executes the list and computes
 * nothing itself, so a preview can only disagree with the export if this file
 * disagrees with `ffmpeg.ts` — which `__tests__/dual-render.test.ts` checks by
 * parsing the real filtergraph and comparing numbers.
 *
 * Everything here is pure and browser-safe.
 */
import {
  FULL_FRAME,
  type Background,
  type BlendMode,
  type ChromaKey,
  type ClipMagnifier,
  type ClipMask,
  type ClipMosaic,
  type SourceRect,
  type VideoProject,
  type VisualTrack,
  type VisualTrackClip,
} from './types';
import { resolveFilter, type FilterParams } from './filters';
import { hasMotion, motionStateAt } from './motion';
import {
  animatesOpacity,
  animatesPosition,
  hasKeyframes,
  sampleKeyframes,
} from './keyframes';
import { clipRectPx, progressAt, r3, srcTimeAt } from './layout';
import { isFullSource, normalizeRotation } from './transform';
import { fadeFactorAt, projectFadeMap } from './transitions';
import { elementFadeAt, resolveAnim, slideOffsetAt } from './element-anim';
import { blendToFFmpeg } from './blend';
import { backgroundToSVG } from './background-svg';
import { canvasFrameToSVG, hasCanvasFrame } from './canvas-frame';
import { overlayToSVG } from './overlay-svg';

/** How a source fills its destination box. Mirrors the export's scale/crop. */
export type Fit = 'cover' | 'stretch';

export interface DrawOp {
  kind: 'background' | 'clip' | 'overlay' | 'frame';
  /** Clip / overlay id. The background op is always `'background'`. */
  id: string;
  /** Media source, for ops backed by a file (`background` image, `clip`). */
  src?: string;
  /** SVG markup, for ops drawn from vector (colour/gradient background, text). */
  svg?: string;
  /** Seconds into the source media. Undefined for images and vector ops. */
  srcTime?: number;
  /** Destination box in PROJECT pixels, already rounded as the export rounds. */
  dst: { x: number; y: number; w: number; h: number };
  fit: Fit;
  /** Opacity × keyframes × transition fade, already multiplied together. */
  alpha: number;
  blend: BlendMode;
  filter: FilterParams;
  /** Gaussian sigma in project pixels, matching `gblur=sigma=`. */
  blurSigma: number;
  /** Centred zoom + pan as a fraction of the box, or undefined when static. */
  motion?: { scale: number; tx: number; ty: number };
  mask?: ClipMask;
  cutout?: ChromaKey;
  mosaic?: ClipMosaic;
  magnifier?: ClipMagnifier;
  /**
   * CLOCKWISE rotation in degrees about the centre of `dst`. Absent = none.
   *
   * `dst` stays the UNROTATED box — the grown, axis-aligned box a rotated clip
   * occupies is derivable from `rotatedBoxPx(dst, rotation)`, so it is not
   * duplicated into the op where the two could drift.
   */
  rotation?: number;
  /**
   * Which part of the source to draw, normalized to the media's own size.
   * Resolved against the decoded natural size by `sourceCropPx`.
   */
  srcRect?: SourceRect;
}

/**
 * Visual clips in composite order (bottom → top).
 *
 * Deliberately the tracks' ARRAY order flat-mapped, not sorted by `start` —
 * `buildMultiTrackArgs` composites in exactly this order, and sorting here
 * would silently reorder z against the export.
 */
function visualClipsOf(p: VideoProject): VisualTrackClip[] {
  const tracks = p.tracks;
  if (tracks && tracks.length)
    return tracks
      .filter((t): t is VisualTrack => t.kind === 'visual')
      .flatMap((t) => t.clips);
  // Legacy single-track project: lay the clips end to end, which is what the
  // concat path does. Crossfade overlap is not modelled; the editors always
  // write `tracks`, so this only covers reading an old file.
  let acc = 0;
  return (p.clips ?? []).map((c) => {
    const start = acc;
    acc += c.duration;
    return { ...c, start } as VisualTrackClip;
  });
}

function backgroundOp(bg: Background | undefined, W: number, H: number): DrawOp {
  const base: DrawOp = {
    kind: 'background',
    id: 'background',
    dst: { x: 0, y: 0, w: W, h: H },
    // Colour and gradient backgrounds are rasterized at exactly W×H, so
    // stretching is the identity. A photo is an arbitrary size and gets covered.
    fit: bg?.type === 'image' ? 'cover' : 'stretch',
    alpha: 1,
    blend: 'normal',
    filter: resolveFilter(undefined),
    blurSigma: 0,
  };
  if (bg?.type === 'image') return { ...base, src: bg.src };
  return { ...base, svg: backgroundToSVG(bg ?? { type: 'color', color: '#000000' }, W, H) };
}

/**
 * The frame at timeline time `t`, bottom → top.
 *
 * Ops are emitted only while their window is live, matching the export's
 * `enable='between(t,S,E)'` gate.
 */
export function frameStateAt(p: VideoProject, t: number): DrawOp[] {
  const { width: W, height: H } = p;
  const ops: DrawOp[] = [backgroundOp(p.background, W, H)];
  const fades = projectFadeMap(p);

  for (const c of visualClipsOf(p)) {
    const S = c.start;
    const E = c.start + c.duration;
    if (t < S || t > E) continue;

    const box = clipRectPx(c.rect ?? FULL_FRAME, W, H);
    const kfs = c.keyframes;
    const kfOpacity = hasKeyframes(kfs) && animatesOpacity(kfs!);
    /*
     * A blended clip cannot MOVE in the export: the blend branch crops the base
     * region under its box and `crop` cannot vary its size per frame, so the
     * composite origin is fixed. Both previews therefore hold it still too.
     *
     * This closes a real gap rather than opening one — keyframed position was
     * already dropped by the export while `frameStateAt` went on moving the
     * clip, which is a preview that looks better than the file.
     */
    const blended = !!blendToFFmpeg(c.blend);
    const kfPosition = hasKeyframes(kfs) && animatesPosition(kfs!) && !blended;
    const p01 = progressAt(S, c.duration, t);

    let alpha = kfOpacity
      ? sampleKeyframes(kfs!, p01).opacity
      : c.opacity != null && c.opacity < 0.999
        ? Math.max(0, c.opacity)
        : 1;
    alpha *= fadeFactorAt(fades.get(c.id), S, E, t);
    /*
     * The element's own fade multiplies with the transition's, because two
     * chained `fade` filters multiply their alphas and this has to say what the
     * file will do. A clip carrying both really is at 0.25 halfway through
     * overlapping ramps — the UI discourages that combination; the engine
     * reports it honestly.
     */
    const anim = resolveAnim(c);
    alpha *= elementFadeAt(anim, S, E, t);

    // Keyframed position replaces the rect origin, exactly as the export swaps
    // `overlay=rx:ry` for the keyframe expression.
    const base = kfPosition
      ? (() => {
          const k = sampleKeyframes(kfs!, p01);
          return { x: Math.round(k.x * W), y: Math.round(k.y * H), w: box.w, h: box.h };
        })()
      : box;
    // A slide is a delta on top of wherever the clip already sits.
    const slide = blended
      ? { dx: 0, dy: 0 }
      : slideOffsetAt(anim, S, E, t, W, H);
    const dst =
      slide.dx || slide.dy
        ? { ...base, x: base.x + slide.dx, y: base.y + slide.dy }
        : base;

    const filter = resolveFilter(c.filter);
    ops.push({
      kind: 'clip',
      id: c.id,
      src: c.src,
      srcTime: c.type === 'video' ? srcTimeAt(c, t) : undefined,
      dst,
      fit: 'cover',
      alpha: Math.max(0, Math.min(1, alpha)),
      blend: c.blend ?? 'normal',
      filter,
      blurSigma: c.blur && c.blur > 0 ? r3(c.blur * 20) : 0,
      motion: hasMotion(c.motion) ? motionStateAt(c.motion, p01) : undefined,
      mask: c.mask,
      cutout: c.cutout,
      mosaic: c.mosaic,
      magnifier: c.magnifier,
      rotation: normalizeRotation(c.rotation) || undefined,
      srcRect: isFullSource(c.crop) ? undefined : c.crop,
    });
  }

  // Text overlays composite last, in layer order. The caption is rasterized
  // full-frame with the text baked at its anchor, so keyframed position moves
  // the whole layer by the DELTA from that anchor — matching the export's
  // `overlay=(kf_x)-(o.x*W)`.
  const overlays = [...p.overlays].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));
  for (const o of overlays) {
    if (t < o.start || t > o.end) continue;
    const dur = Math.max(0.001, o.end - o.start);
    const p01 = progressAt(o.start, dur, t);
    const kfs = o.keyframes;
    const kfOpacity = hasKeyframes(kfs) && animatesOpacity(kfs!);
    const kfPosition = hasKeyframes(kfs) && animatesPosition(kfs!);

    let alpha = kfOpacity
      ? sampleKeyframes(kfs!, p01).opacity
      : o.opacity != null && o.opacity < 1
        ? Math.max(0, o.opacity)
        : 1;
    // The legacy `animation:'fade'` resolves through the same module as an
    // explicit `animateIn`, so a stored caption keeps exactly the fade it had.
    const anim = resolveAnim(o);
    if (!kfOpacity) alpha *= elementFadeAt(anim, o.start, o.end, t);

    let dx = 0;
    let dy = 0;
    if (kfPosition) {
      const k = sampleKeyframes(kfs!, p01);
      dx = r3(k.x * W - o.x * W);
      dy = r3(k.y * H - o.y * H);
    }
    // A caption's dst is already a delta from its baked anchor, so a slide
    // composes by addition — no special case.
    const slide = slideOffsetAt(anim, o.start, o.end, t, W, H);
    dx += slide.dx;
    dy += slide.dy;

    ops.push({
      kind: 'overlay',
      id: o.id,
      svg: overlayToSVG(o, W, H),
      dst: { x: dx, y: dy, w: W, h: H },
      fit: 'stretch',
      alpha: Math.max(0, Math.min(1, alpha)),
      blend: 'normal',
      filter: resolveFilter(undefined),
      blurSigma: 0,
      motion: hasMotion(o.motion) ? motionStateAt(o.motion, p01) : undefined,
      mask: o.mask,
    });
  }

  /*
   * The canvas frame, over everything — matching the export, where it is the
   * last overlay before the output tail. It carries no window and no fade: it
   * is static for the whole render, which is exactly why it can be a single
   * rasterized PNG there and a single shape here.
   *
   * `blend: 'normal'` is stated rather than left undefined because the web
   * compositor reads `blendToCanvas(op.blend)` for every op.
   */
  if (hasCanvasFrame(p.frame)) {
    ops.push({
      kind: 'frame',
      id: 'frame',
      svg: canvasFrameToSVG(p.frame, W, H, p.background)!,
      dst: { x: 0, y: 0, w: W, h: H },
      // The SVG is authored at exactly W×H, so stretching is the identity —
      // the same reason the background op stretches.
      fit: 'stretch',
      alpha: 1,
      blend: 'normal',
      filter: resolveFilter(undefined),
      blurSigma: 0,
    });
  }

  return ops;
}
