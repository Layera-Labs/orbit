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
    overlays: opts.overlays ?? [],
    audio: opts.audio ?? [],
  };
}

/** Total timeline duration in seconds (the latest end across clips/overlays/audio). */
export function projectDuration(p: VideoProject): number {
  let d = 0;
  for (const c of p.clips) d = Math.max(d, c.start + c.duration);
  for (const o of p.overlays) d = Math.max(d, o.end);
  for (const a of p.audio) d = Math.max(d, a.start + (a.duration ?? 0));
  return d;
}
