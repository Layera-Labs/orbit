/**
 * The vendored `imageOverlayAsClip` against the canonical one.
 *
 * `apps/mobile` installs outside the pnpm workspace and cannot import
 * `@orbit/video`, so this module is a hand-copy — and a hand-copy is held
 * together by exactly one thing, which is a test that imports BOTH by relative
 * path and asserts they answer identically. Comments do not do it and the type
 * checker cannot see across the boundary at all.
 *
 * The conversion decides where a sticker lands in the exported file AND on
 * screen, so a drift here is the two surfaces disagreeing about a position —
 * which is the failure this whole engine is arranged to prevent.
 */
import { describe, expect, it } from "vitest";
import { imageOverlayAsClip, imageOverlaysOf } from "../overlay-clip";
import {
  imageOverlayAsClip as canonicalAsClip,
  imageOverlaysOf as canonicalImagesOf,
} from "../../../../../packages/video/src/overlay-clip";
import type { ImageOverlay } from "../types";

const base: ImageOverlay = {
  id: "sticker",
  type: "image",
  src: "star.png",
  start: 1,
  end: 5,
  x: 0.3,
  y: 0.25,
  width: 0.4,
  height: 0.2,
};

/**
 * Cases chosen so each exercises a branch the conversion actually has: the
 * bare shape, every optional field, the legacy animation the clip type has no
 * home for, keyframes (which are shifted out of centre space), and the
 * degenerate window.
 */
const CASES: { name: string; o: ImageOverlay }[] = [
  { name: "bare", o: base },
  { name: "rotated", o: { ...base, rotation: 37 } },
  { name: "faded", o: { ...base, opacity: 0.4 } },
  { name: "legacy animation", o: { ...base, animation: "fade" } },
  {
    name: "explicit animation",
    o: {
      ...base,
      animateIn: { type: "slide", duration: 0.5, edge: "left" },
      animateOut: { type: "fade", duration: 0.25 },
    },
  },
  {
    name: "keyframed",
    o: {
      ...base,
      keyframes: [
        { t: 0, x: 0.1, y: 0.9, opacity: 0.2 },
        { t: 1, x: 0.5, y: 0.5, opacity: 1 },
      ],
    },
  },
  {
    name: "masked and moving",
    o: {
      ...base,
      mask: { shape: "circle", cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.3 },
      motion: { type: "zoomIn", intensity: 0.5 },
    },
  },
  { name: "zero-length window", o: { ...base, end: 1 } },
  { name: "off-canvas", o: { ...base, x: -0.2, y: 1.4 } },
];

describe("imageOverlayAsClip matches the canonical engine", () => {
  for (const { name, o } of CASES) {
    it(`agrees on ${name}`, () => {
      // `toEqual` compares own enumerable keys, so a mirror that PARKED an
      // undefined where the canonical copy omits the key fails here — which is
      // the difference the renderers actually branch on.
      expect(imageOverlayAsClip(o)).toEqual(canonicalAsClip(o as never));
      expect(Object.keys(imageOverlayAsClip(o))).toEqual(
        Object.keys(canonicalAsClip(o as never)),
      );
    });
  }

  it("narrows a mixed list the same way", () => {
    const mixed = [
      base,
      {
        id: "cap",
        type: "text" as const,
        text: "hi",
        start: 0,
        end: 1,
        x: 0.5,
        y: 0.5,
        fontSize: 32,
        color: "#fff",
      },
    ];
    expect(imageOverlaysOf(mixed).map((o) => o.id)).toEqual(
      canonicalImagesOf(mixed as never).map((o) => o.id),
    );
  });
});

describe("the conversion itself", () => {
  it("puts the box's CENTRE on the overlay's anchor", () => {
    // The one piece of arithmetic here that can be wrong and still look
    // plausible: a sticker off by half its own width reads as "placed a bit
    // oddly", not as broken.
    const c = imageOverlayAsClip(base);
    expect(c.rect!.x + c.rect!.w / 2).toBeCloseTo(base.x, 10);
    expect(c.rect!.y + c.rect!.h / 2).toBeCloseTo(base.y, 10);
  });
});
