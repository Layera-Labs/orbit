/**
 * Pure multi-track timeline mutations over a `VideoProject` (v2 `tracks`).
 *
 * Visual tracks stack bottom→top (array order = z-order); every clip has an
 * ABSOLUTE `start` on the timeline and (for visual clips) a normalized `rect`
 * placement. Audio tracks mix. Every function returns a NEW project.
 */
import type {
  AudioTrackClip,
  BlendMode,
  ChromaKey,
  ClipFilter,
  ClipMagnifier,
  ClipMask,
  ClipMosaic,
  Keyframe,
  Motion,
  ElementAnim,
  Rect,
  SourceRect,
  VolumePoint,
  TextOverlay,
  Track,
  Transition,
  VideoProject,
  VisualTrackClip,
} from "./types";
import { isFullSource, normalizeRotation } from "../preview/transform";
import { MAX_VOLUME } from "./audio-fade";
import { requestedOverlap } from "../preview/xfade";

export const MIN_CLIP = 0.1;

let _seq = 0;
export function newId(prefix = "c"): string {
  _seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${_seq.toString(36)}`;
}

// ---------------------------------------------------------------------------
// accessors
// ---------------------------------------------------------------------------

export function tracksOf(p: VideoProject): Track[] {
  return p.tracks ?? [];
}

export function findTrack(p: VideoProject, trackId: string): Track | undefined {
  return p.tracks?.find((t) => t.id === trackId);
}

export function trackEnd(t: Track): number {
  return t.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
}

/**
 * Every clip on `track` occupying absolute time `sec`, in array order.
 *
 * Up to TWO on a visual track: clips overlap by their transition duration, so
 * inside a transition the outgoing clip and the incoming one are both live —
 * which is the whole reason a crossfade can exist at all.
 */
export function clipsAtTime(
  track: Track,
  sec: number,
): (VisualTrackClip | AudioTrackClip)[] {
  return track.clips.filter((c) => sec >= c.start && sec < c.start + c.duration);
}

/**
 * The single clip at `sec` — the one you would say you are looking at.
 *
 * Inside a transition that is a judgement call, and the answer is whichever
 * clip is the more visible: the outgoing one until the halfway point of the
 * overlap, the incoming one after it. Returning the top clip unconditionally
 * would select something still at zero opacity, and returning the bottom one
 * would keep selecting a clip that has already faded away.
 *
 * Callers that need to draw the transition want `clipsAtTime`; this is for
 * selection, hit-testing and "which clip does this effect apply to".
 */
export function clipAtTime(
  track: Track,
  sec: number,
): VisualTrackClip | AudioTrackClip | undefined {
  const live = clipsAtTime(track, sec);
  if (live.length < 2) return live[0];
  const outgoing = live[0];
  const incoming = live[live.length - 1];
  const mid = (incoming.start + outgoing.start + outgoing.duration) / 2;
  return sec >= mid ? incoming : outgoing;
}

// ---------------------------------------------------------------------------
// migration / creation
// ---------------------------------------------------------------------------

/** Ensure a project has a v2 `tracks` array, migrating legacy clips/audio. */
export function ensureTracks(p: VideoProject): VideoProject {
  if (p.tracks && p.tracks.length) return p;
  let acc = 0;
  const visual: VisualTrackClip[] = (p.clips ?? []).map((c) => {
    const start = acc;
    acc += c.duration;
    return c.type === "video"
      ? {
          id: c.id,
          type: "video",
          src: c.src,
          start,
          duration: c.duration,
          trimIn: c.trimIn,
          volume: c.volume,
          muted: c.muted,
        }
      : { id: c.id, type: "image", src: c.src, start, duration: c.duration };
  });
  const tracks: Track[] = [
    { id: newId("trk"), kind: "visual", name: "Main", clips: visual },
  ];
  if (p.audio?.length) {
    tracks.push({
      id: newId("trk"),
      kind: "audio",
      name: "Audio",
      clips: p.audio.map((a) => ({
        id: a.id,
        src: a.src,
        start: a.start ?? 0,
        duration: a.duration ?? Math.max(MIN_CLIP, acc - (a.start ?? 0)),
        trimIn: a.trimIn,
        volume: a.volume,
      })),
    });
  }
  return { ...p, schemaVersion: 2, tracks };
}

/** A fresh project with one empty visual (main) track. */
export function newProjectTracks(): Track[] {
  return [{ id: newId("trk"), kind: "visual", name: "Main", clips: [] }];
}

// ---------------------------------------------------------------------------
// internal helpers
// ---------------------------------------------------------------------------

function mapTracks(
  p: VideoProject,
  fn: (tracks: Track[]) => Track[],
): VideoProject {
  return { ...p, tracks: fn(p.tracks ?? []) };
}

/** Keep a track's clips in timeline order — neighbour lookups depend on it. */
function byStart<C extends { start: number }>(clips: C[]): C[] {
  return [...clips].sort((a, b) => a.start - b.start);
}

/** Update a track's clips, preserving its kind. */
function updateClips(
  p: VideoProject,
  trackId: string,
  fnV: (clips: VisualTrackClip[]) => VisualTrackClip[],
  fnA: (clips: AudioTrackClip[]) => AudioTrackClip[],
): VideoProject {
  return mapTracks(p, (ts) =>
    ts.map((t) => {
      if (t.id !== trackId) return t;
      return t.kind === "visual"
        ? { ...t, clips: fnV(t.clips) }
        : { ...t, clips: fnA(t.clips) };
    }),
  );
}

// ---------------------------------------------------------------------------
// track ops
// ---------------------------------------------------------------------------

export function addTrack(
  p: VideoProject,
  kind: "visual" | "audio",
  id = newId("trk"),
): VideoProject {
  const track: Track =
    kind === "visual"
      ? { id, kind: "visual", clips: [] }
      : { id, kind: "audio", clips: [] };
  return mapTracks(p, (ts) => [...ts, track]);
}

/** Remove a track entirely. Keeps at least one visual track. */
export function removeTrack(p: VideoProject, trackId: string): VideoProject {
  const ts = (p.tracks ?? []).filter((t) => t.id !== trackId);
  if (!ts.some((t) => t.kind === "visual"))
    ts.unshift({ id: newId("trk"), kind: "visual", clips: [] });
  return { ...p, tracks: ts };
}

/** Drop any empty visual track that isn't the base (keeps the timeline tidy). */
export function pruneEmptyTracks(p: VideoProject): VideoProject {
  const ts = p.tracks ?? [];
  const kept = ts.filter(
    (t, i) => t.clips.length > 0 || (t.kind === "visual" && i === 0),
  );
  return { ...p, tracks: kept.length ? kept : newProjectTracks() };
}

// ---------------------------------------------------------------------------
// clip ops
// ---------------------------------------------------------------------------

export function addVisualClip(
  p: VideoProject,
  trackId: string,
  clip: VisualTrackClip,
): VideoProject {
  return updateClips(
    p,
    trackId,
    (cs) => byStart([...cs, clip]),
    (cs) => cs,
  );
}

export function addAudioClip(
  p: VideoProject,
  trackId: string,
  clip: AudioTrackClip,
): VideoProject {
  return updateClips(
    p,
    trackId,
    (cs) => cs,
    (cs) => [...cs, clip],
  );
}

/**
 * How much of the timeline a clip actually occupies on its own track.
 *
 * NOT its duration. A clip carrying a transition is laid back over the one
 * before it, so it only adds `duration - overlap` to the track — and a ripple
 * that shifts by the full duration therefore pushes every later clip too far,
 * and every OTHER track (music, captions) out of sync with the picture by the
 * accumulated difference.
 */
function timelineCost(
  clips: (VisualTrackClip | AudioTrackClip)[],
  clip: VisualTrackClip | AudioTrackClip,
): number {
  if (!("type" in clip)) return clip.duration;
  const sorted = byStart(clips.filter((c) => c.id !== clip.id));
  let prev: VisualTrackClip | undefined;
  for (const c of sorted) {
    if (c.start >= clip.start - 0.001) break;
    if ("type" in c) prev = c as VisualTrackClip;
  }
  return clip.duration - requestedOverlap(prev, clip as VisualTrackClip);
}

/**
 * Insert a clip and push everything at or after its start later by its length.
 *
 * Plain `addVisualClip` drops the clip wherever it says, which for a duplicate
 * placed at `start + duration` lands it exactly on top of the next clip. Two
 * clips then occupy one interval: `clipAtTime` returns the first, so the
 * preview shows one while the export composites both.
 */
export function rippleInsertClip(
  p: VideoProject,
  trackId: string,
  clip: VisualTrackClip | AudioTrackClip,
): VideoProject {
  const track = findTrack(p, trackId);
  const by = timelineCost(track?.clips ?? [], clip);
  const shift = <T extends VisualTrackClip | AudioTrackClip>(cs: T[]): T[] =>
    cs.map((c) =>
      c.start >= clip.start - 0.001 ? { ...c, start: c.start + by } : c,
    );
  return updateClips(
    p,
    trackId,
    (cs) => byStart([...shift(cs), clip as VisualTrackClip]),
    (cs) => byStart([...shift(cs), clip as AudioTrackClip]),
  );
}

export function removeClip(
  p: VideoProject,
  trackId: string,
  clipId: string,
): VideoProject {
  return updateClips(
    p,
    trackId,
    (cs) => cs.filter((c) => c.id !== clipId),
    (cs) => cs.filter((c) => c.id !== clipId),
  );
}

/** Remove one clip and close its occupied interval on that same track. */
export function rippleDeleteClip(
  p: VideoProject,
  trackId: string,
  clipId: string,
): VideoProject {
  const track = findTrack(p, trackId);
  const target = track?.clips.find((clip) => clip.id === clipId);
  if (!target) return p;
  const end = target.start + target.duration;
  // What the clip cost the timeline, not how long it is — see `timelineCost`.
  const by = timelineCost(track?.clips ?? [], target);

  const ripple = <T extends VisualTrackClip | AudioTrackClip>(clips: T[]) =>
    clips
      .filter((clip) => clip.id !== clipId)
      .map((clip) =>
        clip.start >= end - 0.001
          ? { ...clip, start: Math.max(target.start, clip.start - by) }
          : clip,
      );

  return updateClips(p, trackId, ripple, ripple);
}

/**
 * Close an empty interval on one track by moving every later clip left.
 * Other tracks and overlays keep their absolute timing.
 */
export function removeTrackGap(
  p: VideoProject,
  trackId: string,
  start: number,
  end: number,
): VideoProject {
  const gapStart = Math.max(0, start);
  const gapEnd = Math.max(gapStart, end);
  const duration = gapEnd - gapStart;
  if (duration < 0.001) return p;

  const closeGap = <T extends VisualTrackClip | AudioTrackClip>(clips: T[]) =>
    clips.map((clip) =>
      clip.start >= gapEnd - 0.001
        ? { ...clip, start: Math.max(gapStart, clip.start - duration) }
        : clip,
    );

  return updateClips(p, trackId, closeGap, closeGap);
}

/** Move a clip's absolute start (drag in time). */
export function setClipStart(
  p: VideoProject,
  trackId: string,
  clipId: string,
  start: number,
): VideoProject {
  const s = Math.max(0, start);
  // Re-sort: both the preview and `buildFFmpegArgs` read transitions from the
  // NEIGHBOURING array entry, so an out-of-time-order track takes a clip's
  // fade from the wrong neighbour after a drag.
  return updateClips(
    p,
    trackId,
    (cs) => byStart(cs.map((c) => (c.id === clipId ? { ...c, start: s } : c))),
    (cs) => byStart(cs.map((c) => (c.id === clipId ? { ...c, start: s } : c))),
  );
}

/** Move a clip to another track of the SAME kind (drag vertically). */
export function moveClipToTrack(
  p: VideoProject,
  fromTrackId: string,
  toTrackId: string,
  clipId: string,
  newStart?: number,
): VideoProject {
  const from = findTrack(p, fromTrackId);
  const to = findTrack(p, toTrackId);
  if (!from || !to || from.kind !== to.kind || fromTrackId === toTrackId)
    return p;
  const clip = from.clips.find((c) => c.id === clipId);
  if (!clip) return p;
  const moved = { ...clip, start: Math.max(0, newStart ?? clip.start) };
  return mapTracks(p, (ts) =>
    ts.map((t) => {
      if (t.id === fromTrackId) {
        return t.kind === "visual"
          ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
          : { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
      }
      if (t.id === toTrackId) {
        return t.kind === "visual"
          ? { ...t, clips: byStart([...t.clips, moved as VisualTrackClip]) }
          : { ...t, clips: byStart([...t.clips, moved as AudioTrackClip]) };
      }
      return t;
    }),
  );
}

/**
 * Pack a visual track back-to-back in time order, anchored at its first clip.
 *
 * This is what the "Quick" main-track mode means by a fluid timeline: the main
 * sequence never holds a gap, so a delete or a drag closes up behind itself.
 * "Pro" leaves placement alone.
 */
export function packVisualTrack(
  p: VideoProject,
  trackId: string,
): VideoProject {
  const track = findTrack(p, trackId);
  if (!track || track.kind !== "visual" || track.clips.length === 0) return p;
  const sorted = byStart(track.clips);
  /*
   * The canonical definition of the overlapped layout. A clip carrying a
   * transition is laid BACK over the one before it by the transition's
   * duration, which is what makes a crossfade possible and what makes adding
   * one shorten the track. Everything else that moves clips in time — the
   * migration, the ripple ops — places them the same way, through the same
   * `requestedOverlap`.
   */
  const packed: VisualTrackClip[] = [];
  let cursor = sorted[0].start;
  for (const c of sorted) {
    const prev = packed[packed.length - 1];
    const start = cursor - requestedOverlap(prev, c);
    packed.push({ ...c, start });
    cursor = start + c.duration;
  }
  // Bail by identity when nothing actually moved — `apply` pushes history and
  // writes to disk on every call.
  if (
    packed.every(
      (c, i) =>
        c.start === track.clips[i]?.start && c.id === track.clips[i]?.id,
    )
  )
    return p;
  return updateClips(
    p,
    trackId,
    () => packed,
    (cs) => cs,
  );
}

/**
 * The span a main clip owns ALONE — its window minus the transitions it shares
 * with its neighbours.
 *
 * Clips overlap now, so a caption sitting inside a transition falls within the
 * window of BOTH clips and would be grabbed by whichever one you moved. The
 * exclusive span gives it to neither, which is the only answer that does not
 * depend on which clip you happened to drag.
 */
function exclusiveSpan(
  track: Track,
  clip: VisualTrackClip | AudioTrackClip,
): { start: number; end: number } {
  const sorted = byStart(track.clips).filter((c) => "type" in c) as VisualTrackClip[];
  const i = sorted.findIndex((c) => c.id === clip.id);
  const inOv = i > 0 ? requestedOverlap(sorted[i - 1], sorted[i]) : 0;
  const outOv = i >= 0 && sorted[i + 1] ? requestedOverlap(sorted[i], sorted[i + 1]) : 0;
  return {
    start: clip.start + inOv,
    end: clip.start + clip.duration - outOv,
  };
}

/** Overlays and non-main clips wholly inside `[start, end)`. */
function linkedWithin(
  p: VideoProject,
  mainTrackId: string,
  start: number,
  end: number,
) {
  const overlays = p.overlays.filter(
    (o) => o.start >= start - 0.001 && o.end <= end + 0.001,
  );
  const clips: { trackId: string; clipId: string }[] = [];
  for (const t of p.tracks ?? []) {
    if (t.id === mainTrackId) continue;
    for (const c of t.clips) {
      if (c.start >= start - 0.001 && c.start + c.duration <= end + 0.001)
        clips.push({ trackId: t.id, clipId: c.id });
    }
  }
  return { overlays, clips };
}

/**
 * Move a main-track clip and carry everything sitting inside its span with it.
 *
 * This is the Track Linkage preference: "Other elements move or delete with
 * main clips." Only elements WHOLLY inside the clip's span travel — something
 * straddling the boundary belongs to both neighbours and moving it would be a
 * guess.
 */
export function moveMainClipLinked(
  p: VideoProject,
  trackId: string,
  clipId: string,
  newStart: number,
): VideoProject {
  const track = findTrack(p, trackId);
  const clip = track?.clips.find((c) => c.id === clipId);
  if (!track || !clip) return p;
  const delta = Math.max(0, newStart) - clip.start;
  if (delta === 0) return setClipStart(p, trackId, clipId, newStart);
  const span = exclusiveSpan(track, clip);
  const { overlays, clips } = linkedWithin(p, trackId, span.start, span.end);
  const overlayIds = new Set(overlays.map((o) => o.id));
  const clipKeys = new Set(clips.map((c) => `${c.trackId}:${c.clipId}`));
  const shifted: VideoProject = {
    ...mapTracks(p, (ts) =>
      ts.map((t) =>
        t.kind === "visual"
          ? {
              ...t,
              clips: t.clips.map((c) =>
                clipKeys.has(`${t.id}:${c.id}`)
                  ? { ...c, start: Math.max(0, c.start + delta) }
                  : c,
              ),
            }
          : {
              ...t,
              clips: t.clips.map((c) =>
                clipKeys.has(`${t.id}:${c.id}`)
                  ? { ...c, start: Math.max(0, c.start + delta) }
                  : c,
              ),
            },
      ),
    ),
    overlays: p.overlays.map((o) =>
      overlayIds.has(o.id)
        ? {
            ...o,
            start: Math.max(0, o.start + delta),
            end: Math.max(0, o.end + delta),
          }
        : o,
    ),
  };
  return setClipStart(shifted, trackId, clipId, newStart);
}

/** Remove a main-track clip and everything sitting inside its span. */
export function removeMainClipLinked(
  p: VideoProject,
  trackId: string,
  clipId: string,
): VideoProject {
  const track = findTrack(p, trackId);
  const clip = track?.clips.find((c) => c.id === clipId);
  if (!track || !clip) return p;
  const span = exclusiveSpan(track, clip);
  const { overlays, clips } = linkedWithin(p, trackId, span.start, span.end);
  let next = removeClip(p, trackId, clipId);
  for (const o of overlays) next = removeOverlay(next, o.id);
  for (const c of clips) next = removeClip(next, c.trackId, c.clipId);
  return next;
}

/** Split the clip at absolute time `atSec` into two adjacent clips. */
export function splitClipAt(
  p: VideoProject,
  trackId: string,
  clipId: string,
  atSec: number,
): VideoProject {
  const splitOne = <C extends VisualTrackClip | AudioTrackClip>(c: C): C[] => {
    if (c.id !== clipId) return [c];
    const local = atSec - c.start;
    if (local <= MIN_CLIP || local >= c.duration - MIN_CLIP) return [c];
    const trimIn = c.trimIn ?? 0;
    // `local` is TIMELINE seconds; trimIn is a SOURCE offset. Both the preview
    // and the export map timeline→source as `trimIn + elapsed * speed`, so the
    // split point has to be scaled the same way or a sped-up clip repeats
    // footage across the cut.
    const speed = "speed" in c && c.speed && c.speed > 0 ? c.speed : 1;
    const first = { ...c, duration: local } as C;
    const second = {
      ...c,
      id: newId(c.start >= 0 ? "c" : "c"),
      start: c.start + local,
      duration: c.duration - local,
      trimIn: trimIn + local * speed,
      /*
       * The tail keeps NO transition. It arrived here through the spread, so
       * the two halves each claimed the same `transitionIn` — and since a
       * transition is now an overlap with the clip before it, the tail would
       * claim to cross-fade with its own head, over an interval that does not
       * exist. The head keeps it, because the head is what still follows the
       * clip the transition was set against.
       */
      transitionIn: undefined,
    } as C;
    return [first, second];
  };
  return updateClips(
    p,
    trackId,
    (cs) => cs.flatMap(splitOne),
    (cs) => cs.flatMap(splitOne),
  );
}

/** Trim handles: change start / trimIn / duration together. */
export function trimClip(
  p: VideoProject,
  trackId: string,
  clipId: string,
  patch: { start?: number; trimIn?: number; duration?: number },
): VideoProject {
  const apply = <C extends VisualTrackClip | AudioTrackClip>(c: C): C => {
    if (c.id !== clipId) return c;
    const duration = Math.max(MIN_CLIP, patch.duration ?? c.duration);
    const start =
      patch.start !== undefined ? Math.max(0, patch.start) : c.start;
    const trimIn =
      patch.trimIn !== undefined ? Math.max(0, patch.trimIn) : c.trimIn;
    return { ...c, start, duration, trimIn };
  };
  return updateClips(
    p,
    trackId,
    (cs) => cs.map(apply),
    (cs) => cs.map(apply),
  );
}

/** Set a visual clip's placement rect (PiP position/size). */
export function setClipRect(
  p: VideoProject,
  trackId: string,
  clipId: string,
  rect: Rect,
): VideoProject {
  return updateClips(
    p,
    trackId,
    (cs) => cs.map((c) => (c.id === clipId ? { ...c, rect } : c)),
    (cs) => cs,
  );
}

/**
 * Placement, rotation and crop in one write.
 *
 * The preview's transform handles change more than one of these per gesture — a
 * mid-edge crop moves the rect as well as the crop window — and three separate
 * mutations would be three undo steps for one drag.
 */
/**
 * Entrance/exit animation on a visual clip.
 *
 * `undefined` REMOVES the field rather than storing a neutral one, so a project
 * the user has switched animation off on is byte-identical to one that never
 * had it — which is what keeps the exported filtergraph identical too.
 */
export function setClipAnim(
  p: VideoProject,
  trackId: string,
  clipId: string,
  animateIn: ElementAnim | undefined,
  animateOut: ElementAnim | undefined,
): VideoProject {
  const apply = <C extends VisualTrackClip>(c: C): C => {
    if (c.id !== clipId) return c;
    const { animateIn: _i, animateOut: _o, ...rest } = c;
    return {
      ...(rest as C),
      ...(animateIn && animateIn.type !== "none" ? { animateIn } : {}),
      ...(animateOut && animateOut.type !== "none" ? { animateOut } : {}),
    };
  };
  return {
    ...p,
    tracks: (p.tracks ?? []).map((t) =>
      t.id === trackId && t.kind === "visual"
        ? { ...t, clips: t.clips.map(apply) }
        : t,
    ),
  };
}

export function setClipTransform(
  p: VideoProject,
  trackId: string,
  clipId: string,
  patch: { rect?: Rect; rotation?: number; crop?: SourceRect },
): VideoProject {
  const apply = <C extends VisualTrackClip>(c: C): C =>
    c.id === clipId
      ? {
          ...c,
          ...(patch.rect ? { rect: patch.rect } : {}),
          ...(patch.rotation !== undefined
            ? // Normalize on the way IN, so nothing downstream has to wonder
              // whether 370 and 10 are the same clip.
              { rotation: normalizeRotation(patch.rotation) || undefined }
            : {}),
          ...(patch.crop
            ? { crop: isFullSource(patch.crop) ? undefined : patch.crop }
            : {}),
        }
      : c;
  return updateClips(
    p,
    trackId,
    (cs) => cs.map(apply),
    (cs) => cs,
  );
}

function patchVisualClip(
  p: VideoProject,
  trackId: string,
  clipId: string,
  patch: Partial<VisualTrackClip>,
): VideoProject {
  return updateClips(
    p,
    trackId,
    (cs) => cs.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
    (cs) => cs,
  );
}

export function setClipFilter(
  p: VideoProject,
  trackId: string,
  clipId: string,
  filter: ClipFilter | undefined,
): VideoProject {
  return patchVisualClip(p, trackId, clipId, { filter });
}

export function setClipBlur(
  p: VideoProject,
  trackId: string,
  clipId: string,
  blur: number,
): VideoProject {
  return patchVisualClip(p, trackId, clipId, {
    blur: Math.max(0, Math.min(1, blur)),
  });
}

export function setClipOpacity(
  p: VideoProject,
  trackId: string,
  clipId: string,
  opacity: number,
): VideoProject {
  return patchVisualClip(p, trackId, clipId, {
    opacity: Math.max(0, Math.min(1, opacity)),
  });
}

export function setClipMask(
  p: VideoProject,
  trackId: string,
  clipId: string,
  mask: ClipMask | undefined,
): VideoProject {
  return patchVisualClip(p, trackId, clipId, { mask });
}

export function setClipMosaic(
  p: VideoProject,
  trackId: string,
  clipId: string,
  mosaic: ClipMosaic | undefined,
): VideoProject {
  return patchVisualClip(p, trackId, clipId, { mosaic });
}

export function setClipMagnifier(
  p: VideoProject,
  trackId: string,
  clipId: string,
  magnifier: ClipMagnifier | undefined,
): VideoProject {
  return patchVisualClip(p, trackId, clipId, { magnifier });
}

/** Authoring-only storyboard note; empty string clears it. */
export function setClipNote(
  p: VideoProject,
  trackId: string,
  clipId: string,
  note: string,
): VideoProject {
  return patchVisualClip(p, trackId, clipId, {
    note: note.trim() ? note : undefined,
  });
}

/**
 * Move a visual clip to a new index on its track and repack the whole track so
 * clips sit back to back from where the sequence currently starts.
 *
 * Storyboard reordering is inherently a repack: swapping two clips of different
 * lengths cannot preserve every original start time. Gaps inside the sequence
 * are closed as a side effect, which is the same thing the Story list shows.
 */
export function reorderVisualClips(
  p: VideoProject,
  trackId: string,
  from: number,
  to: number,
): VideoProject {
  const track = findTrack(p, trackId);
  // Bail out by IDENTITY, not by returning an equal copy — `apply` pushes every
  // new project onto the history stack and writes it to disk.
  if (!track || track.kind !== "visual") return p;
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= track.clips.length ||
    to >= track.clips.length
  )
    return p;
  return updateClips(
    p,
    trackId,
    (cs) => {
      const next = [...cs];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      let cursor = cs.reduce((min, c) => Math.min(min, c.start), Infinity);
      if (!Number.isFinite(cursor)) cursor = 0;
      return next.map((c) => {
        const placed = { ...c, start: cursor };
        cursor += c.duration;
        return placed;
      });
    },
    (cs) => cs,
  );
}

export function setClipBlend(
  p: VideoProject,
  trackId: string,
  clipId: string,
  blend: BlendMode,
): VideoProject {
  return patchVisualClip(p, trackId, clipId, {
    blend: blend === "normal" ? undefined : blend,
  });
}

export function setClipSpeed(
  p: VideoProject,
  trackId: string,
  clipId: string,
  speed: number,
): VideoProject {
  return patchVisualClip(p, trackId, clipId, {
    speed: Math.max(0.25, Math.min(4, speed)),
  });
}

export function setClipMotion(
  p: VideoProject,
  trackId: string,
  clipId: string,
  motion: Motion | undefined,
): VideoProject {
  return patchVisualClip(p, trackId, clipId, {
    motion: motion && motion.type !== "none" ? motion : undefined,
  });
}

export function setClipCutout(
  p: VideoProject,
  trackId: string,
  clipId: string,
  cutout: ChromaKey | undefined,
): VideoProject {
  return patchVisualClip(p, trackId, clipId, {
    cutout: cutout && cutout.color ? cutout : undefined,
  });
}

export function setClipKeyframes(
  p: VideoProject,
  trackId: string,
  clipId: string,
  keyframes: Keyframe[] | undefined,
): VideoProject {
  const kfs =
    keyframes && keyframes.length
      ? [...keyframes].sort((a, b) => a.t - b.t)
      : undefined;
  return patchVisualClip(p, trackId, clipId, { keyframes: kfs });
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
 * Only this clip and the ones AFTER it move, and only on this track: captions
 * and music were placed against the picture at a chosen moment, and sliding
 * them would silently retime work the user already did. The picture gets
 * shorter, which is what adding a transition means. Deliberately not
 * `packVisualTrack` — packing runs only in Quick mode and would close gaps a
 * Pro-mode edit put there on purpose.
 */
export function setClipTransition(
  p: VideoProject,
  trackId: string,
  clipId: string,
  transitionIn: Transition | undefined,
): VideoProject {
  const track = findTrack(p, trackId);
  if (!track || track.kind !== "visual") return p;
  const sorted = byStart(track.clips) as VisualTrackClip[];
  const i = sorted.findIndex((c) => c.id === clipId);
  if (i < 0) return p;
  const prev = sorted[i - 1];
  const before = requestedOverlap(prev, sorted[i]);
  const after = requestedOverlap(prev, { ...sorted[i], transitionIn });
  const delta = Math.round((after - before) * 1000) / 1000;

  // The set of clips that move: this one and everything after it in time.
  const moves = new Set(sorted.slice(i).map((c) => c.id));
  const r3 = (n: number) => Math.round(n * 1000) / 1000;

  return updateClips(
    p,
    trackId,
    (cs) =>
      cs.map((c) => {
        const next = c.id === clipId ? { ...c, transitionIn } : c;
        if (delta === 0 || !moves.has(c.id)) return next;
        return { ...next, start: Math.max(0, r3(next.start - delta)) };
      }),
    (cs) => cs,
  );
}

/**
 * Set the same transition on EVERY boundary of one visual track.
 *
 * Folded one boundary at a time through `setClipTransition` rather than
 * written in a single pass, because each one moves the clips after it: the
 * second boundary has to be measured against the geometry the first one just
 * produced, or every clip past the second lands short by the accumulated
 * overlap. Folding is also the only way this cannot disagree with setting them
 * one at a time by hand, which is the same rule `withVolume` follows.
 *
 * The FIRST clip is skipped — it has nothing before it to transition from, and
 * `resolveTransitions` would report it as an edge fade rather than a boundary.
 */
export function setTrackTransitions(
  p: VideoProject,
  trackId: string,
  transitionIn: Transition | undefined,
): VideoProject {
  const track = findTrack(p, trackId);
  if (!track || track.kind !== "visual") return p;
  const ids = (byStart(track.clips) as VisualTrackClip[]).slice(1).map((c) => c.id);
  return ids.reduce(
    (acc, id) => setClipTransition(acc, trackId, id, transitionIn),
    p,
  );
}

/** How many boundaries `setTrackTransitions` would reach on this track. */
export function trackBoundaryCount(p: VideoProject, trackId: string): number {
  const track = findTrack(p, trackId);
  return track && track.kind === "visual"
    ? Math.max(0, track.clips.length - 1)
    : 0;
}

/** Set volume on a visual (video) OR audio clip — patches whichever lane holds it. */
export function setClipVolume(
  p: VideoProject,
  trackId: string,
  clipId: string,
  volume: number,
): VideoProject {
  const v = Math.max(0, Math.min(MAX_VOLUME, volume));
  return updateClips(
    p,
    trackId,
    (cs) => cs.map((c) => (c.id === clipId ? { ...c, volume: v } : c)),
    (cs) => cs.map((c) => (c.id === clipId ? { ...c, volume: v } : c)),
  );
}

/**
 * Silence a clip WITHOUT losing the level it was at.
 *
 * `muted` is the field both previews and the export already honour
 * (`audioGraph.ts` skips a muted clip, `ffmpeg.ts` never opens its audio) — and
 * until now nothing wrote it: muting went through `volume: 0`, which discards
 * the number you had, so unmuting could only guess at 1. Two ways to express one
 * state is how a level goes missing; this is the one that keeps it.
 */
export function setClipMuted(
  p: VideoProject,
  trackId: string,
  clipId: string,
  muted: boolean,
): VideoProject {
  return updateClips(
    p,
    trackId,
    (cs) => cs.map((c) => (c.id === clipId ? { ...c, muted } : c)),
    (cs) => cs.map((c) => (c.id === clipId ? { ...c, muted } : c)),
  );
}

/** Set a volume envelope on a visual (video) OR audio clip. Clears when < 2 points. */
export function setClipVolumeCurve(
  p: VideoProject,
  trackId: string,
  clipId: string,
  curve: VolumePoint[] | undefined,
): VideoProject {
  // Points are bounded to the SAME ceiling as `setClipVolume`. They were not,
  // and because a curve overrides the plain number, an out-of-range point was
  // the one way to store a gain the UI could neither show nor undo.
  const vc =
    curve && curve.length >= 2
      ? curve.map((k) => ({ t: k.t, v: Math.max(0, Math.min(MAX_VOLUME, k.v)) }))
      : undefined;
  return updateClips(
    p,
    trackId,
    (cs) => cs.map((c) => (c.id === clipId ? { ...c, volumeCurve: vc } : c)),
    (cs) => cs.map((c) => (c.id === clipId ? { ...c, volumeCurve: vc } : c)),
  );
}

export function setProjectRatio(
  p: VideoProject,
  width: number,
  height: number,
): VideoProject {
  return { ...p, width, height };
}

export function setBackground(
  p: VideoProject,
  background: VideoProject["background"],
): VideoProject {
  return { ...p, background };
}

/** The canvas frame (mat + rounded corners), or `undefined` to remove it. */
export function setFrame(
  p: VideoProject,
  frame: VideoProject["frame"],
): VideoProject {
  if (!frame) {
    const { frame: _drop, ...rest } = p;
    return rest as VideoProject;
  }
  return { ...p, frame };
}

// ---------------------------------------------------------------------------
// text overlays (rendered as a "caption" lane; not part of `tracks`)
// ---------------------------------------------------------------------------

/** Highest overlay layer in use (0 when there are none). */
/**
 * Stable id for the Story panel's title card. The card IS a text overlay over
 * the project background sitting in a hole opened at the head of the timeline —
 * there is no "solid colour clip" type to make a literal card out of. A fixed
 * id is what makes the toggle derive its state from the project instead of
 * local component state, so it survives closing the sheet.
 */
export const TITLE_CARD_ID = "story-title-card";
export const TITLE_CARD_SECONDS = 2;

export function titleCardOf(p: VideoProject): TextOverlay | undefined {
  return p.overlays.find((o) => o.id === TITLE_CARD_ID);
}

/** Shift every clip and overlay in time, clamping at 0. */
function shiftTimeline(p: VideoProject, by: number): VideoProject {
  const at = (v: number) => Math.max(0, v + by);
  return {
    ...mapTracks(p, (ts) =>
      ts.map((t) =>
        t.kind === "visual"
          ? { ...t, clips: t.clips.map((c) => ({ ...c, start: at(c.start) })) }
          : { ...t, clips: t.clips.map((c) => ({ ...c, start: at(c.start) })) },
      ),
    ),
    overlays: p.overlays.map((o) => ({
      ...o,
      start: at(o.start),
      end: at(o.end),
    })),
  };
}

/**
 * Open a hole at the head of the timeline and put a title caption in it. Every
 * clip and overlay moves later by `seconds` — this deliberately mutates the
 * whole timeline, so it is only reachable from an explicit toggle.
 */
export function addTitleCard(
  p: VideoProject,
  text: string,
  seconds = TITLE_CARD_SECONDS,
): VideoProject {
  if (titleCardOf(p)) return p;
  const shifted = shiftTimeline(p, seconds);
  return addOverlay(shifted, {
    id: TITLE_CARD_ID,
    type: "text",
    text,
    start: 0,
    end: seconds,
    x: 0.5,
    y: 0.5,
    fontSize: Math.round(p.height * 0.075),
    color: "#ffffff",
    align: "center",
    bold: true,
    layer: maxOverlayLayer(p) + 1,
  });
}

/** The layer captions land on, and the prefix that identifies them later. */
export const CAPTION_ID_PREFIX = "caption-";

/**
 * Replace the auto-captions with a fresh set.
 *
 * REPLACE, not append. Running this twice is the normal thing to do — you
 * re-record the voiceover, or you fix the trim and want the timings again — and
 * appending would stack two full transcripts on top of each other with no way
 * to tell which caption came from which run. Captions carry an id prefix so
 * they can be found again; a caption you have edited by hand keeps that prefix
 * and will be replaced too, which is why the sheet says so before it runs.
 *
 * `offset` is where the transcribed clip starts on the timeline: the transcript
 * is relative to the audio, the overlays are absolute.
 */
export function setAutoCaptions(
  p: VideoProject,
  lines: { text: string; start: number; end: number }[],
  offset = 0,
): VideoProject {
  const kept = p.overlays.filter((o) => !o.id.startsWith(CAPTION_ID_PREFIX));
  const layer = kept.reduce((n, o) => Math.max(n, o.layer ?? 0), 0) + 1;
  const captions: TextOverlay[] = lines.map((line, i) => ({
    id: `${CAPTION_ID_PREFIX}${i}`,
    type: "text",
    text: line.text,
    start: Math.max(0, line.start + offset),
    end: Math.max(0, line.end + offset),
    x: 0.5,
    // Low in the frame, where captions belong — clear of the safe area a phone
    // UI puts over the bottom edge.
    y: 0.82,
    fontSize: Math.round(p.height * 0.038),
    color: "#ffffff",
    align: "center",
    bold: true,
    // Captions sit over footage of unknown brightness, so they carry their own
    // legibility rather than hoping the picture behind them is dark.
    stroke: {
      color: "#000000",
      width: Math.max(2, Math.round(p.height * 0.004)),
    },
    layer,
  }));
  return { ...p, overlays: [...kept, ...captions] };
}

/** Are there auto-captions to replace or clear? */
export function hasAutoCaptions(p: VideoProject): boolean {
  return p.overlays.some((o) => o.id.startsWith(CAPTION_ID_PREFIX));
}

export function clearAutoCaptions(p: VideoProject): VideoProject {
  return {
    ...p,
    overlays: p.overlays.filter((o) => !o.id.startsWith(CAPTION_ID_PREFIX)),
  };
}

// ---------------------------------------------------------------------------
// captions as a subtitle file
// ---------------------------------------------------------------------------

/*
 * MIRRORS `packages/video/src/srt.ts`. Mobile installs outside the pnpm
 * workspace and cannot import the package, so this is a second copy — and
 * `__tests__/srt.test.ts` compares the two OUTPUTS, because a mirrored
 * implementation that nothing compares is a copy waiting to drift.
 */

/** `HH:MM:SS,mmm` — comma before the milliseconds. A period is WebVTT. */
export function srtTime(seconds: number): string {
  // Round to milliseconds ONCE, in integer space. Rounding the parts
  // separately lets 59.9996s print as 00:00:60,000, which no parser accepts.
  const total = Math.max(0, Math.round(seconds * 1000));
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60_000) % 60;
  const h = Math.floor(total / 3_600_000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(h)}:${p2(m)}:${p2(s)},${String(ms).padStart(3, "0")}`;
}

/*
 * SRT has no escaping: a BLANK LINE is what ends a cue. Text carrying one would
 * split into a cue plus a fragment the parser reads as the next cue's index,
 * and every caption after it shifts. Interior breaks are meaningful — they are
 * how a two-line caption is written — so only the empty lines go.
 */
function cueText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n");
}

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/**
 * The overlays that can become cues, in the order they play — sorted by time,
 * not by array order, which is layer order and would jump around.
 *
 * Overlapping cues are left overlapping: SRT permits them, and quietly
 * retiming captions someone placed deliberately is worse than a player
 * stacking two lines.
 */
export function captionCues(overlays: readonly TextOverlay[]): Cue[] {
  return overlays
    .map((o) => ({
      start: Math.max(0, o.start),
      end: Math.max(0, o.end),
      text: cueText(o.text ?? ""),
    }))
    .filter((c) => c.text !== "" && c.end > c.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * The whole file, empty when there is nothing to write.
 *
 * EVERY text overlay travels, not only the machine-written ones: the
 * `caption-` prefix is bookkeeping so a second transcription knows what it may
 * replace, not a category the user chose.
 */
export function toSRT(p: VideoProject): string {
  const cues = captionCues(p.overlays ?? []);
  if (!cues.length) return "";
  return (
    cues
      .map(
        (c, i) =>
          `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}`,
      )
      .join("\n\n") + "\n"
  );
}

/** Is there anything a subtitle file could contain? */
export function hasCaptionText(p: VideoProject): boolean {
  return captionCues(p.overlays ?? []).length > 0;
}

/** A filename the OS will accept from a project title someone typed. */
export function captionFileName(projectName: string): string {
  const base = (projectName || "")
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    // A leading dot makes a hidden file, and a name that is nothing but dots
    // is a directory reference rather than a file.
    .replace(/^[. ]+/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 60)
    .trim();
  return `${base || "captions"}.srt`;
}

/** Remove the title card and pull the timeline back by exactly its length. */
export function removeTitleCard(p: VideoProject): VideoProject {
  const card = titleCardOf(p);
  if (!card) return p;
  const seconds = card.end - card.start;
  return shiftTimeline(removeOverlay(p, TITLE_CARD_ID), -seconds);
}

export function maxOverlayLayer(p: VideoProject): number {
  return p.overlays.reduce((m, o) => Math.max(m, o.layer ?? 0), 0);
}

/**
 * Sort overlays by layer ascending (stable within a layer). Keeping the array in
 * paint order (bottom→top) means Preview and export need no z-order logic — they
 * already draw overlays in array order.
 */
function sortByLayer(overlays: TextOverlay[]): TextOverlay[] {
  return overlays
    .map((o, i) => ({ o, i }))
    .sort((a, b) => (a.o.layer ?? 0) - (b.o.layer ?? 0) || a.i - b.i)
    .map((x) => x.o);
}

export function addOverlay(
  p: VideoProject,
  overlay: TextOverlay,
): VideoProject {
  return { ...p, overlays: sortByLayer([...p.overlays, overlay]) };
}

export function removeOverlay(p: VideoProject, id: string): VideoProject {
  return { ...p, overlays: p.overlays.filter((o) => o.id !== id) };
}

/** Remove a caption and close its interval for later captions on the same layer. */
export function rippleDeleteOverlay(p: VideoProject, id: string): VideoProject {
  const target = p.overlays.find((overlay) => overlay.id === id);
  if (!target) return p;
  const duration = target.end - target.start;
  const layer = target.layer ?? 0;

  return {
    ...p,
    overlays: p.overlays
      .filter((overlay) => overlay.id !== id)
      .map((overlay) =>
        (overlay.layer ?? 0) === layer && overlay.start >= target.end - 0.001
          ? {
              ...overlay,
              start: Math.max(target.start, overlay.start - duration),
              end: Math.max(target.start, overlay.end - duration),
            }
          : overlay,
      ),
  };
}

export function updateOverlay(
  p: VideoProject,
  id: string,
  patch: Partial<TextOverlay>,
): VideoProject {
  return {
    ...p,
    overlays: p.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)),
  };
}

/** Move an overlay to an absolute stacking lane (clamped ≥ 0); re-sorts by layer. */
export function setOverlayLayer(
  p: VideoProject,
  id: string,
  layer: number,
): VideoProject {
  const clamped = Math.max(0, Math.round(layer));
  return {
    ...p,
    overlays: sortByLayer(
      p.overlays.map((o) => (o.id === id ? { ...o, layer: clamped } : o)),
    ),
  };
}
