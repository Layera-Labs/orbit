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
  Rect,
  VolumePoint,
  TextOverlay,
  Track,
  Transition,
  VideoProject,
  VisualTrackClip,
} from "./types";

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

/** The clip on `track` occupying absolute time `sec`, if any. */
export function clipAtTime(
  track: Track,
  sec: number,
): VisualTrackClip | AudioTrackClip | undefined {
  return track.clips.find((c) => sec >= c.start && sec < c.start + c.duration);
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
    (cs) => [...cs, clip].sort((a, b) => a.start - b.start),
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

  const ripple = <T extends VisualTrackClip | AudioTrackClip>(clips: T[]) =>
    clips
      .filter((clip) => clip.id !== clipId)
      .map((clip) =>
        clip.start >= end - 0.001
          ? {
              ...clip,
              start: Math.max(target.start, clip.start - target.duration),
            }
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
  return updateClips(
    p,
    trackId,
    (cs) => cs.map((c) => (c.id === clipId ? { ...c, start: s } : c)),
    (cs) => cs.map((c) => (c.id === clipId ? { ...c, start: s } : c)),
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
          ? { ...t, clips: [...t.clips, moved as VisualTrackClip] }
          : { ...t, clips: [...t.clips, moved as AudioTrackClip] };
      }
      return t;
    }),
  );
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

export function setClipTransition(
  p: VideoProject,
  trackId: string,
  clipId: string,
  transitionIn: Transition | undefined,
): VideoProject {
  return patchVisualClip(p, trackId, clipId, { transitionIn });
}

/** Set volume on a visual (video) OR audio clip — patches whichever lane holds it. */
export function setClipVolume(
  p: VideoProject,
  trackId: string,
  clipId: string,
  volume: number,
): VideoProject {
  const v = Math.max(0, Math.min(2, volume));
  return updateClips(
    p,
    trackId,
    (cs) => cs.map((c) => (c.id === clipId ? { ...c, volume: v } : c)),
    (cs) => cs.map((c) => (c.id === clipId ? { ...c, volume: v } : c)),
  );
}

/** Set a volume envelope on a visual (video) OR audio clip. Clears when < 2 points. */
export function setClipVolumeCurve(
  p: VideoProject,
  trackId: string,
  clipId: string,
  curve: VolumePoint[] | undefined,
): VideoProject {
  const vc = curve && curve.length >= 2 ? curve : undefined;
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

// ---------------------------------------------------------------------------
// text overlays (rendered as a "caption" lane; not part of `tracks`)
// ---------------------------------------------------------------------------

/** Highest overlay layer in use (0 when there are none). */
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
