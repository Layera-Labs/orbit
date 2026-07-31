/**
 * The scroll-ownership machine behind the timeline.
 *
 * Written against the failure it exists to prevent rather than against another
 * implementation: a flick scrubbed the timeline and then snapped back, because
 * ownership was handed to the playhead at FINGER LIFT while the content was
 * still gliding. The whole point of these cases is the gap between "the finger
 * left" and "the scroll stopped", which is exactly the interval that is
 * impossible to catch by screenshotting a running simulator.
 */
import { describe, expect, it } from "vitest";
import {
  SCROLL_AT_REST,
  scrollActivity,
  shouldSyncScroll,
  type ScrollActivity,
  type ScrollEvent,
} from "../timelineScroll";

const run = (...events: ScrollEvent[]): ScrollActivity =>
  events.reduce(scrollActivity, SCROLL_AT_REST);

describe("scrollActivity", () => {
  it("stays active after the finger lifts — the bug, stated directly", () => {
    // `onScrollEndDrag` fires at lift, not at rest. Going inactive here is
    // what let the sync effect scrollTo back to the pre-lift offset.
    expect(run("dragBegin", "dragEnd").active).toBe(true);
  });

  it("holds through an entire glide and releases only at rest", () => {
    const gliding = run("dragBegin", "dragEnd", "momentumBegin");
    expect(gliding.active).toBe(true);
    expect(scrollActivity(gliding, "momentumEnd")).toEqual(SCROLL_AT_REST);
  });

  it("releases on the timer when a drag produces no momentum at all", () => {
    // A slow drag sends no momentum events, so without this the flag would
    // stay set forever and the playhead could never scroll the timeline again.
    expect(run("dragBegin", "dragEnd", "restTimer")).toEqual(SCROLL_AT_REST);
  });

  it("ignores a timer that momentum has already superseded", () => {
    // The timer is armed at lift and momentum starts a frame later. If the
    // stale timer were honoured it would cut a long glide short — the same
    // snap-back, just delayed by the timeout.
    const s = run("dragBegin", "dragEnd", "momentumBegin", "restTimer");
    expect(s.active).toBe(true);
  });

  it("ignores a timer when the user has grabbed the content again", () => {
    const s = run("dragBegin", "dragEnd", "dragBegin", "restTimer");
    expect(s.active).toBe(true);
  });

  it("survives a second flick chained onto the first", () => {
    const s = run(
      "dragBegin",
      "dragEnd",
      "momentumBegin",
      "dragBegin", // grabbed mid-glide
      "dragEnd",
      "momentumBegin",
    );
    expect(s.active).toBe(true);
    expect(scrollActivity(s, "momentumEnd").active).toBe(false);
  });

  it("never arms a rest timer except at a finger lift", () => {
    for (const e of [
      "dragBegin",
      "momentumBegin",
      "momentumEnd",
      "restTimer",
    ] as ScrollEvent[]) {
      expect(scrollActivity(SCROLL_AT_REST, e).pendingRest).toBe(false);
    }
    expect(scrollActivity(SCROLL_AT_REST, "dragEnd").pendingRest).toBe(true);
  });
});

describe("shouldSyncScroll", () => {
  const base = { active: false, viewW: 390, targetX: 100, currentX: 0 };

  it("never fights the user for the scroll position", () => {
    expect(shouldSyncScroll({ ...base, active: true })).toBe(false);
  });

  it("waits for a measured view", () => {
    expect(shouldSyncScroll({ ...base, viewW: 0 })).toBe(false);
  });

  it("moves when the playhead is genuinely somewhere else", () => {
    expect(shouldSyncScroll(base)).toBe(true);
  });

  it("does not re-issue the scroll that produced this playhead", () => {
    // The feedback loop: onScroll sets the playhead, the playhead re-runs the
    // sync. Landing a scrollTo here stops a settling scroll dead.
    expect(shouldSyncScroll({ ...base, targetX: 100, currentX: 100 })).toBe(
      false,
    );
    expect(shouldSyncScroll({ ...base, targetX: 100.4, currentX: 100 })).toBe(
      false,
    );
    expect(shouldSyncScroll({ ...base, targetX: 100.5, currentX: 100 })).toBe(
      true,
    );
  });
});
