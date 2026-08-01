/**
 * The mobile migration mirror against the canonical one.
 *
 * This one matters more than the other mirrors: both clients sync the same
 * documents, so two copies of a migration that disagree do not produce a
 * rendering difference — they produce a project that changes shape depending on
 * which device opened it last. The test compares OUTPUTS over every fixture
 * shape rather than reading the two files side by side.
 */
import { describe, expect, it } from "vitest";
import { migrateTransitionOverlap, OVERLAP_SCHEMA } from "../migrateOverlap";
import type { VideoProject, VisualTrack } from "../types";

const vclip = (
  id: string,
  start: number,
  duration: number,
  transitionIn?: { type: string; duration: number },
) =>
  ({
    id,
    type: "video",
    src: `${id}.mp4`,
    start,
    duration,
    ...(transitionIn ? { transitionIn } : {}),
  }) as never;

function project(tracks: VideoProject["tracks"], overlays: never[] = []): VideoProject {
  return {
    id: "p",
    schemaVersion: 2,
    width: 1080,
    height: 1920,
    fps: 30,
    background: { type: "color", color: "#000" },
    clips: [],
    overlays,
    audio: [],
    tracks,
  } as VideoProject;
}

const CASES: VideoProject[] = [
  // Nothing to do.
  project([{ id: "m", kind: "visual", clips: [vclip("a", 0, 4), vclip("b", 4, 4)] }]),
  // One fade.
  project([
    {
      id: "m",
      kind: "visual",
      clips: [vclip("a", 0, 4), vclip("b", 4, 4, { type: "fade", duration: 1 })],
    },
  ]),
  // Two fades, plus everything that has to travel with them.
  project(
    [
      {
        id: "m",
        kind: "visual",
        clips: [
          vclip("a", 0, 4),
          vclip("b", 4, 4, { type: "fade", duration: 1 }),
          vclip("c", 8, 4, { type: "fade", duration: 0.5 }),
        ],
      },
      { id: "pip", kind: "visual", clips: [vclip("p", 5, 2)] },
      {
        id: "aud",
        kind: "audio",
        clips: [{ id: "m1", src: "m.mp3", start: 9, duration: 3 } as never],
      },
    ],
    [
      {
        id: "cap",
        type: "text",
        text: "hi",
        start: 9,
        end: 11,
        x: 0.5,
        y: 0.8,
        fontSize: 48,
        color: "#fff",
      } as never,
    ],
  ),
  // A request larger than half the shorter clip: must clamp identically.
  project([
    {
      id: "m",
      kind: "visual",
      clips: [vclip("a", 0, 4), vclip("b", 4, 2, { type: "fade", duration: 2 })],
    },
  ]),
  // A `cut` is not a transition.
  project([
    {
      id: "m",
      kind: "visual",
      clips: [vclip("a", 0, 4), vclip("b", 4, 4, { type: "cut", duration: 1 })],
    },
  ]),
];

describe("mobile mirrors packages/video", () => {
  it("migrates every fixture to the same project", async () => {
    const shared = await import(
      "../../../../../packages/video/src/migrate-overlap"
    );
    for (const p of CASES) {
      expect(migrateTransitionOverlap(p)).toEqual(
        shared.migrateTransitionOverlap(p as never),
      );
    }
  });

  it("agrees on the version it stamps", async () => {
    const shared = await import(
      "../../../../../packages/video/src/migrate-overlap"
    );
    expect(OVERLAP_SCHEMA).toBe(shared.OVERLAP_SCHEMA);
  });

  it("cannot run twice", () => {
    const once = migrateTransitionOverlap(CASES[2]);
    expect(migrateTransitionOverlap(once)).toBe(once);
  });

  it("lays a transitioned clip back and brings everything after it with it", () => {
    const m = migrateTransitionOverlap(CASES[2]);
    const main = (m.tracks![0] as VisualTrack).clips;
    expect(main.map((c) => c.start)).toEqual([0, 3, 6.5]);
    // The caption sat one second into clip c (8); c now starts at 6.5.
    expect(m.overlays[0].start).toBe(7.5);
  });
});
