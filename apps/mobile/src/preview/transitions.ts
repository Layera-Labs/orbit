/**
 * The fade a boundary falls back to when it cannot overlap.
 *
 * This module used to BE the transition system: every boundary produced a
 * fade-out on the outgoing clip and a fade-in on the incoming one, through the
 * background, and every non-`cut` type collapsed into that because the export
 * had nothing else on this path. `xfade.ts` now owns the boundary, the clips
 * overlap, and a transition is a real one.
 *
 * What is left here is the case a crossfade cannot cover: a clip with nothing
 * before it, and two clips that do not touch. Both really do want a ramp
 * through the background — there is nothing to cross-fade WITH — so this keeps
 * doing exactly what it did, for exactly those two cases. `resolveTransitions`
 * decides which they are; this only turns its answer into windows.
 *
 * `fadeFactorAt` stays public and unchanged: `elementAnim.ts` delegates an
 * element's own fade to it so that a clip's entrance and a boundary's fade are
 * provably the same ramp rather than two that have to be kept in step.
 *
 * VENDORED from `packages/video/src/transitions.ts` — mobile installs outside
 * the pnpm workspace. `__tests__/transitions.test.ts` compares the OUTPUTS of
 * the two copies; it is what makes the arrangement safe.
 */
import type { VideoProject, VisualTrack, VisualTrackClip } from '../model/types';
import { resolveTransitions } from './xfade';

export interface ClipFade {
  /** Fade-in duration in seconds (0 = none). */
  fin: number;
  /** Fade-out duration in seconds (0 = none). */
  fout: number;
}

/**
 * clip id → fade window, for the boundaries `resolveTransitions` could not
 * overlap.
 *
 * The pair is kept: a clip after a gap fades UP from the background and the one
 * before it fades DOWN into it, which is what the engine has always emitted and
 * what the gap actually looks like. A clip with no predecessor gets the fade-in
 * alone, there being nothing behind it to fade out.
 */
export function buildEdgeFadeMap(clips: VisualTrackClip[]): Map<string, ClipFade> {
  const map = new Map<string, ClipFade>();
  const put = (id: string, patch: Partial<ClipFade>) => {
    const cur = map.get(id) ?? { fin: 0, fout: 0 };
    map.set(id, { ...cur, ...patch });
  };
  for (const e of resolveTransitions(clips).edges) {
    put(e.clipId, { fin: e.duration });
    const prev = clips[e.index - 1];
    if (prev) put(prev.id, { fout: e.duration });
  }
  return map;
}

/** The main track's edge fades for a whole project (empty when there are no tracks). */
export function projectEdgeFadeMap(project: VideoProject): Map<string, ClipFade> {
  const main = (project.tracks ?? []).find(
    (t): t is VisualTrack => t.kind === 'visual',
  );
  return buildEdgeFadeMap(main?.clips ?? []);
}

/**
 * The alpha multiplier a fade contributes at timeline time `t`, in 0..1.
 *
 * Matches `fade=t=in:st=S:d=fin:alpha=1` (0→1 across `[S, S+fin]`) and
 * `fade=t=out:st=E-fout:d=fout:alpha=1` (1→0 across `[E-fout, E]`).
 */
export function fadeFactorAt(
  fade: ClipFade | undefined,
  start: number,
  end: number,
  t: number,
): number {
  if (!fade) return 1;
  let a = 1;
  if (fade.fin > 0 && t < start + fade.fin)
    a = Math.min(a, Math.max(0, (t - start) / fade.fin));
  if (fade.fout > 0 && t > end - fade.fout)
    a = Math.min(a, Math.max(0, (end - t) / fade.fout));
  return Math.max(0, Math.min(1, a));
}
