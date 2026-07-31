/**
 * Rotation + source-crop geometry, and the facts about ffmpeg it is built on.
 *
 * The ffmpeg behaviour below was MEASURED against ffmpeg 8.1.2 with flat-colour
 * probes, not reasoned about — the same discipline as the grade and chroma-key
 * work. It is pinned here so a filter-version change breaks in this file rather
 * than in somebody's exported MP4.
 */
import { describe, expect, it } from 'vitest';
import { coverCrop, even } from '../layout';
import {
  clampSourceRect,
  evenUp,
  isFullSource,
  isRightAngle,
  normalizeRotation,
  rotatedBoxPx,
  snapAngle,
  sourceCropPx,
} from '../transform';
import { FULL_SOURCE } from '../types';

describe('normalizeRotation', () => {
  it('wraps into (-180, 180]', () => {
    expect(normalizeRotation(370)).toBe(10);
    expect(normalizeRotation(-350)).toBe(10);
    expect(normalizeRotation(10)).toBe(10);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(-180)).toBe(180);
    expect(normalizeRotation(540)).toBe(180);
    expect(normalizeRotation(-90)).toBe(-90);
  });

  it('treats anything that is not a finite number as no rotation', () => {
    expect(normalizeRotation(undefined)).toBe(0);
    expect(normalizeRotation(NaN)).toBe(0);
    expect(normalizeRotation(Infinity)).toBe(0);
  });

  it('never returns -0, which would print as "-0" into a filtergraph', () => {
    expect(Object.is(normalizeRotation(-360), 0)).toBe(true);
    expect(Object.is(normalizeRotation(-0), 0)).toBe(true);
  });
});

describe('evenUp', () => {
  it('rounds UP, so a box never lands inside the shape it must contain', () => {
    expect(evenUp(158.85)).toBe(160);
    expect(evenUp(159)).toBe(160);
    expect(evenUp(160)).toBe(160);
    // The difference from `even`, which rounds to nearest and would shave a
    // pixel off the corner a rotation just created.
    expect(even(158.85)).toBe(158);
  });
});

describe('rotatedBoxPx', () => {
  it('is the identity at zero, and keeps the growth at zero', () => {
    expect(rotatedBoxPx({ w: 128, h: 96 }, 0)).toEqual({
      ow: 128,
      oh: 96,
      dx: 0,
      dy: 0,
    });
    expect(rotatedBoxPx({ w: 128, h: 96 }, 360)).toEqual({
      ow: 128,
      oh: 96,
      dx: 0,
      dy: 0,
    });
  });

  it('swaps the sides at a right angle', () => {
    expect(rotatedBoxPx({ w: 128, h: 96 }, 90)).toEqual({
      ow: 96,
      oh: 128,
      dx: -16,
      dy: 16,
    });
    expect(rotatedBoxPx({ w: 128, h: 96 }, 180)).toEqual({
      ow: 128,
      oh: 96,
      dx: 0,
      dy: 0,
    });
  });

  it('matches the box ffmpeg actually produced', () => {
    // Measured: `rotate=0.5:ow=rotw(0.5):oh=roth(0.5)` on 200x100 gave 223x184,
    // i.e. round(|w cos| + |h sin|) and round(|w sin| + |h cos|). Rounded UP to
    // even here, so 224x184.
    const deg = (0.5 * 180) / Math.PI;
    expect(rotatedBoxPx({ w: 200, h: 100 }, deg)).toMatchObject({
      ow: 224,
      oh: 184,
    });
  });

  it('is symmetric in the sign of the angle', () => {
    for (const deg of [7.5, 30, 45, 61, 120, 179]) {
      expect(rotatedBoxPx({ w: 128, h: 96 }, deg)).toEqual(
        rotatedBoxPx({ w: 128, h: 96 }, -deg),
      );
    }
  });

  it('always grows, and keeps the growth a whole number for an even box', () => {
    for (const deg of [1, 7.5, 15, 30, 45, 60, 89, 91, 135, 179]) {
      for (const box of [
        { w: 128, h: 96 },
        { w: 1080, h: 1920 },
        { w: 406, h: 290 },
      ]) {
        const { ow, oh, dx, dy } = rotatedBoxPx(box, deg);
        expect(ow % 2, `ow even @${deg}`).toBe(0);
        expect(oh % 2, `oh even @${deg}`).toBe(0);
        // Whole numbers matter: the export subtracts them from the overlay
        // origin, and a half pixel there is a half-pixel rotation centre.
        expect(Number.isInteger(dx), `dx integer @${deg}`).toBe(true);
        expect(Number.isInteger(dy), `dy integer @${deg}`).toBe(true);
        // Never smaller than the shape it has to hold.
        const rad = (deg * Math.PI) / 180;
        expect(ow).toBeGreaterThanOrEqual(
          box.w * Math.abs(Math.cos(rad)) + box.h * Math.abs(Math.sin(rad)),
        );
        expect(oh).toBeGreaterThanOrEqual(
          box.w * Math.abs(Math.sin(rad)) + box.h * Math.abs(Math.cos(rad)),
        );
      }
    }
  });
});

describe('isRightAngle', () => {
  it('is what decides whether a rotation resamples at all', () => {
    for (const deg of [0, 90, -90, 180, 270, 360]) {
      expect(isRightAngle(deg), String(deg)).toBe(true);
    }
    for (const deg of [1, 45, 89.9, 91, 135]) {
      expect(isRightAngle(deg), String(deg)).toBe(false);
    }
  });
});

describe('sourceCropPx', () => {
  it('is EXACTLY coverCrop when there is no crop', () => {
    // The unit-level proof that nothing crops twice: adding the feature must
    // not move a single existing pixel.
    for (const [nw, nh] of [
      [1920, 1080],
      [1080, 1920],
      [640, 640],
      [4000, 3000],
    ]) {
      for (const [bw, bh] of [
        [1080, 1920],
        [405, 290],
        [100, 100],
      ]) {
        expect(sourceCropPx(nw, nh, undefined, bw, bh)).toEqual(
          coverCrop(nw, nh, bw, bh),
        );
        expect(sourceCropPx(nw, nh, FULL_SOURCE, bw, bh)).toEqual(
          coverCrop(nw, nh, bw, bh),
        );
      }
    }
  });

  it('cover-fits INSIDE the crop window, not the whole frame', () => {
    // A 1000x1000 source, cropped to its middle 500x500, into a square box:
    // the whole window is used and it starts at the window's origin.
    expect(
      sourceCropPx(1000, 1000, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 200, 200),
    ).toEqual({ sx: 250, sy: 250, sw: 500, sh: 500 });
  });

  it('centre-crops the leftover when the window and box disagree in aspect', () => {
    // Window is 500x500; the box is 2:1, so only the middle 250 rows are used.
    expect(
      sourceCropPx(1000, 1000, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 400, 200),
    ).toEqual({ sx: 250, sy: 375, sw: 500, sh: 250 });
  });

  it('never selects anything outside the source', () => {
    for (const crop of [
      { x: -1, y: -1, w: 3, h: 3 },
      { x: 0.9, y: 0.9, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0, h: 0 },
    ]) {
      const { sx, sy, sw, sh } = sourceCropPx(800, 600, crop, 300, 300);
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sx + sw).toBeLessThanOrEqual(800 + 1e-9);
      expect(sy + sh).toBeLessThanOrEqual(600 + 1e-9);
    }
  });

  it('survives a zero-size media or box rather than emitting NaN', () => {
    for (const r of Object.values(sourceCropPx(0, 0, undefined, 100, 100)))
      expect(Number.isFinite(r)).toBe(true);
    for (const r of Object.values(sourceCropPx(100, 100, undefined, 0, 0)))
      expect(Number.isFinite(r)).toBe(true);
  });
});

describe('isFullSource / clampSourceRect', () => {
  it('treats an absent or whole-frame crop as no crop', () => {
    expect(isFullSource(undefined)).toBe(true);
    expect(isFullSource(FULL_SOURCE)).toBe(true);
    expect(isFullSource({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(isFullSource({ x: 0.1, y: 0, w: 1, h: 1 })).toBe(false);
    expect(isFullSource({ x: 0, y: 0, w: 0.5, h: 1 })).toBe(false);
  });

  it('cannot collapse a crop to nothing', () => {
    const c = clampSourceRect({ x: 0.5, y: 0.5, w: 0, h: -1 });
    expect(c.w).toBeGreaterThan(0);
    expect(c.h).toBeGreaterThan(0);
    expect(c.x + c.w).toBeLessThanOrEqual(1);
    expect(c.y + c.h).toBeLessThanOrEqual(1);
  });
});

describe('snapAngle', () => {
  it('settles onto the nearest target when it is close', () => {
    expect(snapAngle(2)).toBe(0);
    expect(snapAngle(44)).toBe(45);
    expect(snapAngle(88)).toBe(90);
    expect(snapAngle(178)).toBe(180);
  });

  it('snaps to the target on the SAME side, not its mirror', () => {
    expect(snapAngle(-44)).toBe(-45);
    expect(snapAngle(-2)).toBe(0);
  });

  it('leaves an angle alone when it is not near anything', () => {
    expect(snapAngle(22)).toBe(22);
    expect(snapAngle(-38)).toBe(-38);
  });
});
