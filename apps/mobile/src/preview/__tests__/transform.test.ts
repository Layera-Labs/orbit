/**
 * The mobile mirror of `packages/video/src/transform.ts`, compared by OUTPUT.
 *
 * This app cannot import `@orbit/video`, so the rotation and crop geometry is
 * duplicated. Reading the two files side by side proves nothing — a wrong
 * rounding, a flipped sign or a missing clamp all look fine. So the canonical
 * copy is imported here by RELATIVE PATH and swept against the mirror, the same
 * arrangement `curve.test.ts` and `srt.test.ts` use.
 *
 * When this fails, the Skia preview and the exported MP4 have diverged on where
 * a rotated or cropped clip lands. Fix the mirror; do not loosen the sweep.
 */
import { describe, expect, it } from "vitest";
import {
  clampSourceRect,
  cropDrawRect,
  evenUp,
  isFullSource,
  isRightAngle,
  normalizeRotation,
  rotatedBoxPx,
  snapAngle,
  sourceCropPx,
} from "../transform";

const canonical = await import(
  "../../../../../packages/video/src/transform"
);

const BOXES = [
  { w: 2, h: 2 },
  { w: 128, h: 96 },
  { w: 406, h: 290 },
  { w: 1080, h: 1920 },
  { w: 3840, h: 2160 },
];

const CROPS = [
  undefined,
  { x: 0, y: 0, w: 1, h: 1 },
  { x: 0.1, y: 0.2, w: 0.6, h: 0.55 },
  { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
  { x: 0.25, y: 0, w: 0.5, h: 1 },
  // Out of range on purpose: both copies must clamp the same way.
  { x: -0.4, y: 1.4, w: 2, h: 0 },
];

const NATURALS = [
  [1920, 1080],
  [1080, 1920],
  [640, 640],
  [4032, 3024],
];

describe("the mirror agrees with the canonical copy", () => {
  it("normalizeRotation, over a full turn either way in 7.5 steps", () => {
    for (let deg = -370; deg <= 370; deg += 7.5) {
      expect(normalizeRotation(deg), String(deg)).toBe(
        canonical.normalizeRotation(deg),
      );
    }
    for (const odd of [undefined, NaN, Infinity, -Infinity, -0]) {
      expect(normalizeRotation(odd as number)).toBe(
        canonical.normalizeRotation(odd as number),
      );
    }
  });

  it("evenUp and isRightAngle", () => {
    for (const n of [0, 1, 1.5, 2, 95.9, 96, 158.85, 159, 1919.2]) {
      expect(evenUp(n), String(n)).toBe(canonical.evenUp(n));
    }
    for (let deg = -360; deg <= 360; deg += 7.5) {
      expect(isRightAngle(deg), String(deg)).toBe(
        canonical.isRightAngle(deg),
      );
    }
  });

  it("rotatedBoxPx, every box against every angle", () => {
    for (const box of BOXES) {
      for (let deg = -360; deg <= 360; deg += 7.5) {
        expect(rotatedBoxPx(box, deg), `${box.w}x${box.h} @${deg}`).toEqual(
          canonical.rotatedBoxPx(box, deg),
        );
      }
    }
  });

  it("sourceCropPx, every crop against every natural size and box", () => {
    for (const [nw, nh] of NATURALS) {
      for (const crop of CROPS) {
        for (const box of BOXES) {
          expect(
            sourceCropPx(nw, nh, crop, box.w, box.h),
            `${nw}x${nh} ${JSON.stringify(crop)} -> ${box.w}x${box.h}`,
          ).toEqual(canonical.sourceCropPx(nw, nh, crop, box.w, box.h));
        }
      }
    }
  });

  it("isFullSource and clampSourceRect", () => {
    for (const crop of CROPS) {
      expect(isFullSource(crop)).toBe(canonical.isFullSource(crop));
      if (crop)
        expect(clampSourceRect(crop)).toEqual(canonical.clampSourceRect(crop));
    }
  });

  it("snapAngle", () => {
    for (let deg = -180; deg <= 180; deg += 0.5) {
      expect(snapAngle(deg), String(deg)).toBe(canonical.snapAngle(deg));
    }
  });
});

/**
 * `cropDrawRect` has no canonical twin — no other renderer draws through an
 * image shader that cannot take a source rect. It is checked against the thing
 * it is derived from instead: whatever window `sourceCropPx` selects must be
 * exactly what ends up on the box.
 */
describe("cropDrawRect", () => {
  it("puts the crop window exactly on the box", () => {
    for (const [nw, nh] of NATURALS) {
      for (const crop of CROPS) {
        const box = { x: 40, y: 90, w: 406, h: 290 };
        const d = cropDrawRect(nw, nh, crop, box);
        const { sx, sy, sw, sh } = sourceCropPx(nw, nh, crop, box.w, box.h);
        const k = d.w / nw;
        // The source window's top-left maps to the box's top-left…
        expect(d.x + sx * k).toBeCloseTo(box.x, 6);
        expect(d.y + sy * k).toBeCloseTo(box.y, 6);
        // …and its far corner to the box's far corner.
        expect(d.x + (sx + sw) * k).toBeCloseTo(box.x + box.w, 6);
        expect(d.y + (sy + sh) * k).toBeCloseTo(box.y + box.h, 6);
      }
    }
  });

  it("scales uniformly — a crop must never stretch the picture", () => {
    for (const [nw, nh] of NATURALS) {
      for (const crop of CROPS) {
        const d = cropDrawRect(nw, nh, crop, { x: 0, y: 0, w: 300, h: 500 });
        expect(d.w / nw).toBeCloseTo(d.h / nh, 9);
      }
    }
  });
});
