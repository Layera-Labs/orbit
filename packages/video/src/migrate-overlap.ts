/**
 * The one-time migration from a fade-through-background to a real crossfade.
 *
 * Before this, a transition cost `2 × duration` of wall time and the clips
 * either side of it stayed butt-joined: A ramped to the background over its
 * last `d`, then B ramped up over its first `d`. A crossfade needs both clips
 * on screen at once, so B now starts `d` seconds BEFORE A ends — and the
 * project gets shorter by exactly the sum of its transitions.
 *
 * **A stored project therefore renders differently after this, and shorter.**
 * That is not something to apologise for or to work around: a transition that
 * costs twice its own duration and one that costs none of it cannot both be
 * "the half-second fade" the user asked for. The number in the sheet is
 * honoured; the length of the video is what changes.
 *
 * The hard part is everything that is NOT on the main track. Captions, music,
 * voiceover and picture-in-picture clips are all addressed in absolute seconds,
 * so pulling the main track's later clips earlier without moving them would
 * slide the whole mix off the picture. Each is moved by the shift accumulated
 * up to ITS OWN start, so a caption over the third clip stays over the third
 * clip and a music cue placed against a beat keeps the same distance from the
 * cut it was placed against.
 *
 * Run once, on open, and stamped with `schemaVersion: 3` so it cannot run
 * twice — running twice would pull everything back a second time.
 */
import type {
  AudioTrack,
  Overlay,
  Track,
  VideoProject,
  VisualTrack,
  VisualTrackClip,
} from './types';
import { requestedOverlap } from './xfade';

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The version this migration produces. */
export const OVERLAP_SCHEMA = 3 as const;

/**
 * Cumulative seconds removed from the timeline at or before absolute time `t`.
 *
 * A step function: it rises by one transition's overlap at the point that
 * transition begins, and is flat everywhere else. Reading it at an element's
 * own start is what keeps that element in the same place relative to the
 * picture around it.
 */
function shiftAt(steps: { at: number; by: number }[], t: number): number {
  let acc = 0;
  for (const s of steps) {
    if (t >= s.at - 0.001) acc += s.by;
    else break;
  }
  return acc;
}

/**
 * Migrate a project onto overlapping transitions.
 *
 * A no-op — returned by identity — for a project already at this version, and
 * for one whose main track has no transition on it, which is almost all of
 * them: the picker has only ever offered Cut and Fade.
 */
export function migrateTransitionOverlap(p: VideoProject): VideoProject {
  if ((p.schemaVersion as number) >= OVERLAP_SCHEMA) return p;
  const tracks = p.tracks ?? [];
  const main = tracks.find((t): t is VisualTrack => t.kind === 'visual');
  if (!main || main.clips.length < 2)
    return { ...p, schemaVersion: OVERLAP_SCHEMA };

  /*
   * Walk the main track in time order, laying each clip back over the one
   * before it. `requestedOverlap` is the same function the packer uses, so a
   * migrated project is laid out exactly as a freshly packed one — there is no
   * second definition of what a transition does to the geometry.
   */
  const sorted = [...main.clips].sort((a, b) => a.start - b.start);
  const steps: { at: number; by: number }[] = [];
  const moved: VisualTrackClip[] = [];
  let shift = 0;
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const ov = requestedOverlap(sorted[i - 1], c);
    if (ov > 0) {
      shift = r3(shift + ov);
      // The overlap is taken from where the clip USED to start, because that
      // is the point everything downstream was placed relative to.
      steps.push({ at: c.start, by: ov });
    }
    moved.push({ ...c, start: r3(c.start - shift) });
  }
  if (shift === 0)
    return { ...p, schemaVersion: OVERLAP_SCHEMA };

  const byId = new Map(moved.map((c) => [c.id, c]));
  const nextTracks: Track[] = tracks.map((t) => {
    if (t === main)
      return { ...t, clips: main.clips.map((c) => byId.get(c.id) ?? c) };
    if (t.kind === 'visual')
      return {
        ...t,
        clips: t.clips.map((c) => ({ ...c, start: r3(c.start - shiftAt(steps, c.start)) })),
      };
    return {
      ...(t as AudioTrack),
      clips: (t as AudioTrack).clips.map((c) => ({
        ...c,
        start: r3(c.start - shiftAt(steps, c.start)),
      })),
    };
  });

  const overlays: Overlay[] = p.overlays.map((o) => {
    /*
     * An overlay is moved by the shift at its START and its END is moved by the
     * same amount, not by the shift at its own end. Using each would stretch or
     * squash a caption that happens to span a transition — its duration is a
     * thing the user set, and a migration has no business changing it.
     */
    const d = shiftAt(steps, o.start);
    return { ...o, start: r3(o.start - d), end: r3(o.end - d) };
  });

  return {
    ...p,
    schemaVersion: OVERLAP_SCHEMA,
    tracks: nextTracks,
    overlays,
  };
}
