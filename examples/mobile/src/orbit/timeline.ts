/**
 * Timeline arithmetic — pure functions over the project model.
 *
 * Nothing here touches React, the network or the filesystem, which is the
 * point: this is the layer the editor UI is a thin shell over, and it is the
 * layer worth having tests for. `src/orbit/__tests__/timeline.test.ts` runs
 * them under Vitest with no simulator involved.
 *
 * **One deliberate simplification.** Every operation here re-packs the track
 * end-to-end from zero, so clips are always butted together. The real editor
 * pointedly does NOT do that: packing destroys any gap the user placed on
 * purpose, so closing a hole there is a separate, explicitly-chosen edit
 * (`rippleDeleteClip`). This example has no way to author a gap, so packing is
 * correct here and would be a bug there.
 */
import type { VideoProject, VisualTrack, VisualTrackClip } from './types';

/** The shortest a clip may be trimmed to. Below this it cannot be grabbed again. */
export const MIN_CLIP = 0.2;

/** How long a still is shown for when it lands on the timeline. */
export const IMAGE_DURATION = 3;

let counter = 0;
const nextId = (prefix: string): string => `${prefix}-${++counter}`;

/** Reset the id counter. Tests only — ids are otherwise per-process. */
export function __resetIds(): void {
  counter = 0;
}

export interface MediaAsset {
  uri: string;
  type: 'video' | 'image';
  /** Source length in seconds. Absent for stills, and for a video the picker
   *  could not measure — in which case it is treated as untrimmable past its
   *  timeline length. */
  durationSec?: number;
}

/** A project with one empty visual track, at the given output size. */
export function newProject(width: number, height: number, fps = 30): VideoProject {
  return {
    id: nextId('project'),
    schemaVersion: 3,
    width,
    height,
    fps,
    background: { type: 'color', color: '#000000' },
    // The legacy single-track fields. Required, and deliberately empty: the
    // renderer reads `tracks` when it is present and these when it is not.
    clips: [],
    overlays: [],
    audio: [],
    tracks: [{ id: nextId('track'), kind: 'visual', name: 'Video', clips: [] }],
  };
}

export const visualTrack = (project: VideoProject): VisualTrack =>
  project.tracks.find((t): t is VisualTrack => t.kind === 'visual') ??
  ({ id: 'missing', kind: 'visual', clips: [] } as VisualTrack);

export const clipsOf = (project: VideoProject): VisualTrackClip[] => visualTrack(project).clips;

/** Replace the visual track's clips, packed, leaving everything else alone. */
export function withClips(project: VideoProject, clips: VisualTrackClip[]): VideoProject {
  const packed = pack(clips);
  return {
    ...project,
    tracks: project.tracks.map((t) => (t.kind === 'visual' ? { ...t, clips: packed } : t)),
  };
}

/** Lay a track end-to-end from zero, preserving array order. */
export function pack(clips: readonly VisualTrackClip[]): VisualTrackClip[] {
  let cursor = 0;
  return clips.map((c) => {
    const next = { ...c, start: cursor };
    cursor += c.duration;
    return next;
  });
}

export const totalDuration = (clips: readonly VisualTrackClip[]): number =>
  clips.reduce((sum, c) => sum + c.duration, 0);

/**
 * Which clip is on screen at time `t`.
 *
 * The end of a clip belongs to the NEXT clip — `[start, start + duration)` —
 * which is what makes a cut land on exactly one frame. The one exception is the
 * end of the timeline, where there is no next clip and scrubbing to the last
 * pixel should show the last frame rather than nothing.
 */
export function clipAt(clips: readonly VisualTrackClip[], t: number): VisualTrackClip | null {
  if (clips.length === 0) return null;
  if (t >= totalDuration(clips)) return clips[clips.length - 1];
  if (t < 0) return null;
  return clips.find((c) => t >= c.start && t < c.start + c.duration) ?? null;
}

/** Turn picked media into a clip. Stills get a fixed on-screen length. */
export function clipFromAsset(asset: MediaAsset): VisualTrackClip {
  const duration =
    asset.type === 'image' ? IMAGE_DURATION : Math.max(MIN_CLIP, asset.durationSec ?? IMAGE_DURATION);
  return {
    id: nextId('clip'),
    type: asset.type,
    src: asset.uri,
    start: 0, // `pack` assigns the real one.
    duration,
    trimIn: 0,
  };
}

export const addClips = (project: VideoProject, assets: readonly MediaAsset[]): VideoProject =>
  withClips(project, [...clipsOf(project), ...assets.map(clipFromAsset)]);

export const removeClip = (project: VideoProject, id: string): VideoProject =>
  withClips(
    project,
    clipsOf(project).filter((c) => c.id !== id),
  );

/** Move a clip one place earlier (-1) or later (+1). A no-op at either end. */
export function moveClip(project: VideoProject, id: string, direction: -1 | 1): VideoProject {
  const clips = [...clipsOf(project)];
  const i = clips.findIndex((c) => c.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= clips.length) return project;
  [clips[i], clips[j]] = [clips[j], clips[i]];
  return withClips(project, clips);
}

/**
 * Drag one edge of a clip by `deltaSec`.
 *
 * The two edges are not symmetric, and conflating them is the classic trim bug:
 *
 * - **`out`** changes how long the clip plays for. Only `duration` moves.
 * - **`in`** changes WHERE IN THE SOURCE it starts. `trimIn` and `duration`
 *   move together and in opposite directions, so the frame under the right-hand
 *   edge does not shift while the left one is dragged.
 *
 * Both are clamped so a clip can never be shorter than `MIN_CLIP`, never start
 * before the beginning of its source, and never run past the end of it. A clip
 * whose source length is unknown is treated as untrimmable past its current
 * timeline length — better than letting it run into black.
 */
export function trimClip(
  project: VideoProject,
  id: string,
  edge: 'in' | 'out',
  deltaSec: number,
  sourceDurationOf: (src: string) => number | undefined,
): VideoProject {
  return withClips(
    project,
    clipsOf(project).map((c) => {
      if (c.id !== id) return c;
      const trimIn = c.trimIn ?? 0;
      // A still has no source length to run out of; it can be held as long as
      // you like. A video is bounded by what is actually in the file.
      const source = c.type === 'image' ? Infinity : sourceDurationOf(c.src);
      const available = source ?? trimIn + c.duration;

      if (edge === 'out') {
        const max = Math.max(MIN_CLIP, available - trimIn);
        return { ...c, duration: clamp(c.duration + deltaSec, MIN_CLIP, max) };
      }

      /*
       * Clamp the DURATION and derive the shift, not the other way round.
       * Clamping the shift first and subtracting it lands a hair off the
       * minimum in binary floating point (5 − 4.8 is 0.20000000000000018), so
       * a clip dragged fully closed is not quite `MIN_CLIP` and the two edges
       * disagree about the same limit.
       */
      const next = clamp(c.duration - deltaSec, MIN_CLIP, trimIn + c.duration);
      return { ...c, trimIn: trimIn + (c.duration - next), duration: next };
    }),
  );
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** `12.4` → `0:12.4`. Seconds are shown to a tenth; a timeline is not a clock. */
export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = safe - mins * 60;
  return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
}
