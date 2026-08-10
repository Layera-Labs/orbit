/**
 * The exhaustive list of project fields the render service validates.
 *
 * Mirrors `collectClientSrcs` in `services/render/src/resolve.ts`. It is
 * duplicated rather than imported because the service is a Node app outside this
 * app's bundle graph; if a new src-bearing field is ever added to the model,
 * BOTH copies have to learn about it or an export will fail validation.
 */
import type { VideoProject } from '@layera-labs/orbit-video/browser';

export function collectClientSrcs(project: VideoProject): unknown[] {
  return [
    ...(project.clips ?? []).map((c) => c?.src),
    ...(project.audio ?? []).map((a) => a?.src),
    ...(project.tracks ?? []).flatMap((t) => (t?.clips ?? []).map((c) => c?.src)),
    ...(project.background?.type === 'image' ? [project.background.src] : []),
  ];
}
