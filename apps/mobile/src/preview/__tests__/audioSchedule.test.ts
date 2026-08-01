import { describe, expect, it } from "vitest";
import {
  needsRearm,
  REARM_TOLERANCE_SEC,
  scheduleAt,
  speedOf,
} from "../audioSchedule";

/**
 * The arithmetic that decides where a clip's sound lands.
 *
 * Worth pinning down because the graph around it cannot be tested off-device:
 * a Web Audio source is one-shot, so if these numbers are wrong the audio is
 * simply in the wrong place and no type or lint catches it.
 */
describe("scheduleAt", () => {
  const clip = { start: 10, duration: 4, trimIn: 2 };

  it("delays a clip that has not started yet, from its own beginning", () => {
    expect(scheduleAt(clip, 6)).toEqual({ delay: 4, offset: 2, duration: 4 });
  });

  it("starts a clip the playhead is already inside from partway in", () => {
    // 1s into the clip: no delay, one second further into the file, one less
    // second to play.
    expect(scheduleAt(clip, 11)).toEqual({ delay: 0, offset: 3, duration: 3 });
  });

  it("returns null once the clip is over", () => {
    expect(scheduleAt(clip, 14)).toBeNull();
    expect(scheduleAt(clip, 99)).toBeNull();
  });

  it("starts exactly at the clip's first instant", () => {
    expect(scheduleAt(clip, 10)).toEqual({ delay: 0, offset: 2, duration: 4 });
  });

  it("advances the source offset at SPEED, not at wall-clock", () => {
    /*
     * The case most likely to be got wrong. A clip at 2x has consumed TWO
     * source seconds for every timeline second elapsed, so entering it one
     * timeline second late means starting two seconds further into the file —
     * and only two source seconds of the file remain for its last timeline
     * second.
     */
    const fast = { start: 0, duration: 2, trimIn: 0, speed: 2 };
    expect(scheduleAt(fast, 1)).toEqual({ delay: 0, offset: 2, duration: 2 });
    expect(scheduleAt(fast, 0)).toEqual({ delay: 0, offset: 0, duration: 4 });
  });

  it("treats a nonsense speed as 1 rather than dividing by it", () => {
    expect(speedOf({ start: 0, duration: 1, speed: 0 })).toBe(1);
    expect(speedOf({ start: 0, duration: 1, speed: -3 })).toBe(1);
    expect(speedOf({ start: 0, duration: 1 })).toBe(1);
  });

  it("has nothing to play for a zero-length clip", () => {
    expect(scheduleAt({ start: 0, duration: 0 }, 0)).toBeNull();
  });

  it("defaults trimIn to the start of the file", () => {
    expect(scheduleAt({ start: 0, duration: 3 }, 0)?.offset).toBe(0);
  });
});

describe("needsRearm", () => {
  // Armed at timeline 5, when the audio clock read 100.
  const armedT = 5;
  const armedAt = 100;

  it("leaves steady playback alone", () => {
    // Two seconds later on both clocks: exactly in step.
    expect(needsRearm(7, armedT, armedAt, 102)).toBe(false);
  });

  it("tolerates ordinary jitter without restarting anything", () => {
    /*
     * This is the one that matters. Re-arming stops and recreates every source,
     * which clicks — so a few tens of milliseconds of frame-timing jitter must
     * never trigger it, or the preview crackles continuously.
     */
    expect(needsRearm(7.1, armedT, armedAt, 102)).toBe(false);
    expect(needsRearm(6.9, armedT, armedAt, 102)).toBe(false);
  });

  it("catches a scrub in either direction", () => {
    expect(needsRearm(20, armedT, armedAt, 102)).toBe(true);
    expect(needsRearm(0, armedT, armedAt, 102)).toBe(true);
  });

  it("triggers just outside the tolerance and not just inside it", () => {
    const justIn = 7 + REARM_TOLERANCE_SEC * 0.9;
    const justOut = 7 + REARM_TOLERANCE_SEC * 1.1;
    expect(needsRearm(justIn, armedT, armedAt, 102)).toBe(false);
    expect(needsRearm(justOut, armedT, armedAt, 102)).toBe(true);
  });
});
