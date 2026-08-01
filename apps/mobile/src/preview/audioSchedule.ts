/**
 * Where a clip's audio has to start, and how much of the file to play.
 *
 * Pure, because the graph around it is not testable without a device: this is
 * the part that decides whether sound lands in the right place, so it is the
 * part worth pinning down.
 *
 * **Why scheduling at all, when the old graph just seeked.** A Web Audio
 * `AudioBufferSourceNode` is ONE-SHOT — it is started once with an offset and a
 * duration, and cannot be moved afterwards. That is the cost of getting a real
 * gain stage (the old `expo-audio` player could seek, but its volume saturated
 * at 1.0, so 200% and 500% were inaudible). So every play and every seek arms
 * fresh sources, and steady playback leaves them alone.
 */

export interface SchedulableClip {
  /** Timeline second the clip begins at. */
  start: number;
  /** Its length on the timeline, in timeline seconds. */
  duration: number;
  /** Seconds into the source file that the clip's first frame comes from. */
  trimIn?: number;
  /** Playback rate. 2 means two source seconds per timeline second. */
  speed?: number;
}

export interface Schedule {
  /** Seconds from NOW to start. 0 when the clip is already under way. */
  delay: number;
  /** Seconds into the source file to start from. */
  offset: number;
  /** How long to play for, in SOURCE seconds. */
  duration: number;
}

/** A speed of 0 or less would divide the timeline by zero; treat it as 1. */
export function speedOf(clip: SchedulableClip): number {
  return clip.speed && clip.speed > 0 ? clip.speed : 1;
}

/**
 * What to hand `source.start(when, offset, duration)` for a clip, given the
 * playhead is at timeline second `t` right now — or `null` when the clip has
 * nothing left to play.
 *
 * Three cases, and the middle one is the one that is easy to get wrong:
 * - the clip is still ahead: start it late, from its own beginning;
 * - the playhead is INSIDE it: start now, from partway in. The offset advances
 *   at `speed`, because a clip at 2x has already consumed two source seconds
 *   for every timeline second elapsed;
 * - the clip is over: nothing.
 */
export function scheduleAt(
  clip: SchedulableClip,
  t: number,
): Schedule | null {
  const speed = speedOf(clip);
  const end = clip.start + clip.duration;
  if (clip.duration <= 0 || t >= end) return null;

  const into = Math.max(0, t - clip.start);
  const delay = Math.max(0, clip.start - t);
  const offset = (clip.trimIn ?? 0) + into * speed;
  // In SOURCE seconds: what is left of the clip on the timeline, at rate.
  const duration = (clip.duration - into) * speed;
  if (duration <= 0) return null;
  return { delay, offset, duration };
}

/**
 * Has the playhead moved somewhere the running sources cannot follow?
 *
 * During steady playback the timeline advances in step with the audio clock, so
 * `t` should track `armedT + (now - armedAt)`. A scrub, a jump to a marker or a
 * loop breaks that, and since a started source cannot be repositioned the only
 * repair is to re-arm.
 *
 * The tolerance is generous on purpose. Frame timing jitter, a slow render pass
 * and the clock's own granularity all put a few tens of milliseconds between
 * the two, and re-arming on that would restart every source several times a
 * second — which is audible as clicking, and far worse than the drift it would
 * be correcting.
 */
export const REARM_TOLERANCE_SEC = 0.25;

export function needsRearm(
  t: number,
  armedT: number,
  armedAt: number,
  now: number,
  tolerance = REARM_TOLERANCE_SEC,
): boolean {
  const expected = armedT + (now - armedAt);
  return Math.abs(t - expected) > tolerance;
}
