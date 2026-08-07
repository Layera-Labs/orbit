import type { VideoProject } from './types';
import { OVERLAP_SCHEMA } from './migrate-overlap';

/**
 * Create a project with sensible defaults; `width`/`height` are required.
 *
 * It takes a `Partial<VideoProject>`, so it has to carry EVERY field of one.
 * It did not: `tracks` and `frame` were dropped on the floor, silently, while
 * the signature said they were accepted. A caller building a multi-track
 * project got back one with no clips and no audio, which renders perfectly —
 * as captions over a background, for the right duration, with no picture and
 * no sound. Nothing errors, and the output is plausible enough to be blamed on
 * the media.
 *
 * Found by the Phase 0 pipeline spike, which is exactly the sort of thing a
 * spike is for: every existing caller predates `tracks` and passes `clips`, so
 * the gap had never been reachable before.
 */
export function createProject(
  opts: Partial<VideoProject> & Pick<VideoProject, 'width' | 'height'>,
): VideoProject {
  return {
    id: opts.id ?? 'project',
    /*
     * A project born WITH tracks is born at the current schema. It cannot need
     * the overlap migration — it has no transitions to reinterpret — so
     * stamping it 1 would only invite a migration pass that must not change it.
     * Without tracks the answer stays 1, so every existing caller is unaffected.
     */
    schemaVersion: opts.schemaVersion ?? (opts.tracks?.length ? OVERLAP_SCHEMA : 1),
    width: opts.width,
    height: opts.height,
    fps: opts.fps ?? 30,
    background: opts.background ?? { type: 'color', color: '#000000' },
    clips: opts.clips ?? [],
    transition: opts.transition,
    overlays: opts.overlays ?? [],
    audio: opts.audio ?? [],
    ...(opts.tracks ? { tracks: opts.tracks } : {}),
    ...(opts.frame ? { frame: opts.frame } : {}),
  };
}

/** Crossfade duration between clips, or 0 for hard cuts. */
export function transitionDuration(p: VideoProject): number {
  const t = p.transition;
  return t && t.type === 'fade' && t.duration > 0 ? t.duration : 0;
}

/**
 * Total timeline duration in seconds. Clips play sequentially; crossfades
 * overlap adjacent clips, so each transition shortens the total by its duration.
 */
export function projectDuration(p: VideoProject): number {
  // Multi-track: every clip has an absolute start, so duration is the latest end.
  if (p.tracks?.length) {
    let d = 0;
    for (const t of p.tracks) for (const c of t.clips) d = Math.max(d, c.start + c.duration);
    for (const o of p.overlays) d = Math.max(d, o.end);
    return d;
  }
  // Legacy single track: clips play sequentially, crossfades overlap.
  let visual = 0;
  if (p.clips.length) {
    const total = p.clips.reduce((s, c) => s + c.duration, 0);
    visual = total - transitionDuration(p) * Math.max(0, p.clips.length - 1);
  }
  let d = visual;
  for (const o of p.overlays) d = Math.max(d, o.end);
  for (const a of p.audio) d = Math.max(d, a.start + (a.duration ?? 0));
  return d;
}
