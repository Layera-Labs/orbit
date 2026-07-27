import { describe, expect, it } from "vitest";
import {
  CANVAS_TARGETS,
  SNAP_THRESHOLD,
  objectTargets,
  snapSpan,
  targetsFor,
} from "../snap";

describe("snapSpan", () => {
  it("locks a box's leading edge to the canvas edge", () => {
    expect(snapSpan({ pos: 0.006, size: 0.3 }, CANVAS_TARGETS)).toBe(0);
  });

  it("locks a box's centre to the canvas centre", () => {
    // centre sits at 0.355 + 0.15 = 0.505, within threshold of 0.5
    expect(snapSpan({ pos: 0.355, size: 0.3 }, CANVAS_TARGETS)).toBeCloseTo(0.35, 6);
  });

  it("locks a box's trailing edge to the far canvas edge", () => {
    // trailing sits at 0.695 + 0.3 = 0.995
    expect(snapSpan({ pos: 0.695, size: 0.3 }, CANVAS_TARGETS)).toBeCloseTo(0.7, 6);
  });

  it("leaves a box alone when nothing is close enough", () => {
    expect(snapSpan({ pos: 0.22, size: 0.3 }, CANVAS_TARGETS)).toBe(0.22);
  });

  it("picks the NEAREST target when several are in range", () => {
    // A point 0.004 past centre and 0.011 from a competing target at 0.49.
    expect(snapSpan({ pos: 0.504, size: 0 }, [0.5, 0.49])).toBe(0.5);
  });

  it("treats a zero-size span as a point (caption anchor)", () => {
    expect(snapSpan({ pos: 0.497, size: 0 }, CANVAS_TARGETS)).toBe(0.5);
    // A point has no centre or trailing edge to snap, so a box-sized offset
    // must not be applied to it.
    expect(snapSpan({ pos: 0.25, size: 0 }, CANVAS_TARGETS)).toBe(0.25);
  });

  it("respects a custom threshold", () => {
    expect(snapSpan({ pos: 0.02, size: 0 }, CANVAS_TARGETS, 0.05)).toBe(0);
    expect(snapSpan({ pos: 0.02, size: 0 }, CANVAS_TARGETS, 0.001)).toBe(0.02);
  });
});

describe("targetsFor", () => {
  const others = [{ pos: 0.6, size: 0.2 }];

  it("offers only the canvas when snapping is off", () => {
    // The preference reads "when off, objects snap only to edges or center".
    expect(targetsFor(false, others)).toEqual([0, 0.5, 1]);
  });

  it("adds the other objects' edges and centres when on", () => {
    expect(targetsFor(true, others)).toEqual([0, 0.5, 1, 0.6, 0.7, 0.8]);
  });

  it("aligns a box to another object only when snapping is on", () => {
    const moving = { pos: 0.604, size: 0.1 };
    expect(snapSpan(moving, targetsFor(true, others))).toBe(0.6);
    expect(snapSpan(moving, targetsFor(false, others))).toBe(0.604);
  });
});

describe("objectTargets", () => {
  it("contributes three targets per object", () => {
    expect(objectTargets([{ pos: 0, size: 0.4 }])).toEqual([0, 0.2, 0.4]);
  });

  it("is empty for no objects", () => {
    expect(objectTargets([])).toEqual([]);
  });
});

describe("SNAP_THRESHOLD", () => {
  it("is small enough not to fight deliberate placement", () => {
    // ~1.2% of the canvas — a few px on a phone-sized preview.
    expect(SNAP_THRESHOLD).toBeLessThan(0.02);
    expect(SNAP_THRESHOLD).toBeGreaterThan(0.005);
  });
});
