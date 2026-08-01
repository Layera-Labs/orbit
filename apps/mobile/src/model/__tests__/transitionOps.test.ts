/**
 * Setting a transition, and what it does to the timeline.
 *
 * The thing worth pinning down: a transition is an OVERLAP, not a field. Write
 * the field alone and the model claims a crossfade across an interval where the
 * two clips never actually meet, and every renderer quietly falls back to a
 * ramp through the background — a control that looks like it did something and
 * did not.
 */
import { describe, expect, it } from "vitest";
import {
  clipAtTime,
  clipsAtTime,
  packVisualTrack,
  rippleDeleteClip,
  setClipTransition,
  splitClipAt,
} from "../editor-ops";
import { resolveTransitions } from "../../preview/xfade";
import type { VideoProject, VisualTrack } from "../types";

const vclip = (id: string, start: number, duration: number) =>
  ({ id, type: "video", src: `${id}.mp4`, start, duration }) as never;

function project(): VideoProject {
  return {
    id: "p",
    schemaVersion: 3,
    width: 1080,
    height: 1920,
    fps: 30,
    background: { type: "color", color: "#000" },
    clips: [],
    overlays: [],
    audio: [],
    tracks: [
      {
        id: "m",
        kind: "visual",
        clips: [vclip("a", 0, 4), vclip("b", 4, 4), vclip("c", 8, 4)],
      },
      {
        id: "aud",
        kind: "audio",
        clips: [{ id: "m1", src: "m.mp3", start: 8, duration: 4 } as never],
      },
    ],
  } as VideoProject;
}

const main = (p: VideoProject) => (p.tracks![0] as VisualTrack).clips;
const fade = { type: "fade" as const, duration: 1 };

describe("setClipTransition", () => {
  it("lays the clip back and brings the rest of the track with it", () => {
    const p = setClipTransition(project(), "m", "b", fade);
    expect(main(p).map((c) => c.start)).toEqual([0, 3, 7]);
  });

  it("produces geometry the resolver reads back as a real crossfade", () => {
    // Writing the field without moving anything is the bug this guards: the
    // resolver would see clips that only touch and fall back to an edge fade.
    const p = setClipTransition(project(), "m", "b", fade);
    const r = resolveTransitions(main(p));
    expect(r.edges).toEqual([]);
    expect(r.boundaries[0]).toMatchObject({ prevId: "a", nextId: "b", overlap: 1 });
  });

  it("gives the time back when the transition is removed", () => {
    const on = setClipTransition(project(), "m", "b", fade);
    const off = setClipTransition(on, "m", "b", undefined);
    expect(main(off).map((c) => c.start)).toEqual([0, 4, 8]);
  });

  it("moves only its own track — captions and music stay where they were put", () => {
    const p = setClipTransition(project(), "m", "b", fade);
    expect((p.tracks![1] as { clips: { start: number }[] }).clips[0].start).toBe(8);
  });

  it("shortens by the DIFFERENCE when a transition is retimed", () => {
    const one = setClipTransition(project(), "m", "b", fade);
    const two = setClipTransition(one, "m", "b", { type: "fade", duration: 2 });
    // 4 → 3 → 2, not 4 → 3 → 1.
    expect(main(two).map((c) => c.start)).toEqual([0, 2, 6]);
  });

  it("clamps to half the shorter clip", () => {
    const p = setClipTransition(project(), "m", "b", { type: "fade", duration: 9 });
    expect(main(p)[1].start).toBe(2);
  });

  it("does nothing for a cut, which is the absence of a transition", () => {
    const p = setClipTransition(project(), "m", "b", { type: "cut", duration: 1 });
    expect(main(p).map((c) => c.start)).toEqual([0, 4, 8]);
  });
});

describe("the ops that move clips around a transition", () => {
  it("packs with the overlap, so packing is idempotent after a transition", () => {
    const p = setClipTransition(project(), "m", "b", fade);
    expect(main(packVisualTrack(p, "m")).map((c) => c.start)).toEqual([0, 3, 7]);
  });

  it("ripples by the clip's NET cost, not by its duration", () => {
    /*
     * b is 4s long but only occupies 3s of the track — the first second of it
     * is spent overlapping a. Deleting it must therefore close 3s, or the
     * picture ends up ahead of every other track by the difference.
     */
    const p = setClipTransition(project(), "m", "b", fade);
    expect(main(rippleDeleteClip(p, "m", "b")).map((c) => c.start)).toEqual([0, 4]);
  });

  it("does not let a split tail claim a transition with its own head", () => {
    // Inherited through the object spread before this. After overlap it would
    // mean an xfade whose offset is negative.
    const p = setClipTransition(project(), "m", "b", fade);
    const split = splitClipAt(p, "m", "b", 5);
    const parts = main(split).filter((c) => c.start >= 3 && c.start < 7);
    expect(parts[0].transitionIn).toEqual(fade);
    expect(parts[1].transitionIn).toBeUndefined();
  });
});

describe("clipsAtTime", () => {
  it("returns both sides inside a transition and one outside it", () => {
    const track = setClipTransition(project(), "m", "b", fade).tracks![0];
    expect(clipsAtTime(track, 3.5).map((c) => c.id)).toEqual(["a", "b"]);
    expect(clipsAtTime(track, 2).map((c) => c.id)).toEqual(["a"]);
    expect(clipsAtTime(track, 5).map((c) => c.id)).toEqual(["b"]);
  });

  it("picks the more visible side for a single answer", () => {
    // The overlap runs 3 → 4. Before its midpoint the outgoing clip is what you
    // are looking at; after it, the incoming one.
    const track = setClipTransition(project(), "m", "b", fade).tracks![0];
    expect(clipAtTime(track, 3.2)!.id).toBe("a");
    expect(clipAtTime(track, 3.8)!.id).toBe("b");
  });
});
