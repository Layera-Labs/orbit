/**
 * The two editing ops behind the preview's transform handles.
 *
 * These have no canonical twin — no other renderer has direct-manipulation
 * handles — so they are checked against the properties they exist to guarantee
 * rather than against another implementation:
 *
 * - a corner resize holds the OPPOSITE corner still on screen, even when the
 *   clip is turned (the case that is wrong if the delta is not rotated into the
 *   box's own frame);
 * - a mid-edge crop trims the picture without moving what is left of it, which
 *   is what makes it a crop rather than a resize.
 */
import { describe, expect, it } from "vitest";
import {
  cropFromEdge,
  resizeFromCorner,
  type Corner,
  type Edge,
} from "../transform";

const W = 1080;
const H = 1920;
const CORNERS: Corner[] = ["tl", "tr", "bl", "br"];
const EDGES: Edge[] = ["left", "right", "top", "bottom"];

/** The four corners of a rect, in canvas pixels, after rotating about its centre. */
function cornersOf(
  r: { x: number; y: number; w: number; h: number },
  deg: number,
): Record<Corner, [number, number]> {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (r.x + r.w / 2) * W;
  const cy = (r.y + r.h / 2) * H;
  const hw = (r.w * W) / 2;
  const hh = (r.h * H) / 2;
  const at = (ox: number, oy: number): [number, number] => [
    cx + (ox * cos - oy * sin),
    cy + (ox * sin + oy * cos),
  ];
  return {
    tl: at(-hw, -hh),
    tr: at(hw, -hh),
    bl: at(-hw, hh),
    br: at(hw, hh),
  };
}

const opposite: Record<Corner, Corner> = {
  tl: "br",
  tr: "bl",
  bl: "tr",
  br: "tl",
};

const START = { x: 0.2, y: 0.3, w: 0.44, h: 0.3 };

describe("resizeFromCorner", () => {
  it("holds the opposite corner still, at every angle", () => {
    for (const deg of [0, 15, 45, 90, -30, 137, 180]) {
      for (const corner of CORNERS) {
        for (const [dx, dy] of [
          [40, 40],
          [-40, 30],
          [0, -60],
          [90, -20],
        ]) {
          const next = resizeFromCorner(START, deg, corner, dx, dy, W, H);
          const before = cornersOf(START, deg)[opposite[corner]];
          const after = cornersOf(next, deg)[opposite[corner]];
          const label = `${corner} @${deg} by ${dx},${dy}`;
          expect(after[0], `${label} x`).toBeCloseTo(before[0], 6);
          expect(after[1], `${label} y`).toBeCloseTo(before[1], 6);
        }
      }
    }
  });

  it("keeps the proportions, so a resize can never squash a clip", () => {
    const aspect = (START.w * W) / (START.h * H);
    for (const deg of [0, 22.5, 90]) {
      for (const corner of CORNERS) {
        const next = resizeFromCorner(START, deg, corner, 55, -20, W, H);
        expect((next.w * W) / (next.h * H)).toBeCloseTo(aspect, 9);
      }
    }
  });

  it("round-trips: resize out, resize back, same rect", () => {
    for (const deg of [0, 37, -80]) {
      for (const corner of CORNERS) {
        const out = resizeFromCorner(START, deg, corner, 60, 45, W, H);
        const back = resizeFromCorner(out, deg, opposite[corner], 60, 45, W, H);
        // Growing from one corner then from its opposite by the same screen
        // delta returns the original box — the anchors cancel.
        expect(back.w).toBeCloseTo(START.w, 6);
        expect(back.h).toBeCloseTo(START.h, 6);
      }
    }
  });

  it("refuses to collapse the clip", () => {
    for (const corner of CORNERS) {
      const tiny = resizeFromCorner(START, 0, corner, -5000, -5000, W, H);
      expect(tiny.w).toBeGreaterThan(0.05);
      expect(tiny.h).toBeGreaterThan(0.05);
    }
  });
});

describe("cropFromEdge", () => {
  it("trims the box and the source by the same share", () => {
    // Half the width off the right edge takes half the crop window with it.
    const { rect, crop } = cropFromEdge(
      START,
      undefined,
      0,
      "right",
      -(START.w * W) / 2,
      0,
      W,
      H,
    );
    expect(rect.w).toBeCloseTo(START.w / 2, 6);
    expect(crop.w).toBeCloseTo(0.5, 6);
    // Trimming the RIGHT leaves the left edge, and the source, where they were.
    expect(rect.x).toBeCloseTo(START.x, 9);
    expect(crop.x).toBeCloseTo(0, 9);
  });

  it("moves the origin when the LEFT edge is the one trimmed", () => {
    const d = (START.w * W) / 4;
    const { rect, crop } = cropFromEdge(START, undefined, 0, "left", d, 0, W, H);
    expect(rect.x).toBeCloseTo(START.x + d / W, 6);
    expect(rect.w).toBeCloseTo(START.w * 0.75, 6);
    expect(crop.x).toBeCloseTo(0.25, 6);
    expect(crop.w).toBeCloseTo(0.75, 6);
  });

  it("holds the aspect invariant, so the picture does not slide", () => {
    // box aspect / crop aspect stays constant — the property that makes the
    // cover-fit an identity and the remaining picture stay put.
    const ratio = (r: { w: number; h: number }, c: { w: number; h: number }) =>
      ((r.w * W) / (r.h * H)) / (c.w / c.h);
    const before = ratio(START, { w: 1, h: 1 });
    for (const edge of EDGES) {
      // INWARD for each edge — an uncropped clip cannot be un-cropped further,
      // and the crop clamping at the whole frame is exactly what breaks the
      // invariant in the other direction (covered below).
      const [dx, dy] =
        edge === "left"
          ? [30, 0]
          : edge === "right"
            ? [-30, 0]
            : edge === "top"
              ? [0, 30]
              : [0, -30];
      const { rect, crop } = cropFromEdge(START, undefined, 0, edge, dx, dy, W, H);
      expect(ratio(rect, crop), edge).toBeCloseTo(before, 6);
    }
  });

  it("cannot un-crop past the whole frame", () => {
    // Dragging a mid-edge handle OUTWARD on a clip that is not cropped would
    // ask for source that does not exist. The window clamps; the box does not
    // grow to match, which is the honest outcome — there is nothing to reveal.
    // +dx on the RIGHT handle drags it outward. (Inward is -dx there; the
    // handle moves with the finger, so the sign is per-edge.)
    const { crop } = cropFromEdge(START, undefined, 0, "right", 400, 0, W, H);
    expect(crop.w).toBe(1);
    expect(crop.x).toBe(0);
  });

  it("keeps the crop inside the source however far it is dragged", () => {
    for (const edge of EDGES) {
      for (const d of [-9000, -300, 300, 9000]) {
        const { crop } = cropFromEdge(START, undefined, 0, edge, d, d, W, H);
        expect(crop.x, edge).toBeGreaterThanOrEqual(0);
        expect(crop.y, edge).toBeGreaterThanOrEqual(0);
        expect(crop.x + crop.w, edge).toBeLessThanOrEqual(1 + 1e-9);
        expect(crop.y + crop.h, edge).toBeLessThanOrEqual(1 + 1e-9);
        expect(crop.w, edge).toBeGreaterThan(0);
        expect(crop.h, edge).toBeGreaterThan(0);
      }
    }
  });

  it("moves the box along its OWN axis when the clip is turned", () => {
    // At 90 degrees the box's local +x is the screen's +y, so trimming the left
    // edge must move the origin down the screen, not across it.
    const d = 60;
    const { rect } = cropFromEdge(START, undefined, 90, "left", 0, d, W, H);
    expect(rect.x).toBeCloseTo(START.x, 6);
    expect(rect.y).toBeCloseTo(START.y + d / H, 6);
  });
});
