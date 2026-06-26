import type { VideoProject } from './types';

/** Create a project with sensible defaults; `width`/`height` are required. */
export function createProject(
  opts: Partial<VideoProject> & Pick<VideoProject, 'width' | 'height'>,
): VideoProject {
  return {
    id: opts.id ?? 'project',
    schemaVersion: 1,
    width: opts.width,
    height: opts.height,
    fps: opts.fps ?? 30,
    background: opts.background ?? { type: 'color', color: '#000000' },
    clips: opts.clips ?? [],
    transition: opts.transition,
    overlays: opts.overlays ?? [],
    audio: opts.audio ?? [],
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
