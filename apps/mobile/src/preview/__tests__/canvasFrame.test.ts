/**
 * The mobile frame-geometry mirror against the canonical one.
 *
 * What this asserts is that the two copies are the same FUNCTION, not that a
 * preview pixel equals an export pixel — mobile calls it with the preview
 * canvas size and the export calls it with the project size, deliberately. So
 * the sweep covers several box sizes as well as several frames, and the clamp
 * cases matter most: an out-of-range radius is where two implementations of
 * "the same" helper drift apart without anyone noticing.
 */
import { describe, expect, it } from "vitest";
import { canvasFramePx, hasCanvasFrame } from "../canvasFrame";
import type { CanvasFrame } from "../../model/types";

const FRAMES: (CanvasFrame | undefined)[] = [
  undefined,
  { color: "#fff", width: 0 },
  { color: "#fff", width: 0.05 },
  { color: "#fff", width: 0, radius: 0.1 },
  { color: "#fff", width: 0.05, radius: 0.08 },
  // Past every clamp, in both directions.
  { color: "#fff", width: 0.4, radius: 0.5 },
  { color: "#fff", width: 0.9, radius: 0.9 },
  { color: "#fff", width: -1, radius: -1 },
  { color: "#fff", width: Number.NaN, radius: Number.NaN },
  { color: "#fff", width: 0.05, opacity: 0 },
];

/** Project sizes and the preview sizes mobile actually hands it. */
const BOXES: [number, number][] = [
  [1080, 1920],
  [1920, 1080],
  [1080, 1080],
  [342, 608], // a 9:16 preview on a phone
  [0, 0],
];

describe("mobile mirrors packages/video", () => {
  it("computes the same geometry for every frame and every box", async () => {
    // By path, not package name: mobile installs outside the pnpm workspace.
    const shared = await import(
      "../../../../../packages/video/src/canvas-frame"
    );
    for (const f of FRAMES) {
      expect(hasCanvasFrame(f)).toBe(shared.hasCanvasFrame(f as never));
      for (const [w, h] of BOXES) {
        expect(canvasFramePx(f, w, h)).toEqual(
          shared.canvasFramePx(f as never, w, h),
        );
      }
    }
  });

  it("scales with the box, which is what makes the preview honest", () => {
    // A frame authored on a 342-wide preview must be the same FRACTION of the
    // 1080-wide export, or the mat the user set is not the mat they get.
    const f: CanvasFrame = { color: "#fff", width: 0.05, radius: 0.08 };
    const preview = canvasFramePx(f, 342, 608);
    const project = canvasFramePx(f, 1080, 1920);
    expect(project.borderPx / preview.borderPx).toBeCloseTo(1080 / 342, 9);
    expect(project.radiusPx / preview.radiusPx).toBeCloseTo(1080 / 342, 9);
  });
});
