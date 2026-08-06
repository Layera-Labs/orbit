/**
 * Fade in / fade out for an audio clip, expressed as a volume envelope.
 *
 * There is no `fadeIn` field on `AudioTrackClip` and there should not be one:
 * `volumeCurve` already describes gain over the clip, both previews sample it
 * through `clipGainAt`, and the export bakes the same points into an ffmpeg
 * `volume` expression. A separate fade field would be a second source of truth
 * for the same number, and the export would have to reconcile them.
 *
 * The one thing to know is that a curve OVERRIDES `volume` rather than scaling
 * it (`curve.ts:clipGainAt`). So the plateau of the curve IS the clip"s volume,
 * and the two have to be written together — which is what `withFades` does.
 *
 * Not every curve is a pair of fades. The Curve sheet can write a duck, a ramp,
 * anything. `fadesOf` returns null for those rather than guessing, so the UI can
 * say "custom curve" instead of silently flattening someone"s work.
 */
import { curvePoints, isEnvelope } from "../preview/curve";
import type { VolumeCurve, VolumeDuck, VolumePoint } from "./types";

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
 * **+14 dB is loud enough to clip**, and nothing here prevents that: ffmpeg"s
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
 * Milliseconds, which is finer than any fade control offers.
 *
 * A fade read back out of a POINT list is `(1 - t) * duration` where `t` was
 * `1 - fade/duration`, so a two-second fade returns 1.9999999999999996. It
 * displays as 2.00 and nobody ever saw it — but it is now STORED, because
 * `withDucks` reads the fades and writes them into the structured form, and a
 * document carrying that number is a document whose round trip is not stable.
 */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Read a clip"s fades back, or null when its curve is not a fade pair.
 *
 * The STRUCTURED form answers immediately, and that is the whole point of it
 * existing: a stored `fadeIn` is a number, so a clip carrying a duck as well
 * still reads its sliders back. With points alone the two shapes are one
 * indistinguishable list, recognition fails, and the UI falls to "custom curve"
 * on a clip whose fades the user set a moment ago.
 *
 * The point-list branch stays for every document written before that, and for
 * a genuinely hand-drawn shape. Shapes recognised (v = plateau): [0,v,v,0],
 * [0,v,v], [v,v,0], and a bare [v,v] — a curve reduced to no fades at all.
 */
export function fadesOf(clip: {
  duration: number;
  volume?: number;
  volumeCurve?: VolumeCurve;
}): AudioFades | null {
  const curve = clip.volumeCurve;
  if (isEnvelope(curve)) {
    // A hand-drawn shape is opaque whatever wrapper it arrives in.
    if (curve.points && curve.points.length >= 2) return null;
    const cap = maxFadeFor(clip.duration);
    return {
      volume: clip.volume ?? 1,
      fadeIn: Math.max(0, Math.min(cap, curve.fadeIn ?? 0)),
      fadeOut: Math.max(0, Math.min(cap, curve.fadeOut ?? 0)),
    };
  }

  const pts = curve;
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
    fadeIn: fadeIn ? r3(body[0].t * clip.duration) : 0,
    fadeOut: fadeOut ? r3((1 - body[1].t) * clip.duration) : 0,
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
  /**
   * Ducks to keep. Passing the clip"s existing ones is what makes fades and
   * ducks independent — the bug this whole shape exists to fix is a duck
   * erasing a pair of fades because they shared one slot.
   */
  ducks?: VolumeDuck[],
): { volume: number; volumeCurve?: VolumeCurve } {
  const cap = maxFadeFor(duration);
  // Clamped at BOTH ends. Bounding only the low one leaves a plateau above the
  // ceiling pinned in `volume` and kept whole in `volumeCurve` — and since the
  // curve overrides, the export renders a level no part of the UI is showing.
  const volume = Math.max(0, Math.min(MAX_VOLUME, fades.volume));
  const fin = Math.max(0, Math.min(cap, fades.fadeIn));
  const fout = Math.max(0, Math.min(cap, fades.fadeOut));
  const live = (ducks ?? []).filter((d) => d.dur > 0);
  if (fin <= 0 && fout <= 0 && !live.length)
    return { volume, volumeCurve: undefined };

  /*
   * The POINT form is still written whenever a plain list can say it, which is
   * every fade-only clip — so no existing document changes shape, no stored
   * project"s filtergraph moves, and a renderer that predates the structured
   * form keeps rendering exactly what it always did. The object appears only
   * when there is a duck, i.e. only for a capability an older renderer could
   * not have performed anyway.
   */
  if (!live.length) {
    const pts: VolumePoint[] = [];
    if (fin > 0) pts.push({ t: 0, v: 0 });
    pts.push({ t: duration > 0 ? fin / duration : 0, v: volume });
    pts.push({ t: duration > 0 ? 1 - fout / duration : 1, v: volume });
    if (fout > 0) pts.push({ t: 1, v: 0 });
    return { volume, volumeCurve: pts };
  }

  return {
    volume,
    volumeCurve: {
      ...(fin > 0 ? { fadeIn: fin } : {}),
      ...(fout > 0 ? { fadeOut: fout } : {}),
      ducks: live,
    },
  };
}

/** The ducks a clip carries, in time order. Empty for any other shape. */
export function ducksOf(clip: { volumeCurve?: VolumeCurve }): VolumeDuck[] {
  const c = clip.volumeCurve;
  return isEnvelope(c) ? [...(c.ducks ?? [])].sort((a, b) => a.at - b.at) : [];
}

/**
 * The patch that sets a clip"s ducks while KEEPING its fades and its level.
 *
 * The counterpart to `withFades` taking ducks, and the other half of the fix:
 * either control now writes through a function that has been told about the
 * other, so neither can silently discard it.
 */
export function withDucks(
  clip: { duration: number; volume?: number; volumeCurve?: VolumeCurve },
  ducks: VolumeDuck[],
): { volume: number; volumeCurve?: VolumeCurve } {
  const fades = fadesOf(clip);
  // A hand-drawn curve has no fades to preserve and no plateau to dip from;
  // refusing is honest, and the UI keeps offering the curve editor instead.
  if (!fades) return { volume: clip.volume ?? 1, volumeCurve: clip.volumeCurve };
  return withFades(clip.duration, fades, ducks);
}

/**
 * The patch that sets a clip"s LEVEL while keeping the shape of its envelope.
 *
 * This exists because a curve overrides `volume`, and it is easy to ship a
 * volume control that does not know it: writing `volume` alone on a clip that
 * carries a fade moves a number no renderer reads, so the export comes back at
 * the plateau, unchanged, with nothing to say why. Every level control has to
 * go through here.
 *
 * A hand-drawn curve is SCALED rather than replaced: "volume" should mean the
 * same thing on a duck as on a fade, and flattening someone"s envelope to
 * honour a slider would destroy work in order to obey it. A curve that is
 * silent throughout has no shape to scale, so it becomes a plain level.
 */
export function withVolume(
  clip: { duration: number; volume?: number; volumeCurve?: VolumeCurve },
  volume: number,
): { volume: number; volumeCurve?: VolumeCurve } {
  const fades = fadesOf(clip);
  // Ducks ride along: `depth` is a fraction of the plateau, so a duck follows
  // the level automatically and needs no rescaling of its own.
  if (fades) return withFades(clip.duration, { ...fades, volume }, ducksOf(clip));

  const v = Math.max(0, Math.min(MAX_VOLUME, volume));
  const pts = curvePoints(clip.volumeCurve, clip.duration, clip.volume ?? 1) ?? [];
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
