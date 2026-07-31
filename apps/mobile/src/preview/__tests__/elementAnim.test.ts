/**
 * The mobile element-animation mirror against the canonical one.
 *
 * Output equality over a sweep, in the `curve.test.ts` idiom. The expression
 * builder is compared as a STRING because it is a string the export ships — if
 * the two copies ever emit different filtergraph text, the preview and the file
 * are computing different things whatever the samplers say.
 */
import { describe, expect, it } from "vitest";
import {
  animWindows,
  elementFadeAt,
  hasAnim,
  hasFade,
  hasSlide,
  resolveAnim,
  slideExpr,
  slideOffsetAt,
  type ElementAnimPair,
} from "../elementAnim";

const W = 1080;
const H = 1920;

const PAIRS: ElementAnimPair[] = [
  {},
  { in: { type: "none", duration: 1 } },
  { in: { type: "fade", duration: 1 } },
  { out: { type: "fade", duration: 0.4 } },
  { in: { type: "fade", duration: 1 }, out: { type: "fade", duration: 2 } },
  { in: { type: "slide", duration: 1, edge: "left" } },
  { in: { type: "slide", duration: 1, edge: "up" }, out: { type: "slide", duration: 0.5, edge: "right" } },
  { in: { type: "slide", duration: 1, edge: "down", distance: 0.6 } },
  // Both ends longer than the element, so the half-window clamp is exercised.
  { in: { type: "fade", duration: 9 }, out: { type: "fade", duration: 9 } },
  { in: { type: "slide", duration: 9, edge: "left" }, out: { type: "slide", duration: 9, edge: "left" } },
];

const WINDOWS: [number, number][] = [
  [0, 4],
  [2, 7],
  [1.5, 2.5],
];

describe("mobile mirrors packages/video", () => {
  it("agrees on the gates, the windows, the fade and the offset", async () => {
    const shared = await import(
      "../../../../../packages/video/src/element-anim"
    );
    for (const a of PAIRS) {
      expect(hasAnim(a)).toBe(shared.hasAnim(a as never));
      expect(hasFade(a)).toBe(shared.hasFade(a as never));
      expect(hasSlide(a)).toBe(shared.hasSlide(a as never));
      for (const [s, e] of WINDOWS) {
        for (const kind of ["fade", "slide"] as const)
          expect(animWindows(a, s, e, kind)).toEqual(
            shared.animWindows(a as never, s, e, kind),
          );
        // Past both ends as well as inside — the clamps are where copies drift.
        for (let i = -4; i <= 44; i++) {
          const t = s + ((e - s) * i) / 40;
          expect(elementFadeAt(a, s, e, t)).toBe(
            shared.elementFadeAt(a as never, s, e, t),
          );
          expect(slideOffsetAt(a, s, e, t, W, H)).toEqual(
            shared.slideOffsetAt(a as never, s, e, t, W, H),
          );
        }
        for (const axis of ["x", "y"] as const)
          expect(slideExpr(a, s, e, W, H, axis)).toBe(
            shared.slideExpr(a as never, s, e, W, H, axis),
          );
      }
    }
  });

  it("resolves the legacy caption fade identically", async () => {
    const shared = await import(
      "../../../../../packages/video/src/element-anim"
    );
    for (const el of [
      { animation: "fade" as const },
      { animation: "none" as const },
      {},
      { animation: "fade" as const, animateIn: { type: "slide" as const, duration: 1 } },
    ])
      expect(resolveAnim(el)).toEqual(shared.resolveAnim(el as never));
  });
});

/**
 * The keyframe gates, which the preview was missing entirely.
 *
 * Two keyframes that change nothing are IGNORED by the export. Without these
 * predicates the preview sampled them anyway and moved a clip the file left
 * still — the drift is invisible until someone adds a keyframe and only then
 * discovers the export disagrees.
 */
describe("keyframe gates mirror packages/video", () => {
  it("agrees on whether a list animates anything", async () => {
    const mine = await import("../keyframes");
    const shared = await import("../../../../../packages/video/src/keyframes");
    const LISTS = [
      [
        { t: 0, opacity: 1, x: 0.1, y: 0.1 },
        { t: 1, opacity: 1, x: 0.1, y: 0.1 },
      ], // nothing moves — the case that used to drift
      [
        { t: 0, opacity: 0, x: 0.1, y: 0.1 },
        { t: 1, opacity: 1, x: 0.1, y: 0.1 },
      ],
      [
        { t: 0, opacity: 1, x: 0, y: 0 },
        { t: 1, opacity: 1, x: 0.5, y: 0.2 },
      ],
    ];
    for (const kfs of LISTS) {
      expect(mine.animatesOpacity(kfs)).toBe(
        shared.animatesOpacity(kfs as never),
      );
      expect(mine.animatesPosition(kfs)).toBe(
        shared.animatesPosition(kfs as never),
      );
    }
  });
});
