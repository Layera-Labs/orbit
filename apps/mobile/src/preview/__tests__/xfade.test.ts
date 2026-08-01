/**
 * The mobile transition mirror against the canonical one.
 *
 * The two copies exist because `apps/mobile` installs outside the pnpm
 * workspace and cannot import `@orbit/video`; the test CAN reach it by relative
 * path, which is what makes the arrangement safe. It compares OUTPUTS — a
 * side-by-side read of two files is exactly the check that stops happening.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_OVERLAP_FRAC,
  resolveTransitions,
  xfadeMapOf,
  xfadeProgressAt,
  xfadeStateFor,
} from "../xfade";
import type { BlendMode, VisualTrackClip } from "../../model/types";

const clip = (
  id: string,
  start: number,
  duration: number,
  t?: { type: string; duration: number },
  blend?: BlendMode,
): VisualTrackClip =>
  ({
    id,
    type: "video",
    src: `${id}.mp4`,
    start,
    duration,
    ...(t ? { transitionIn: t } : {}),
    ...(blend ? { blend } : {}),
  }) as VisualTrackClip;

/** Every shape that resolves differently. */
const TRACKS: VisualTrackClip[][] = [
  // No transition at all.
  [clip("a", 0, 4), clip("b", 4, 4)],
  // Butt-joined with one set: no overlap, so it can only ramp from background.
  [clip("a", 0, 4), clip("b", 4, 4, { type: "fade", duration: 1 })],
  // A real gap.
  [clip("a", 0, 4), clip("b", 6, 4, { type: "fade", duration: 1 })],
  // Overlapping — the real thing.
  [clip("a", 0, 4), clip("b", 3, 4, { type: "fade", duration: 1 })],
  // Overlapping further than half the shorter clip: must clamp.
  [clip("a", 0, 4), clip("b", 2, 2, { type: "fade", duration: 2 })],
  // A transition on the FIRST clip, with nothing before it.
  [clip("a", 0, 4, { type: "fade", duration: 1 }), clip("b", 3, 4)],
  // A blend on one side: the boundary survives, downgraded to a fade.
  [clip("a", 0, 4, undefined, "screen"), clip("b", 3, 4, { type: "fade", duration: 1 })],
  // `cut` is not a transition.
  [clip("a", 0, 4), clip("b", 3, 4, { type: "cut", duration: 1 })],
  // Three clips, two live boundaries.
  [
    clip("a", 0, 4),
    clip("b", 3.5, 4, { type: "fade", duration: 0.5 }),
    clip("c", 6.5, 4, { type: "wipe", duration: 1 }),
  ],
];

const shared = () => import("../../../../../packages/video/src/xfade");

describe("mobile mirrors packages/video", () => {
  it("resolves every boundary the same way", async () => {
    const s = await shared();
    for (const clips of TRACKS) {
      expect(resolveTransitions(clips)).toEqual(
        s.resolveTransitions(clips as never),
      );
    }
  });

  it("samples the same state across a sweep", async () => {
    const s = await shared();
    for (const clips of TRACKS) {
      const mine = xfadeMapOf(resolveTransitions(clips).boundaries);
      const theirs = s.xfadeMapOf(s.resolveTransitions(clips as never).boundaries);
      for (const c of clips) {
        // Past both edges as well as inside: the clamps are where a
        // reimplementation drifts.
        for (let i = -8; i <= 48; i++) {
          const t = c.start + (i / 40) * c.duration;
          expect(xfadeStateFor(mine.get(c.id), t)).toEqual(
            s.xfadeStateFor(theirs.get(c.id), t),
          );
        }
      }
    }
  });

  it("agrees on the same overlap ceiling", async () => {
    expect(MAX_OVERLAP_FRAC).toBe((await shared()).MAX_OVERLAP_FRAC);
  });
});

describe("xfadeProgressAt", () => {
  it("runs 0 → 1 across the window", () => {
    expect(xfadeProgressAt(4, 4, 2)).toBe(0);
    expect(xfadeProgressAt(5, 4, 2)).toBe(0.5);
    expect(xfadeProgressAt(6, 4, 2)).toBe(1);
  });

  it("clamps outside it", () => {
    expect(xfadeProgressAt(0, 4, 2)).toBe(0);
    expect(xfadeProgressAt(99, 4, 2)).toBe(1);
  });

  it("does not divide by a zero-length window", () => {
    expect(xfadeProgressAt(4, 4, 0)).toBe(1);
    expect(xfadeProgressAt(3, 4, 0)).toBe(0);
  });
});

describe("resolveTransitions", () => {
  it("takes the overlap from the geometry, not from the stored duration", () => {
    /*
     * The stored duration is the REQUEST — what the packer applied. What
     * renders is what you can see on the timeline, so a clip dragged after the
     * fact cannot leave the export doing something the picture does not show.
     */
    const clips = [clip("a", 0, 4), clip("b", 3.25, 4, { type: "fade", duration: 1 })];
    expect(resolveTransitions(clips).boundaries[0].overlap).toBe(0.75);
  });

  it("keeps a blended boundary, as a fade", () => {
    // Downgraded rather than dropped: a blended clip cannot join an xfade run,
    // but with overlap a plain alpha ramp IS a crossfade, so nothing is lost.
    const clips = [
      clip("a", 0, 4, undefined, "multiply"),
      clip("b", 3, 4, { type: "fade", duration: 1 }),
    ];
    const b = resolveTransitions(clips).boundaries[0];
    expect(b.name).toBe("fade");
    expect(b.downgraded).toBe("blend");
  });

  it("says why a boundary fell back", () => {
    const gapped = [clip("a", 0, 4), clip("b", 6, 4, { type: "fade", duration: 1 })];
    expect(resolveTransitions(gapped).edges[0].reason).toBe("no-overlap");
    const first = [clip("a", 0, 4, { type: "fade", duration: 1 })];
    expect(resolveTransitions(first).edges[0].reason).toBe("no-predecessor");
  });
});
