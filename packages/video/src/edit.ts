/**
 * Timeline editing: every mutation an editor performs on a `VideoProject`.
 *
 * These are pure `VideoProject → VideoProject` functions, returning the SAME
 * object when nothing changed so a caller can bail on identity rather than
 * diffing — the web editor's undo stack and its re-render checks both rely on
 * that, and so will anything else built on this package.
 *
 * ## Why these live here now
 *
 * They were written in the web app, and the package shipped `createProject` and
 * nothing else that edits a project. That left every other client — a second
 * product, a mobile editor, anyone consuming the package — to reinvent them,
 * and the rules are not guessable: `removeClip` deliberately leaves the hole it
 * makes, `splitAt` advances `trimIn` by SOURCE seconds rather than timeline
 * seconds, `patchClip` rebuilds only the track it touched. Each of those is a
 * bug somebody already shipped. A second implementation would ship them again.
 *
 * ## Ids are the caller's
 *
 * Seven of these mint an id and take an `IdFactory` to do it. Nothing in this
 * package reads a clock or a random source — a render is meant to be
 * reproducible — so inventing ids here would be the first thing that is not.
 * It is the same reason `buildFFmpegArgs` takes `resolveSrc` from its caller:
 * where the answer belongs to the environment, the environment supplies it.
 */
import { r3 } from './layout';
import { clampSourceRect, isFullSource, normalizeRotation } from './transform';
import { requestedOverlap } from './xfade';
import type {
  AudioTrack,
  AudioTrackClip,
  CanvasFrame,
  ElementAnim,
  Overlay,
  Rect,
  SourceRect,
  TextOverlay,
  VideoProject,
  VisualTrack,
  VisualTrackClip,
} from './types';

/**
 * Mints an id with the given prefix. The editor's ids only have to be unique
 * within one project, so anything collision-free will do.
 */
export type IdFactory = (prefix: string) => string;

/** Shortest clip a trim or split may leave behind, in seconds. */
const MIN_CLIP = 0.1;

const visualTracks = (p: VideoProject) =>
  (p.tracks ?? []).filter((t): t is VisualTrack => t.kind === 'visual');

/** Clips ordered by start — for laying out the timeline, never for z-order. */
export const byStart = <T extends { start: number }>(clips: T[]) =>
  [...clips].sort((a, b) => a.start - b.start);

export const mainTrack = (p: VideoProject): VisualTrack | undefined => visualTracks(p)[0];

/** Append a visual clip to the end of the main track. */
export function appendVisual(
  p: VideoProject,
  clip: Omit<VisualTrackClip, 'id' | 'start'>,
  newId: IdFactory,
): VideoProject {
  const tracks = [...(p.tracks ?? [])];
  let index = tracks.findIndex((t) => t.kind === 'visual');
  if (index < 0) {
    tracks.push({ id: newId('trk'), kind: 'visual', name: 'Main', clips: [] });
    index = tracks.length - 1;
  }
  const track = tracks[index] as VisualTrack;
  const start = track.clips.reduce((acc, c) => Math.max(acc, c.start + c.duration), 0);
  tracks[index] = {
    ...track,
    clips: [...track.clips, { ...clip, id: newId('clip'), start } as VisualTrackClip],
  };
  return { ...p, tracks };
}

/** Append an audio clip to the (single) audio track, creating it if needed. */
export function appendAudio(
  p: VideoProject,
  src: string,
  duration: number,
  newId: IdFactory,
): VideoProject {
  const tracks = [...(p.tracks ?? [])];
  let index = tracks.findIndex((t) => t.kind === 'audio');
  if (index < 0) {
    tracks.push({ id: newId('trk'), kind: 'audio', name: 'Audio', clips: [] });
    index = tracks.length - 1;
  }
  const track = tracks[index] as AudioTrack;
  const start = track.clips.reduce((acc, c) => Math.max(acc, c.start + c.duration), 0);
  tracks[index] = {
    ...track,
    clips: [...track.clips, { id: newId('aud'), src, start, duration }],
  };
  return { ...p, tracks };
}

/**
 * Patch one clip, on whichever track it is on.
 *
 * **It used to skip audio tracks** (`if (t.kind !== 'visual') return t`), which
 * made the audio clip's volume slider a control that did nothing: it called
 * this, this walked past the only track the clip could be on, and the project
 * came back unchanged. Clip ids are unique across the whole project, so there
 * was never a reason to look at only half of it.
 *
 * The per-track `here` flag matters too. With one shared `touched`, every track
 * AFTER the one holding the match got rebuilt as a new object with identical
 * contents — invisible, but it defeats the identity checks the timeline and the
 * preview use to decide what to re-render.
 */
export function patchClip(
  p: VideoProject,
  id: string,
  patch: Partial<VisualTrackClip> | Partial<AudioTrackClip>,
): VideoProject {
  let touched = false;
  const tracks = (p.tracks ?? []).map((t) => {
    if (!t.clips.some((c) => c.id === id)) return t;
    touched = true;
    return {
      ...t,
      clips: t.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    } as typeof t;
  });
  return touched ? { ...p, tracks } : p;
}

/**
 * Remove a clip and leave the hole.
 *
 * This deliberately does NOT re-pack the track. It used to, and that was wrong
 * once clips could be dragged: packing lays the whole track end to end from
 * zero, so deleting one shot would also silently destroy every deliberate gap
 * the user had placed. Closing the hole is a different, explicitly-chosen edit —
 * `rippleDeleteClip`.
 */
export function removeClip(p: VideoProject, id: string): VideoProject {
  let touched = false;
  const tracks = (p.tracks ?? []).map((t) => {
    if (!t.clips.some((c) => c.id === id)) return t;
    touched = true;
    return { ...t, clips: t.clips.filter((c) => c.id !== id) } as typeof t;
  });
  return touched ? { ...p, tracks } : p;
}

/** Lay clips end to end in start order, removing gaps. */
function pack(clips: VisualTrackClip[]): VisualTrackClip[] {
  let at = 0;
  return byStart(clips).map((c) => {
    const next = { ...c, start: at };
    at += c.duration;
    return next;
  });
}

/**
 * Split a clip at absolute time `t`.
 *
 * The right-hand piece must advance `trimIn` by the SOURCE seconds consumed,
 * which is `local × speed` — not `local`. Getting that wrong silently corrupts
 * every split on a sped-up clip; the mobile editor shipped that bug once.
 */
export function splitAt(p: VideoProject, id: string, t: number, newId: IdFactory): VideoProject {
  let touched = false;
  const tracks = (p.tracks ?? []).map((track) => {
    if (track.kind !== 'visual') return track;
    const index = track.clips.findIndex((c) => c.id === id);
    if (index < 0) return track;
    const clip = track.clips[index];
    const local = t - clip.start;
    if (local <= MIN_CLIP || local >= clip.duration - MIN_CLIP) return track;
    touched = true;
    const speed = clip.speed && clip.speed > 0 ? clip.speed : 1;
    const left: VisualTrackClip = { ...clip, duration: local };
    const right: VisualTrackClip = {
      ...clip,
      id: newId('clip'),
      start: clip.start + local,
      duration: clip.duration - local,
      trimIn: (clip.trimIn ?? 0) + local * speed,
      // A transition belongs to the head of the original clip, not the tail.
      transitionIn: undefined,
    };
    const clips = [...track.clips];
    clips.splice(index, 1, left, right);
    return { ...track, clips };
  });
  return touched ? { ...p, tracks } : p;
}

/** Trim a clip's head or tail, keeping the source in sync. */
export function trimClip(
  p: VideoProject,
  id: string,
  edge: 'in' | 'out',
  delta: number,
): VideoProject {
  return applyToClip(p, id, (clip) => {
    const speed = clip.speed && clip.speed > 0 ? clip.speed : 1;
    if (edge === 'out') {
      const duration = Math.max(MIN_CLIP, clip.duration + delta);
      return duration === clip.duration ? clip : { ...clip, duration };
    }
    const shift = Math.min(delta, clip.duration - MIN_CLIP);
    const duration = clip.duration - shift;
    if (duration === clip.duration) return clip;
    return {
      ...clip,
      duration,
      start: clip.start + shift,
      trimIn: Math.max(0, (clip.trimIn ?? 0) + shift * speed),
    };
  });
}

/**
 * Apply `fn` to one visual clip, leaving every other clip exactly where it is.
 *
 * This deliberately does NOT re-pack the track. Packing is right for ops that
 * change the RUNNING ORDER (remove, reorder), but wrong for direct manipulation:
 * dragging a clip's edge in a timeline must not teleport its neighbours, and a
 * dragged clip that gets packed back to `at` would snap out from under the
 * pointer. Gaps are legal — `frameStateAt` and the ffmpeg filtergraph both read
 * each clip's absolute `start`, so a gap simply shows the background.
 */
function applyToClip(
  p: VideoProject,
  id: string,
  fn: (c: VisualTrackClip) => VisualTrackClip,
): VideoProject {
  let touched = false;
  const tracks = (p.tracks ?? []).map((t) => {
    if (t.kind !== 'visual') return t;
    if (!t.clips.some((c) => c.id === id)) return t;
    let here = false;
    const clips = t.clips.map((c) => {
      if (c.id !== id) return c;
      const next = fn(c);
      if (next !== c) here = true;
      return next;
    });
    if (!here) return t;
    touched = true;
    return { ...t, clips };
  });
  return touched ? { ...p, tracks } : p;
}

/** Move a clip along its own lane. */
export function moveClip(p: VideoProject, id: string, start: number): VideoProject {
  const at = Math.max(0, r3(start));
  const visual = applyToClip(p, id, (c) => (c.start === at ? c : { ...c, start: at }));
  if (visual !== p) return visual;
  // Audio clips live on their own track kind and never reach applyToClip.
  let touched = false;
  const tracks = (p.tracks ?? []).map((t) => {
    if (t.kind !== 'audio' || !t.clips.some((c) => c.id === id)) return t;
    const clips = t.clips.map((c) => {
      if (c.id !== id || c.start === at) return c;
      touched = true;
      return { ...c, start: at };
    });
    return touched ? { ...t, clips } : t;
  });
  return touched ? { ...p, tracks } : p;
}

/**
 * Move a visual clip onto a different visual track.
 *
 * Track ARRAY ORDER is z-order — `frameStateAt` and `buildMultiTrackArgs` both
 * composite tracks in the order they appear, so changing a clip's track is how
 * you restack it. Audio tracks are not valid targets and are rejected.
 */
export function setClipTrack(
  p: VideoProject,
  id: string,
  trackId: string,
  start: number,
): VideoProject {
  const tracks = p.tracks ?? [];
  const from = tracks.findIndex((t) => t.kind === 'visual' && t.clips.some((c) => c.id === id));
  const to = tracks.findIndex((t) => t.id === trackId && t.kind === 'visual');
  if (from < 0 || to < 0) return p;
  const clip = (tracks[from] as VisualTrack).clips.find((c) => c.id === id)!;
  if (from === to) return moveClip(p, id, start);
  const next = [...tracks];
  next[from] = {
    ...(next[from] as VisualTrack),
    clips: (next[from] as VisualTrack).clips.filter((c) => c.id !== id),
  };
  next[to] = {
    ...(next[to] as VisualTrack),
    // A transition only ever applies to the first visual track in the export, so
    // dropping a clip onto a lower lane must not leave a fade that never renders.
    clips: [
      ...(next[to] as VisualTrack).clips,
      { ...clip, start: Math.max(0, r3(start)), transitionIn: to === 0 ? clip.transitionIn : undefined },
    ],
  };
  return { ...p, tracks: next };
}

/**
 * Drop an overlay clip — a sticker, a logo, a picture-in-picture — onto the
 * topmost visual track, creating one above the base if only the base exists.
 *
 * Deliberately never the base track: an overlay lands ON the picture, and the
 * base is the picture. Putting it there would replace the shot instead of
 * sitting over it.
 */
export function addOverlayClip(
  p: VideoProject,
  clip: Omit<VisualTrackClip, 'id'>,
  newId: IdFactory,
): VideoProject {
  const withTrack =
    (p.tracks ?? []).filter((t) => t.kind === 'visual').length > 1 ? p : addVisualTrack(p, newId);
  const tracks = [...(withTrack.tracks ?? [])];
  let index = -1;
  for (let i = tracks.length - 1; i >= 0; i--)
    if (tracks[i].kind === 'visual') {
      index = i;
      break;
    }
  if (index < 0) return p;
  const track = tracks[index] as VisualTrack;
  tracks[index] = {
    ...track,
    clips: [...track.clips, { ...clip, id: newId('clip') } as VisualTrackClip],
  };
  return { ...withTrack, tracks };
}

/** Add a visual track above the existing ones (higher index = drawn later). */
export function addVisualTrack(p: VideoProject, newId: IdFactory): VideoProject {
  const tracks = [...(p.tracks ?? [])];
  const count = tracks.filter((t) => t.kind === 'visual').length;
  const audioAt = tracks.findIndex((t) => t.kind === 'audio');
  const track: VisualTrack = {
    id: newId('trk'),
    kind: 'visual',
    name: count === 0 ? 'Main' : `Overlay ${count}`,
    clips: [],
  };
  if (audioAt < 0) tracks.push(track);
  else tracks.splice(audioAt, 0, track);
  return { ...p, tracks };
}

/** Find any clip by id, on any track, with the track that holds it. */
export function findClip(p: VideoProject, id: string | null) {
  if (!id) return null;
  for (const track of p.tracks ?? [])
    for (const clip of track.clips)
      if (clip.id === id) return { clip, track } as const;
  return null;
}

/**
 * Delete a clip and close the hole it leaves ON ITS OWN TRACK.
 *
 * Mirrors `rippleDeleteClip` in `apps/mobile/src/model/editor-ops.ts`, including
 * the part that is easy to get wrong: only the track holding the clip ripples.
 * Other tracks and the overlays keep their absolute timing, because a caption or
 * a music cue was placed against the picture at a chosen moment and sliding it
 * would silently desync work the user already did.
 */
export function rippleDeleteClip(p: VideoProject, id: string): VideoProject {
  const found = findClip(p, id);
  if (!found) return p;
  const { clip } = found;
  const end = clip.start + clip.duration;
  /*
   * By the clip's NET cost, not its duration. A clip carrying a transition is
   * laid back over the one before it, so it only occupies `duration - overlap`
   * of the track — rippling by the full duration would pull everything after it
   * too far left and leave the picture ahead of the captions and the music by
   * the accumulated difference.
   */
  const sorted = [...found.track.clips].sort((a, b) => a.start - b.start);
  const i = sorted.findIndex((c) => c.id === id);
  const by = r3(
    clip.duration -
      (found.track.kind === 'visual'
        ? requestedOverlap(
            sorted[i - 1] as VisualTrackClip | undefined,
            clip as VisualTrackClip,
          )
        : 0),
  );
  return {
    ...p,
    tracks: (p.tracks ?? []).map((t) => {
      if (t.id !== found.track.id) return t;
      const clips = t.clips
        .filter((c) => c.id !== id)
        .map((c) =>
          c.start >= end - 0.001
            ? { ...c, start: Math.max(clip.start, r3(c.start - by)) }
            : c,
        );
      return { ...t, clips } as typeof t;
    }),
  };
}

/**
 * Set (or clear) the transition arriving at a clip, and move the timeline to
 * match.
 *
 * A transition IS an overlap — the clip is laid back over the one before it by
 * the transition's duration — so writing the field alone would leave the model
 * claiming a crossfade across an interval where the two clips never meet, and
 * every renderer would fall back to a ramp through the background.
 *
 * Only this clip and the ones after it move, and only on this track: captions
 * and music were placed against the picture at a chosen moment. Mirrors
 * `setClipTransition` in `apps/mobile/src/model/editor-ops.ts`; two clients
 * reconciling one synced document by different rules is how edits get lost.
 */
export function setTransition(
  p: VideoProject,
  id: string,
  transitionIn: VisualTrackClip['transitionIn'],
): VideoProject {
  const found = findClip(p, id);
  if (!found || found.track.kind !== 'visual') return p;
  const sorted = byStart(found.track.clips) as VisualTrackClip[];
  const i = sorted.findIndex((c) => c.id === id);
  if (i < 0) return p;
  const prev = sorted[i - 1];
  const delta = r3(
    requestedOverlap(prev, { ...sorted[i], transitionIn }) -
      requestedOverlap(prev, sorted[i]),
  );
  const moves = new Set(sorted.slice(i).map((c) => c.id));

  return {
    ...p,
    tracks: (p.tracks ?? []).map((t) => {
      if (t.id !== found.track.id) return t;
      const clips = (t.clips as VisualTrackClip[]).map((c) => {
        const next = c.id === id ? { ...c, transitionIn } : c;
        if (delta === 0 || !moves.has(c.id)) return next;
        return { ...next, start: Math.max(0, r3(next.start - delta)) };
      });
      return { ...t, clips } as typeof t;
    }),
  };
}

/** Close an empty interval on one track by pulling later clips left. */
export function removeTrackGap(
  p: VideoProject,
  trackId: string,
  start: number,
  end: number,
): VideoProject {
  const from = Math.max(0, start);
  const to = Math.max(from, end);
  const span = to - from;
  if (span < 0.001) return p;
  return {
    ...p,
    tracks: (p.tracks ?? []).map((t) => {
      if (t.id !== trackId) return t;
      const clips = t.clips.map((c) =>
        c.start >= to - 0.001 ? { ...c, start: Math.max(from, r3(c.start - span)) } : c,
      );
      return { ...t, clips } as typeof t;
    }),
  };
}

/** Copy a clip and drop it immediately after the original, on the same track. */
export function duplicateClip(p: VideoProject, id: string, newId: IdFactory): VideoProject {
  const found = findClip(p, id);
  if (!found) return p;
  const { clip, track } = found;
  const copy = {
    ...clip,
    id: newId(track.kind === 'audio' ? 'aud' : 'clip'),
    start: r3(clip.start + clip.duration),
    // A transition describes how this clip arrives from the PREVIOUS one; the
    // copy arrives from its own original, so carrying the fade over would double it.
    ...(track.kind === 'visual' ? { transitionIn: undefined } : {}),
  };
  return {
    ...p,
    tracks: (p.tracks ?? []).map((t) =>
      t.id === track.id ? ({ ...t, clips: [...t.clips, copy] } as typeof t) : t,
    ),
  };
}

/** Place a clip on the canvas — the normalized rect that makes PiP and stickers. */
export function setClipRect(p: VideoProject, id: string, rect: Rect): VideoProject {
  return applyToClip(p, id, (c) => ({
    ...c,
    rect: {
      x: clamp01(rect.x),
      y: clamp01(rect.y),
      w: Math.min(1, Math.max(0.02, rect.w)),
      h: Math.min(1, Math.max(0.02, rect.h)),
    },
  }));
}

/**
 * Rotation and crop on one clip, written in a SINGLE op.
 *
 * They travel together because a gesture that changes one usually changes
 * another — dragging a mid-edge crop handle moves the rect as well as the crop
 * window — and three separate mutations would be three undo steps for one drag.
 * The mobile editor's `setClipTransform` has the same signature for the same
 * reason.
 *
 * Both fields are normalized on the way IN so nothing downstream has to wonder
 * whether 370° and 10° are the same clip, and a neutral value is DELETED rather
 * than stored: a full-frame `crop` and a rotation of 0 both have to leave the
 * project byte-identical to one that was never transformed, or the filtergraph
 * grows a `rotate`/`crop` pair that does nothing and costs a `format=rgba`.
 */
export function setClipTransform(
  p: VideoProject,
  id: string,
  patch: { rect?: Rect; rotation?: number; crop?: SourceRect },
): VideoProject {
  return applyToClip(p, id, (c) => {
    const next: VisualTrackClip = { ...c };
    if (patch.rect) next.rect = patch.rect;
    if (patch.rotation !== undefined) {
      const deg = normalizeRotation(patch.rotation);
      if (deg) next.rotation = deg;
      else delete next.rotation;
    }
    if (patch.crop) {
      const crop = clampSourceRect(patch.crop);
      if (isFullSource(crop)) delete next.crop;
      else next.crop = crop;
    }
    return next;
  });
}

/**
 * The canvas frame — a mat over the finished picture — or `undefined` to remove
 * it.
 *
 * The field is DELETED rather than set to a neutral value, because
 * `hasCanvasFrame` is what both renderers branch on and a `{width: 0}` frame
 * would still append an overlay input to the filtergraph. A project someone has
 * switched the frame off on has to be byte-identical to one that never had one.
 */
export function setFrame(p: VideoProject, frame: CanvasFrame | undefined): VideoProject {
  if (!frame) {
    if (!p.frame) return p;
    const { frame: _drop, ...rest } = p;
    return rest as VideoProject;
  }
  return { ...p, frame };
}

/**
 * Entrance and exit animation, on a clip or a caption.
 *
 * One op for both, because the model carries `animateIn`/`animateOut` on every
 * visual clip AND every text overlay, and `resolveAnim` reads them the same way.
 * Two ops would be two places to get the removal rule wrong.
 *
 * **`undefined` REMOVES the field.** Storing `{type: 'none'}` instead would put
 * a clip that has never been animated and one whose animation was switched off
 * into different documents, and the second one emits a different filtergraph —
 * `hasFade` joins the condition that picks `yuva420p`. Off has to mean absent.
 */
export function setElementAnim(
  p: VideoProject,
  id: string,
  animateIn: ElementAnim | undefined,
  animateOut: ElementAnim | undefined,
): VideoProject {
  const strip = <T extends { animateIn?: ElementAnim; animateOut?: ElementAnim }>(el: T): T => {
    const { animateIn: _i, animateOut: _o, ...rest } = el;
    return {
      ...(rest as T),
      ...(animateIn && animateIn.type !== 'none' ? { animateIn } : {}),
      ...(animateOut && animateOut.type !== 'none' ? { animateOut } : {}),
    };
  };
  if ((p.overlays ?? []).some((o) => o.id === id)) {
    return { ...p, overlays: (p.overlays ?? []).map((o) => (o.id === id ? strip(o) : o)) };
  }
  return applyToClip(p, id, strip);
}

/* -------------------------------------------------------------- overlays --- */

const byLayer = (o: Overlay[]) => [...o].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));

export function addOverlay(p: VideoProject, overlay: Overlay): VideoProject {
  return { ...p, overlays: byLayer([...(p.overlays ?? []), overlay]) };
}

export function updateOverlay<O extends Overlay = TextOverlay>(
  p: VideoProject,
  id: string,
  patch: Partial<O>,
): VideoProject {
  let touched = false;
  const overlays = (p.overlays ?? []).map((o) => {
    if (o.id !== id) return o;
    touched = true;
    /*
     * An `undefined` in the patch REMOVES the field rather than parking an
     * undefined value under a live key. That distinction is load-bearing in
     * this engine: the renderers branch on presence — `hasCanvasFrame` appends
     * an ffmpeg input, `hasFade` picks `yuva420p`, `linesOf` wraps or does not
     * — so a key that exists holding nothing is a different document from one
     * that lacks the key, and only the second is the document a project had
     * before the control was ever touched.
     */
    const next = { ...o, ...patch } as Record<string, unknown>;
    for (const k of Object.keys(patch)) {
      if ((patch as Record<string, unknown>)[k] === undefined) delete next[k];
    }
    return next as unknown as Overlay;
  });
  return touched ? { ...p, overlays } : p;
}

export function removeOverlay(p: VideoProject, id: string): VideoProject {
  const overlays = (p.overlays ?? []).filter((o) => o.id !== id);
  return overlays.length === (p.overlays ?? []).length ? p : { ...p, overlays };
}

/** Remove a caption and close its interval for later captions on the SAME layer. */
export function rippleDeleteOverlay(p: VideoProject, id: string): VideoProject {
  const target = (p.overlays ?? []).find((o) => o.id === id);
  if (!target) return p;
  const span = target.end - target.start;
  const layer = target.layer ?? 0;
  return {
    ...p,
    overlays: (p.overlays ?? [])
      .filter((o) => o.id !== id)
      .map((o) =>
        (o.layer ?? 0) === layer && o.start >= target.end - 0.001
          ? {
              ...o,
              start: Math.max(target.start, r3(o.start - span)),
              end: Math.max(target.start, r3(o.end - span)),
            }
          : o,
      ),
  };
}

/** Copy a caption and drop it immediately after the original, on its own layer. */
export function duplicateOverlay(p: VideoProject, id: string, newId: IdFactory): VideoProject {
  const target = (p.overlays ?? []).find((o) => o.id === id);
  if (!target) return p;
  const span = target.end - target.start;
  return addOverlay(p, {
    ...target,
    id: newId('txt'),
    start: r3(target.end),
    end: r3(target.end + span),
  });
}

/**
 * What to call an overlay in a list or on a timeline bar.
 *
 * One helper rather than `o.text || 'Text'` at each site, because those sites
 * are exactly where a new overlay kind goes silently unlabelled — the bar still
 * draws, so nothing looks broken; it is just blank, on a lane, with no way to
 * tell which one it is.
 */
export function overlayLabel(o: Overlay): string {
  if (o.type === 'text') return o.text || 'Text';
  if (o.type === 'image') return 'Image';
  return o.shape === 'ellipse' ? 'Ellipse' : 'Rectangle';
}

/** The caption with this id, or null if it is absent or not a caption. */
export function findTextOverlay(p: VideoProject, id: string | null): TextOverlay | null {
  const o = findOverlay(p, id);
  return o && o.type === 'text' ? o : null;
}

export function findOverlay(p: VideoProject, id: string | null): Overlay | null {
  if (!id) return null;
  return (p.overlays ?? []).find((o) => o.id === id) ?? null;
}

/** The next free stacking lane for a new caption. */
export function nextOverlayLayer(p: VideoProject): number {
  return (p.overlays ?? []).reduce((max, o) => Math.max(max, (o.layer ?? 0) + 1), 0);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Move a clip earlier or later in the main track's running order. */
export function reorderClip(p: VideoProject, id: string, direction: -1 | 1): VideoProject {
  let touched = false;
  const tracks = (p.tracks ?? []).map((t) => {
    if (t.kind !== 'visual') return t;
    const ordered = byStart(t.clips);
    const index = ordered.findIndex((c) => c.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return t;
    touched = true;
    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    return { ...t, clips: pack(next) };
  });
  return touched ? { ...p, tracks } : p;
}

