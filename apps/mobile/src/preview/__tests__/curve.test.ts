import { describe, expect, it } from "vitest";
import { clipGainAt, hasVolumeCurve, sampleVolume } from "../curve";
import type { VolumePoint } from "../../model/types";

/**
 * The gain the preview plays a clip at.
 *
 * This decides whether a fade someone drew on the timeline SOUNDS like the file
 * they will export, so the important test is the last one: it runs the same
 * inputs through this copy and through `packages/video/src/curve.ts`, the one
 * the export uses, and requires the same numbers out.
 */

const pts = (...v: [number, number][]): VolumePoint[] =>
  v.map(([t, val]) => ({ t, v: val }));

describe("sampleVolume", () => {
  it("interpolates between points", () => {
    const c = pts([0, 0], [1, 1]);
    expect(sampleVolume(c, 0)).toBe(0);
    expect(sampleVolume(c, 0.5)).toBeCloseTo(0.5, 6);
    expect(sampleVolume(c, 1)).toBe(1);
  });

  it("holds flat outside the first and last point", () => {
    const c = pts([0.25, 0.4], [0.75, 0.9]);
    expect(sampleVolume(c, 0)).toBe(0.4);
    expect(sampleVolume(c, 1)).toBe(0.9);
  });

  it("does not care what order the points arrive in", () => {
    expect(sampleVolume(pts([1, 1], [0, 0]), 0.25)).toBeCloseTo(0.25, 6);
  });

  it("clamps progress rather than extrapolating", () => {
    const c = pts([0, 0.2], [1, 0.8]);
    expect(sampleVolume(c, -5)).toBe(0.2);
    expect(sampleVolume(c, 5)).toBe(0.8);
  });

  /* Two points at the same time would divide by zero. */
  it("survives coincident points", () => {
    expect(() => sampleVolume(pts([0.5, 0.1], [0.5, 0.9]), 0.5)).not.toThrow();
    expect(Number.isFinite(sampleVolume(pts([0.5, 0.1], [0.5, 0.9]), 0.5))).toBe(true);
  });
});

describe("hasVolumeCurve", () => {
  it("needs at least two points to be a curve", () => {
    expect(hasVolumeCurve(undefined)).toBe(false);
    expect(hasVolumeCurve([])).toBe(false);
    expect(hasVolumeCurve(pts([0, 1]))).toBe(false);
    expect(hasVolumeCurve(pts([0, 1], [1, 0]))).toBe(true);
  });
});

describe("clipGainAt", () => {
  it("uses the flat volume when there is no curve", () => {
    expect(clipGainAt({ volume: 0.6 }, 0.5)).toBe(0.6);
  });

  it("defaults to full gain", () => {
    expect(clipGainAt({}, 0.5)).toBe(1);
  });

  it("lets a curve override the flat volume", () => {
    // Same precedence as the export, where `volumeCurveExpr` replaces `volume`.
    expect(clipGainAt({ volume: 1, volumeCurve: pts([0, 0], [1, 1]) }, 0.25)).toBeCloseTo(
      0.25,
      6,
    );
  });

  it("never returns a negative gain", () => {
    expect(clipGainAt({ volume: -3 }, 0)).toBe(0);
    expect(clipGainAt({ volumeCurve: pts([0, -1], [1, -1]) }, 0.5)).toBe(0);
  });
});

/**
 * The copies must agree, or the preview lies about the export.
 */
describe("mobile mirrors packages/video", () => {
  it("samples identically across a sweep", async () => {
    // By path, not package name: mobile installs outside the pnpm workspace and
    // cannot resolve `@orbit/video`. That is exactly why this file is a copy,
    // and exactly why this test exists.
    const shared = await import("../../../../../packages/video/src/curve");

    const curves = [
      pts([0, 0], [1, 1]),
      pts([0, 1], [1, 0]),
      pts([0, 0], [0.1, 1], [0.9, 1], [1, 0]),
      pts([0.25, 0.4], [0.75, 0.9]),
      pts([1, 1], [0, 0]),
    ];
    for (const curve of curves) {
      for (let i = -2; i <= 12; i++) {
        const p = i / 10;
        expect(sampleVolume(curve, p)).toBe(
          shared.sampleVolume(curve as never, p),
        );
      }
      expect(hasVolumeCurve(curve)).toBe(shared.hasVolumeCurve(curve as never));
    }
  });
});
