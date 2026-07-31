/**
 * Mirror of `packages/video/src/transitions.ts`.
 *
 * The preview used to compute this inline in `Preview.tsx` — a second copy of
 * the fade maths that happened to agree, with nothing checking that it kept
 * agreeing. It is here instead because `apps/mobile` is outside the pnpm
 * workspace and cannot import `@orbit/video`, so the arrangement everywhere
 * else in this directory applies: duplicate the function, and compare the two
 * by OUTPUT in a test (`__tests__/transitions.test.ts`, which imports the
 * canonical module by relative path).
 *
 * Two things about the export are deliberate and BOTH are reproduced here:
 *
 *  1. Transitions apply only to the MAIN (first visual) track. Clips on higher
 *     tracks never fade.
 *  2. Every non-`cut` type — `slide`, `wipe`, `zoom`, `dissolve` — collapses to
 *     a fade, because the export has no wipe on this path. A preview that drew
 *     a real wipe would look BETTER than the file the user gets, which is the
 *     more damaging direction of drift.
 */
import type { VisualTrackClip } from "../model/types";

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
      c.transitionIn && c.transitionIn.type !== "cut"
        ? c.transitionIn.duration
        : 0;
    const next = clips[i + 1];
    const fout =
      next?.transitionIn && next.transitionIn.type !== "cut"
        ? next.transitionIn.duration
        : 0;
    if (fin || fout) map.set(c.id, { fin, fout });
  });
  return map;
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
