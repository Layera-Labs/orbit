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
  isAlphaOnly,
  MAX_OVERLAP_FRAC,
  planMainRuns,
  previewableTransitions,
  resolveTransitions,
  TRANSITIONS,
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
  // A geometric run of three, which is one xfade chain rather than three.
  [
    clip("a", 0, 4),
    clip("b", 3, 4, { type: "wipeleft", duration: 1 }),
    clip("c", 6, 4, { type: "slideup", duration: 1 }),
  ],
  // The other three wipe directions, so both axes and both split rules are
  // compared and not just the one the shared fixture happens to lead with.
  [
    clip("a", 0, 4),
    clip("b", 3, 4, { type: "wiperight", duration: 1 }),
    clip("c", 6, 4, { type: "wipeup", duration: 1 }),
    clip("d", 9, 4, { type: "wipedown", duration: 1 }),
  ],
  // The sliding families: both pictures move, only the incoming one, only the
  // outgoing one. Three different answers from one shared function.
  [
    clip("a", 0, 4),
    clip("b", 3, 4, { type: "slideleft", duration: 1 }),
    clip("c", 6, 4, { type: "coverup", duration: 1 }),
    clip("d", 9, 4, { type: "revealright", duration: 1 }),
  ],
  // A fade in the middle of two geometric boundaries: two runs, not one.
  [
    clip("a", 0, 4),
    clip("b", 3, 4, { type: "wipeleft", duration: 1 }),
    clip("c", 6, 4, { type: "fade", duration: 1 }),
    clip("d", 9, 4, { type: "coverdown", duration: 1 }),
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
          // With a canvas, so the geometric families are compared as
          // GEOMETRY and not just as an alpha the wipes do not use.
          expect(xfadeStateFor(mine.get(c.id), t, 1080, 1920)).toEqual(
            s.xfadeStateFor(theirs.get(c.id), t, 1080, 1920),
          );
        }
      }
    }
  });

  it("agrees on the same overlap ceiling", async () => {
    expect(MAX_OVERLAP_FRAC).toBe((await shared()).MAX_OVERLAP_FRAC);
  });

  it("groups the same clips into the same xfade runs", async () => {
    /*
     * The export builds a run as one stream; the preview has to composite the
     * same clips as one group or the two disagree about what is on screen.
     * Which is why the grouping lives in the shared module and not in
     * `ffmpeg.ts`, where only one of them could read it.
     */
    const s = await shared();
    for (const clips of TRACKS) {
      expect(planMainRuns(clips, resolveTransitions(clips).boundaries)).toEqual(
        s.planMainRuns(clips as never, s.resolveTransitions(clips as never).boundaries),
      );
    }
  });

  it("offers the same catalogue, in the same order", async () => {
    // The picker is built from this. Two clients offering different
    // transitions for the same project is the sync bug, not a cosmetic one.
    expect(TRANSITIONS).toEqual((await shared()).TRANSITIONS);
  });

  it("subtracts the same families for the same server", async () => {
    /*
     * The gate has to agree across clients for the same reason the catalogue
     * does. A phone that offers Push against an ffmpeg 5.1 server while the
     * web app hides it means one of them authors a project the other cannot
     * render — and the failure surfaces at export, on whichever client did not
     * make the choice.
     *
     * The token list here is ffmpeg 5.1's shape: wipes and slides, no
     * `cover*`/`reveal*`.
     */
    const ffmpeg51 = ["fade", "wipeleft", "wiperight", "slideleft", "slideup"];
    const mine = previewableTransitions(ffmpeg51);
    expect(mine).toEqual((await shared()).previewableTransitions(ffmpeg51));
    expect(mine.map((f) => f.key)).not.toContain("push");
    expect(mine.map((f) => f.key)).not.toContain("reveal");
  });

  it("subtracts nothing on both when the server is unknown", async () => {
    // Unknown must not read as "supports nothing" on either client: the
    // editor has to keep working with no server reachable at all.
    expect(previewableTransitions([])).toEqual(previewableTransitions());
    expect(previewableTransitions([])).toEqual(
      (await shared()).previewableTransitions([]),
    );
  });
});

describe("planMainRuns", () => {
  const runs = (cs: VisualTrackClip[]) =>
    planMainRuns(cs, resolveTransitions(cs).boundaries).map((r) => r.clipIdx);

  it("joins consecutive geometric boundaries into one run", () => {
    expect(
      runs([
        clip("a", 0, 4),
        clip("b", 3, 4, { type: "wipeleft", duration: 1 }),
        clip("c", 6, 4, { type: "slideup", duration: 1 }),
      ]),
    ).toEqual([[0, 1, 2]]);
  });

  it("leaves a fade out of every run", () => {
    // It needs no xfade filter at all, so it stays on the ordinary path.
    expect(isAlphaOnly("fade")).toBe(true);
    expect(runs([clip("a", 0, 4), clip("b", 3, 4, { type: "fade", duration: 1 })])).toEqual(
      [],
    );
  });

  it("breaks at a cut, and starts again after it", () => {
    expect(
      runs([
        clip("a", 0, 4),
        clip("b", 3, 4, { type: "wipeleft", duration: 1 }),
        clip("c", 7, 4),
        clip("d", 10, 4, { type: "wipeup", duration: 1 }),
      ]),
    ).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("breaks where the clips do not overlap", () => {
    // A gap resolves to an edge fade, which produces no boundary and so no run.
    expect(
      runs([clip("a", 0, 4), clip("b", 6, 4, { type: "wipeleft", duration: 1 })]),
    ).toEqual([]);
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
