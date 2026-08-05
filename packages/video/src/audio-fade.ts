/**
 * Fade in / fade out for an audio clip, expressed as a volume envelope.
 *
 * There is no `fadeIn` field on `AudioTrackClip` and there should not be one:
 * `volumeCurve` already describes gain over the clip, both previews sample it
 * through `sampleVolume`, and the export bakes the same points into an ffmpeg
 * `volume` expression. A separate fade field would be a second source of truth
 * for the same number, and the export would have to reconcile them.
 *
 * The one thing to know is that a curve **overrides** `volume` rather than
 * scaling it (`ffmpeg.ts` reads `volumeCurve` INSTEAD of `volume` when one is
 * set, and so does every preview). So the plateau of the curve IS the clip's
 * volume, and the two have to be written together — which is what `withFades`
 * does, and why `withVolume` exists at all.
 *
 * Not every curve is a pair of fades. A curve editor can write a duck, a ramp,
 * anything. `fadesOf` returns null for those rather than guessing, so the UI can
 * say "custom curve" instead of silently flattening someone's work.
 *
 * ## Why this lives here
 *
 * It was written in `apps/mobile/src/model/audio-fade.ts` first, and this is now
 * the canonical copy — the same relationship `canvas-frame.ts`, `transform.ts`
 * and `srt.ts` already have with their mobile mirrors, for the same reason:
 * mobile installs outside the pnpm workspace and cannot import `@orbit/video`,
 * so it keeps a vendored copy and a test asserts the two agree. The web imports
 * this one directly. Two hand-written implementations of "the plateau is the
 * volume" is exactly how one client starts exporting a level the other does not
 * show.
 */
import type { VolumePoint } from "./types";

export interface AudioFades {
  /** Plateau gain, 0..`MAX_VOLUME`. */
  volume: number;
  /** Seconds ramping up from silence at the head. 0 = none. */
  fadeIn: number;
  /** Seconds ramping down to silence at the tail. 0 = none. */
  fadeOut: number;
}

/** Longest fade offered, and the longest that can fit in a clip. */
export const MAX_FADE = 5;

/**
 * Loudest gain stored anywhere. THE single ceiling — every volume control and
 * every waveform scale reads this, so raising it moves all of them together.
 *
 * **+14 dB is loud enough to clip**, and nothing here prevents that: ffmpeg's
 * `volume` filter multiplies and lets the result hard-clip at full scale. That
 * is the honest behaviour for a gain control and matches what every editor
 * does, but it does mean the top of this range is a tool for quiet source
 * material, not a way to make loud audio louder.
 */
export const MAX_VOLUME = 5;

export function maxFadeFor(duration: number): number {
  // Half the clip each, so a fade in and a fade out can never cross.
  return Math.max(0, Math.min(MAX_FADE, duration / 2));
}

const EPS = 1e-3;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;

/**
 * Read a clip's fades back, or null when its curve is not a fade pair.
 *
 * Shapes recognised (v = plateau): [0,v,v,0], [0,v,v], [v,v,0], and a bare
 * [v,v] — which is what a curve reduced to no fades at all looks like.
 */
export function fadesOf(clip: {
  duration: number;
  volume?: number;
  volumeCurve?: VolumePoint[];
}): AudioFades | null {
  const pts = clip.volumeCurve;
  if (!pts || pts.length < 2)
    return { volume: clip.volume ?? 1, fadeIn: 0, fadeOut: 0 };

  const ks = [...pts].sort((a, b) => a.t - b.t);
  const volume = Math.max(...ks.map((k) => k.v));
  if (volume <= 0) return null;

  const head = ks[0];
  const tail = ks[ks.length - 1];
  const fadeIn = near(head.v, 0) ? 1 : 0;
  const fadeOut = near(tail.v, 0) ? 1 : 0;
  // Every point that is not a fade endpoint has to sit ON the plateau; if one
  // dips in the middle this is a duck or a ramp, not a fade pair.
  const body = ks.slice(fadeIn, ks.length - fadeOut);
  if (body.length !== 2) return null;
  if (!near(body[0].v, volume) || !near(body[1].v, volume)) return null;
  if (!near(head.t, 0) || !near(tail.t, 1)) return null;

  return {
    volume,
    fadeIn: fadeIn ? body[0].t * clip.duration : 0,
    fadeOut: fadeOut ? (1 - body[1].t) * clip.duration : 0,
  };
}

/**
 * The `{ volume, volumeCurve }` patch for a given plateau and pair of fades.
 *
 * With no fades the curve is REMOVED rather than flattened to two equal points,
 * so a clip that never had one goes back to carrying a plain number — and the
 * export emits `volume=<n>` instead of a per-frame expression.
 */
export function withFades(
  duration: number,
  fades: AudioFades,
): { volume: number; volumeCurve?: VolumePoint[] } {
  const cap = maxFadeFor(duration);
  // Clamped at BOTH ends. Bounding only the low one leaves a plateau above the
  // ceiling pinned in `volume` and kept whole in `volumeCurve` — and since the
  // curve overrides, the export renders a level no part of the UI is showing.
  const volume = Math.max(0, Math.min(MAX_VOLUME, fades.volume));
  const fin = Math.max(0, Math.min(cap, fades.fadeIn));
  const fout = Math.max(0, Math.min(cap, fades.fadeOut));
  if (fin <= 0 && fout <= 0) return { volume, volumeCurve: undefined };

  const pts: VolumePoint[] = [];
  if (fin > 0) pts.push({ t: 0, v: 0 });
  pts.push({ t: duration > 0 ? fin / duration : 0, v: volume });
  pts.push({ t: duration > 0 ? 1 - fout / duration : 1, v: volume });
  if (fout > 0) pts.push({ t: 1, v: 0 });
  return { volume, volumeCurve: pts };
}

/**
 * The patch that sets a clip's LEVEL while keeping the shape of its envelope.
 *
 * This exists because a curve overrides `volume`, and it is easy to ship a
 * volume control that does not know it: writing `volume` alone on a clip that
 * carries a fade moves a number no renderer reads, so the export comes back at
 * the plateau, unchanged, with nothing to say why. Every level control has to
 * go through here.
 *
 * A hand-drawn curve is SCALED rather than replaced: "volume" should mean the
 * same thing on a duck as on a fade, and flattening someone's envelope to
 * honour a slider would destroy work in order to obey it. A curve that is
 * silent throughout has no shape to scale, so it becomes a plain level.
 */
export function withVolume(
  clip: { duration: number; volume?: number; volumeCurve?: VolumePoint[] },
  volume: number,
): { volume: number; volumeCurve?: VolumePoint[] } {
  const fades = fadesOf(clip);
  if (fades) return withFades(clip.duration, { ...fades, volume });

  const v = Math.max(0, Math.min(MAX_VOLUME, volume));
  const pts = clip.volumeCurve ?? [];
  const peak = Math.max(0, ...pts.map((p) => p.v));
  if (peak <= 0) return { volume: v, volumeCurve: undefined };
  const k = v / peak;
  return {
    volume: v,
    volumeCurve: pts.map((p) => ({
      t: p.t,
      v: Math.max(0, Math.min(MAX_VOLUME, p.v * k)),
    })),
  };
}
