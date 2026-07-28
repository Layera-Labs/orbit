/**
 * Transition (fade-through-black) resolution, shared by export and preview.
 *
 * Extracted from `buildMultiTrackArgs`, which computed this inline. Two things
 * about the multi-track path are deliberate and BOTH must be reproduced by any
 * preview:
 *
 *  1. Transitions apply only to the MAIN (first visual) track. Clips on higher
 *     tracks never fade.
 *  2. Every non-`cut` transition type — `slide`, `wipe`, `zoom`, `dissolve` —
 *     collapses to a fade. The export has no wipe implementation on this path,
 *     so a preview that drew a real wipe would look BETTER than the file the
 *     user actually gets. That is the more damaging direction of drift.
 */
import type { VideoProject, VisualTrack, VisualTrackClip } from './types';

export interface ClipFade {
  /** Fade-in duration in seconds (0 = none). */
  fin: number;
  /** Fade-out duration in seconds (0 = none). */
  fout: number;
}

/**
 * clip id → fade window, for the main track only. A clip's own `transitionIn`
 * fades it in; the NEXT clip's `transitionIn` fades this one out, so the two
 * cross at the boundary.
 */
export function buildFadeMap(clips: VisualTrackClip[]): Map<string, ClipFade> {
  const map = new Map<string, ClipFade>();
  clips.forEach((c, i) => {
    const fin =
      c.transitionIn && c.transitionIn.type !== 'cut' ? c.transitionIn.duration : 0;
    const next = clips[i + 1];
    const fout =
      next?.transitionIn && next.transitionIn.type !== 'cut'
        ? next.transitionIn.duration
        : 0;
    if (fin || fout) map.set(c.id, { fin, fout });
  });
  return map;
}

/** The main track's fade map for a whole project (empty when there are no tracks). */
export function projectFadeMap(project: VideoProject): Map<string, ClipFade> {
  const main = (project.tracks ?? []).find(
    (t): t is VisualTrack => t.kind === 'visual',
  );
  return buildFadeMap(main?.clips ?? []);
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
