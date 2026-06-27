/**
 * Pure multi-track timeline mutations over a `VideoProject` (v2 `tracks`).
 *
 * Visual tracks stack bottom→top (array order = z-order); every clip has an
 * ABSOLUTE `start` on the timeline and (for visual clips) a normalized `rect`
 * placement. Audio tracks mix. Every function returns a NEW project.
 */
import type {
  AudioTrack,
  AudioTrackClip,
  ChromaKey,
  ClipFilter,
  ClipMask,
  Keyframe,
  Motion,
  Rect,
  TextOverlay,
  Track,
  Transition,
  VideoProject,
  VisualTrack,
  VisualTrackClip,
} from './types';

export const MIN_CLIP = 0.1;

let _seq = 0;
export function newId(prefix = 'c'): string {
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
export function clipAtTime(track: Track, sec: number): VisualTrackClip | AudioTrackClip | undefined {
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
    return c.type === 'video'
      ? { id: c.id, type: 'video', src: c.src, start, duration: c.duration, trimIn: c.trimIn, volume: c.volume, muted: c.muted }
      : { id: c.id, type: 'image', src: c.src, start, duration: c.duration };
  });
  const tracks: Track[] = [{ id: newId('trk'), kind: 'visual', name: 'Main', clips: visual }];
  if (p.audio?.length) {
    tracks.push({
      id: newId('trk'),
      kind: 'audio',
      name: 'Audio',
      clips: p.audio.map((a) => ({ id: a.id, src: a.src, start: a.start ?? 0, duration: a.duration ?? Math.max(MIN_CLIP, acc - (a.start ?? 0)), trimIn: a.trimIn, volume: a.volume })),
    });
  }
  return { ...p, schemaVersion: 2, tracks };
}

/** A fresh project with one empty visual (main) track. */
export function newProjectTracks(): Track[] {
  return [{ id: newId('trk'), kind: 'visual', name: 'Main', clips: [] }];
}

// ---------------------------------------------------------------------------
// internal helpers
// ---------------------------------------------------------------------------

function mapTracks(p: VideoProject, fn: (tracks: Track[]) => Track[]): VideoProject {
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
      return t.kind === 'visual' ? { ...t, clips: fnV(t.clips) } : { ...t, clips: fnA(t.clips) };
    }),
  );
}

// ---------------------------------------------------------------------------
// track ops
// ---------------------------------------------------------------------------

export function addTrack(p: VideoProject, kind: 'visual' | 'audio', id = newId('trk')): VideoProject {
  const track: Track =
    kind === 'visual' ? { id, kind: 'visual', clips: [] } : { id, kind: 'audio', clips: [] };
  return mapTracks(p, (ts) => [...ts, track]);
}

/** Remove a track entirely. Keeps at least one visual track. */
export function removeTrack(p: VideoProject, trackId: string): VideoProject {
  const ts = (p.tracks ?? []).filter((t) => t.id !== trackId);
  if (!ts.some((t) => t.kind === 'visual')) ts.unshift({ id: newId('trk'), kind: 'visual', clips: [] });
  return { ...p, tracks: ts };
}

/** Drop any empty visual track that isn't the base (keeps the timeline tidy). */
export function pruneEmptyTracks(p: VideoProject): VideoProject {
  const ts = p.tracks ?? [];
  const kept = ts.filter((t, i) => t.clips.length > 0 || (t.kind === 'visual' && i === 0));
  return { ...p, tracks: kept.length ? kept : newProjectTracks() };
}

// ---------------------------------------------------------------------------
// clip ops
// ---------------------------------------------------------------------------

export function addVisualClip(p: VideoProject, trackId: string, clip: VisualTrackClip): VideoProject {
  return updateClips(p, trackId, (cs) => [...cs, clip], (cs) => cs);
}

export function addAudioClip(p: VideoProject, trackId: string, clip: AudioTrackClip): VideoProject {
  return updateClips(p, trackId, (cs) => cs, (cs) => [...cs, clip]);
}

export function removeClip(p: VideoProject, trackId: string, clipId: string): VideoProject {
  return updateClips(
    p,
    trackId,
    (cs) => cs.filter((c) => c.id !== clipId),
    (cs) => cs.filter((c) => c.id !== clipId),
  );
}

/** Move a clip's absolute start (drag in time). */
export function setClipStart(p: VideoProject, trackId: string, clipId: string, start: number): VideoProject {
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
  if (!from || !to || from.kind !== to.kind || fromTrackId === toTrackId) return p;
  const clip = from.clips.find((c) => c.id === clipId);
  if (!clip) return p;
  const moved = { ...clip, start: Math.max(0, newStart ?? clip.start) };
  return mapTracks(p, (ts) =>
    ts.map((t) => {
      if (t.id === fromTrackId) {
        return t.kind === 'visual'
          ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
          : { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
      }
      if (t.id === toTrackId) {
        return t.kind === 'visual'
          ? { ...t, clips: [...t.clips, moved as VisualTrackClip] }
          : { ...t, clips: [...t.clips, moved as AudioTrackClip] };
      }
      return t;
    }),
  );
}

/** Split the clip at absolute time `atSec` into two adjacent clips. */
export function splitClipAt(p: VideoProject, trackId: string, clipId: string, atSec: number): VideoProject {
  const splitOne = <C extends VisualTrackClip | AudioTrackClip>(c: C): C[] => {
    if (c.id !== clipId) return [c];
    const local = atSec - c.start;
    if (local <= MIN_CLIP || local >= c.duration - MIN_CLIP) return [c];
    const trimIn = c.trimIn ?? 0;
    const first = { ...c, duration: local } as C;
    const second = {
      ...c,
      id: newId(c.start >= 0 ? 'c' : 'c'),
      start: c.start + local,
      duration: c.duration - local,
      trimIn: trimIn + local,
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
    const start = patch.start !== undefined ? Math.max(0, patch.start) : c.start;
    const trimIn = patch.trimIn !== undefined ? Math.max(0, patch.trimIn) : c.trimIn;
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
export function setClipRect(p: VideoProject, trackId: string, clipId: string, rect: Rect): VideoProject {
  return updateClips(
    p,
    trackId,
    (cs) => cs.map((c) => (c.id === clipId ? { ...c, rect } : c)),
    (cs) => cs,
  );
}

function patchVisualClip(p: VideoProject, trackId: string, clipId: string, patch: Partial<VisualTrackClip>): VideoProject {
  return updateClips(
    p,
    trackId,
    (cs) => cs.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
    (cs) => cs,
  );
}

export function setClipFilter(p: VideoProject, trackId: string, clipId: string, filter: ClipFilter | undefined): VideoProject {
  return patchVisualClip(p, trackId, clipId, { filter });
}

export function setClipBlur(p: VideoProject, trackId: string, clipId: string, blur: number): VideoProject {
  return patchVisualClip(p, trackId, clipId, { blur: Math.max(0, Math.min(1, blur)) });
}

export function setClipOpacity(p: VideoProject, trackId: string, clipId: string, opacity: number): VideoProject {
  return patchVisualClip(p, trackId, clipId, { opacity: Math.max(0, Math.min(1, opacity)) });
}

export function setClipMask(p: VideoProject, trackId: string, clipId: string, mask: ClipMask | undefined): VideoProject {
  return patchVisualClip(p, trackId, clipId, { mask });
}

export function setClipSpeed(p: VideoProject, trackId: string, clipId: string, speed: number): VideoProject {
  return patchVisualClip(p, trackId, clipId, { speed: Math.max(0.25, Math.min(4, speed)) });
}

export function setClipMotion(p: VideoProject, trackId: string, clipId: string, motion: Motion | undefined): VideoProject {
  return patchVisualClip(p, trackId, clipId, { motion: motion && motion.type !== 'none' ? motion : undefined });
}

export function setClipCutout(p: VideoProject, trackId: string, clipId: string, cutout: ChromaKey | undefined): VideoProject {
  return patchVisualClip(p, trackId, clipId, { cutout: cutout && cutout.color ? cutout : undefined });
}

export function setClipKeyframes(p: VideoProject, trackId: string, clipId: string, keyframes: Keyframe[] | undefined): VideoProject {
  const kfs = keyframes && keyframes.length ? [...keyframes].sort((a, b) => a.t - b.t) : undefined;
  return patchVisualClip(p, trackId, clipId, { keyframes: kfs });
}

export function setClipTransition(p: VideoProject, trackId: string, clipId: string, transitionIn: Transition | undefined): VideoProject {
  return patchVisualClip(p, trackId, clipId, { transitionIn });
}

/** Set volume on a visual (video) OR audio clip — patches whichever lane holds it. */
export function setClipVolume(p: VideoProject, trackId: string, clipId: string, volume: number): VideoProject {
  const v = Math.max(0, Math.min(2, volume));
  return updateClips(
    p,
    trackId,
    (cs) => cs.map((c) => (c.id === clipId ? { ...c, volume: v } : c)),
    (cs) => cs.map((c) => (c.id === clipId ? { ...c, volume: v } : c)),
  );
}

export function setProjectRatio(p: VideoProject, width: number, height: number): VideoProject {
  return { ...p, width, height };
}

// ---------------------------------------------------------------------------
// text overlays (rendered as a "caption" lane; not part of `tracks`)
// ---------------------------------------------------------------------------

export function addOverlay(p: VideoProject, overlay: TextOverlay): VideoProject {
  return { ...p, overlays: [...p.overlays, overlay] };
}

export function removeOverlay(p: VideoProject, id: string): VideoProject {
  return { ...p, overlays: p.overlays.filter((o) => o.id !== id) };
}

export function updateOverlay(p: VideoProject, id: string, patch: Partial<TextOverlay>): VideoProject {
  return { ...p, overlays: p.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) };
}
