/**
 * The mobile fade mirror against the canonical one.
 *
 * `Preview.tsx` carried its own `transitionOpacity` — the same maths written a
 * second time, agreeing by luck, with nothing checking that it kept agreeing.
 * This is the check. The two copies exist because `apps/mobile` installs
 * outside the pnpm workspace and cannot import `@orbit/video`; the test CAN
 * reach it by relative path, which is what makes the arrangement safe.
 */
import { describe, expect, it } from "vitest";
import { buildEdgeFadeMap, fadeFactorAt } from "../transitions";
import type { VisualTrackClip } from "../../model/types";

const clip = (
  id: string,
  start: number,
  duration: number,
  t?: { type: string; duration: number },
): VisualTrackClip =>
  ({
    id,
    type: "video",
    src: `${id}.mp4`,
    start,
    duration,
    ...(t ? { transitionIn: t } : {}),
  }) as VisualTrackClip;

/** Every shape that behaves differently: none, in only, out only, both, cut. */
const TRACKS: VisualTrackClip[][] = [
  [clip("a", 0, 4), clip("b", 4, 4)],
  [clip("a", 0, 4), clip("b", 4, 4, { type: "fade", duration: 1 })],
  [clip("a", 0, 4, { type: "fade", duration: 0.5 }), clip("b", 4, 4)],
  [
    clip("a", 0, 4, { type: "fade", duration: 0.8 }),
    clip("b", 4, 4, { type: "fade", duration: 1.2 }),
    clip("c", 8, 3, { type: "cut", duration: 1 }),
  ],
  // A non-`cut` type the export has no implementation for. It must collapse to
  // a fade in BOTH copies — a preview that drew a real wipe would look better
  // than the file.
  [clip("a", 0, 4, { type: "wipe", duration: 1 }), clip("b", 4, 4)],
  // Overlapping: the boundary is a real crossfade, so NEITHER clip gets an
  // edge fade. The map must come back empty in both copies.
  [clip("a", 0, 4), clip("b", 3, 4, { type: "fade", duration: 1 })],
  // A real gap. The clips cannot cross-fade, so both copies must fall back to
  // the ramp through the background.
  [clip("a", 0, 4), clip("b", 6, 4, { type: "fade", duration: 1 })],
];

describe("mobile mirrors packages/video", () => {
  it("builds the same edge-fade map", async () => {
    const shared = await import(
      "../../../../../packages/video/src/transitions"
    );
    for (const clips of TRACKS) {
      const mine = buildEdgeFadeMap(clips);
      const theirs = shared.buildEdgeFadeMap(clips as never);
      expect([...mine.entries()].sort()).toEqual(
        [...theirs.entries()].sort(),
      );
    }
  });

  it("samples the same alpha across a sweep", async () => {
    const shared = await import(
      "../../../../../packages/video/src/transitions"
    );
    for (const clips of TRACKS) {
      const mine = buildEdgeFadeMap(clips);
      const theirs = shared.buildEdgeFadeMap(clips as never);
      for (const c of clips) {
        const end = c.start + c.duration;
        // Past both edges as well as inside, because the clamps are where a
        // reimplementation drifts.
        for (let i = -4; i <= 44; i++) {
          const t = c.start + (i / 40) * c.duration;
          expect(fadeFactorAt(mine.get(c.id), c.start, end, t)).toBe(
            shared.fadeFactorAt(theirs.get(c.id), c.start, end, t),
          );
        }
      }
    }
  });

  it("is 1 with no fade at all, so an untouched project is untouched", () => {
    expect(fadeFactorAt(undefined, 0, 4, 2)).toBe(1);
  });
});
