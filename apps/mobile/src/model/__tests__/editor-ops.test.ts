import { describe, expect, it } from "vitest";
import {
  addTitleCard,
  addVisualClip,
  removeTitleCard,
  removeTrackGap,
  reorderVisualClips,
  rippleInsertClip,
  rippleDeleteClip,
  rippleDeleteOverlay,
  setClipMagnifier,
  setClipMosaic,
  setClipNote,
  setClipStart,
  splitClipAt,
  titleCardOf,
} from "../editor-ops";
import type { VideoProject, VisualTrackClip } from "../types";

const project: VideoProject = {
  id: "project",
  schemaVersion: 2,
  width: 1080,
  height: 1920,
  fps: 30,
  background: { type: "color", color: "#000000" },
  clips: [],
  audio: [],
  overlays: [
    {
      id: "title",
      type: "text",
      text: "Keep my timing",
      start: 1,
      end: 3,
      x: 0.5,
      y: 0.5,
      fontSize: 72,
      color: "#ffffff",
    },
  ],
  tracks: [
    {
      id: "main",
      kind: "visual",
      clips: [
        {
          id: "image-1",
          type: "image",
          src: "first.jpg",
          start: 4,
          duration: 2,
        },
        {
          id: "image-2",
          type: "image",
          src: "second.jpg",
          start: 6,
          duration: 2,
        },
      ],
    },
    {
      id: "music",
      kind: "audio",
      clips: [
        {
          id: "song",
          src: "song.mp3",
          start: 2,
          duration: 6,
        },
      ],
    },
  ],
};

describe("splitClipAt", () => {
  const withVideo: VideoProject = {
    ...project,
    tracks: [
      {
        id: "main",
        kind: "visual",
        clips: [
          {
            id: "vid",
            type: "video",
            src: "a.mp4",
            start: 0,
            duration: 10,
            trimIn: 0,
            speed: 2,
          },
        ],
      },
    ],
  };

  const halves = (p: VideoProject) =>
    (p.tracks?.find((t) => t.id === "main")?.clips ?? []) as VisualTrackClip[];

  // Regression: `trimIn` is a SOURCE offset but the split point is a TIMELINE
  // offset. Both preview and export map timeline→source as
  // `trimIn + elapsed * speed`, so ignoring speed replayed footage at the cut.
  it("scales the second half's trimIn by the clip speed", () => {
    const [first, second] = halves(splitClipAt(withVideo, "main", "vid", 5));
    expect(first.duration).toBe(5);
    expect(second.start).toBe(5);
    expect(second.duration).toBe(5);
    // First half consumes source 0→10s at 2×, so the second half must start at 10.
    expect(second.trimIn).toBe(10);
  });

  it("respects an existing trimIn", () => {
    const shifted = {
      ...withVideo,
      tracks: [
        {
          id: "main",
          kind: "visual" as const,
          clips: [{ ...halves(withVideo)[0], trimIn: 3 }],
        },
      ],
    };
    const [, second] = halves(splitClipAt(shifted, "main", "vid", 5));
    expect(second.trimIn).toBe(13);
  });

  it("leaves a 1x clip's trimIn as the plain timeline offset", () => {
    const normal = {
      ...withVideo,
      tracks: [
        {
          id: "main",
          kind: "visual" as const,
          clips: [{ ...halves(withVideo)[0], speed: 1 }],
        },
      ],
    };
    const [, second] = halves(splitClipAt(normal, "main", "vid", 4));
    expect(second.trimIn).toBe(4);
  });
});

describe("rippleInsertClip", () => {
  it("pushes later clips aside instead of stacking on top of them", () => {
    // Duplicating image-1 (4s..6s) lands the copy at 6s — exactly where
    // image-2 already sits. Without a ripple both occupy 6s..8s, so the
    // preview shows one and the export composites both.
    const copy: VisualTrackClip = {
      id: "copy",
      type: "image",
      src: "first.jpg",
      start: 6,
      duration: 2,
    };
    const result = rippleInsertClip(project, "main", copy);
    const clips = result.tracks?.find((t) => t.id === "main")
      ?.clips as VisualTrackClip[];
    expect(clips.map((c) => [c.id, c.start])).toEqual([
      ["image-1", 4],
      ["copy", 6],
      ["image-2", 8],
    ]);
    // No two clips share an interval.
    const overlaps = clips.some((a, i) =>
      clips.some((b, j) => i !== j && a.start < b.start + b.duration && b.start < a.start + a.duration),
    );
    expect(overlaps).toBe(false);
  });

  it("leaves earlier clips where they are", () => {
    const copy: VisualTrackClip = {
      id: "late",
      type: "image",
      src: "x.jpg",
      start: 8,
      duration: 1,
    };
    const clips = rippleInsertClip(project, "main", copy).tracks?.find(
      (t) => t.id === "main",
    )?.clips as VisualTrackClip[];
    expect(clips.map((c) => c.start)).toEqual([4, 6, 8]);
  });
});

describe("track ordering", () => {
  it("keeps a track sorted after a clip is dragged earlier", () => {
    // Preview and ffmpeg both read a clip's transition from the NEIGHBOURING
    // array entry, so an unsorted track takes the fade from the wrong clip.
    const moved = setClipStart(project, "main", "image-2", 0);
    const clips = moved.tracks?.find((t) => t.id === "main")?.clips ?? [];
    expect(clips.map((c) => c.id)).toEqual(["image-2", "image-1"]);
    expect(clips.map((c) => c.start)).toEqual([0, 4]);
  });
});

describe("reorderVisualClips", () => {
  const main = (p: VideoProject) =>
    (p.tracks?.find((t) => t.id === "main")?.clips ?? []) as VisualTrackClip[];

  it("moves a clip later and repacks the sequence back to back", () => {
    const result = reorderVisualClips(project, "main", 0, 1);
    expect(main(result).map((c) => [c.id, c.start])).toEqual([
      ["image-2", 4],
      ["image-1", 6],
    ]);
  });

  it("keeps the sequence anchored at its original first start", () => {
    // The fixture starts at 4s, not 0 — reordering must not slide it to zero.
    expect(main(reorderVisualClips(project, "main", 1, 0))[0]?.start).toBe(4);
  });

  it("closes gaps left inside the sequence", () => {
    const gapped: VideoProject = {
      ...project,
      tracks: [
        {
          id: "main",
          kind: "visual",
          clips: [
            { ...main(project)[0], start: 0, duration: 2 },
            { ...main(project)[1], start: 9, duration: 3 },
          ],
        },
      ],
    };
    expect(main(reorderVisualClips(gapped, "main", 0, 1)).map((c) => c.start)).toEqual([0, 3]);
  });

  it("is a no-op for out-of-range or identical indices", () => {
    expect(reorderVisualClips(project, "main", 0, 0)).toBe(project);
    expect(reorderVisualClips(project, "main", 0, 5)).toBe(project);
    expect(reorderVisualClips(project, "main", -1, 0)).toBe(project);
  });

  it("leaves other tracks untouched", () => {
    const result = reorderVisualClips(project, "main", 0, 1);
    expect(result.tracks?.find((t) => t.id === "music")?.clips[0]?.start).toBe(2);
  });
});

describe("title card", () => {
  it("opens a hole at the head and shifts every track and overlay", () => {
    const result = addTitleCard(project, "Chapter one", 2);
    const main = result.tracks?.find((t) => t.id === "main");
    const music = result.tracks?.find((t) => t.id === "music");
    const card = titleCardOf(result);

    expect(card?.text).toBe("Chapter one");
    expect([card?.start, card?.end]).toEqual([0, 2]);
    expect(main?.clips.map((c) => c.start)).toEqual([6, 8]);
    expect(music?.clips[0]?.start).toBe(4);
    // The pre-existing caption moves with everything else.
    expect(result.overlays.find((o) => o.id === "title")?.start).toBe(3);
  });

  it("round-trips exactly back to the original timeline", () => {
    const restored = removeTitleCard(addTitleCard(project, "Chapter one", 2));
    expect(titleCardOf(restored)).toBeUndefined();
    expect(restored.tracks?.find((t) => t.id === "main")?.clips.map((c) => c.start)).toEqual([4, 6]);
    expect(restored.tracks?.find((t) => t.id === "music")?.clips[0]?.start).toBe(2);
    expect(restored.overlays.find((o) => o.id === "title")?.start).toBe(1);
  });

  it("refuses to add a second card", () => {
    const once = addTitleCard(project, "One", 2);
    expect(addTitleCard(once, "Two", 2)).toBe(once);
  });

  it("is a no-op to remove when there is no card", () => {
    expect(removeTitleCard(project)).toBe(project);
  });

  it("sits above every existing overlay layer", () => {
    const layered: VideoProject = {
      ...project,
      overlays: [{ ...project.overlays[0], layer: 4 }],
    };
    expect(titleCardOf(addTitleCard(layered, "T", 2))?.layer).toBe(5);
  });
});

describe("setClipNote", () => {
  it("stores a note on one clip only", () => {
    const result = setClipNote(project, "main", "image-1", "wide establishing");
    const clips = result.tracks?.find((t) => t.id === "main")
      ?.clips as VisualTrackClip[];
    expect(clips[0]?.note).toBe("wide establishing");
    expect(clips[1]?.note).toBeUndefined();
  });

  it("clears the note when blanked, rather than storing whitespace", () => {
    const set = setClipNote(project, "main", "image-1", "note");
    const cleared = setClipNote(set, "main", "image-1", "   ");
    const clips = cleared.tracks?.find((t) => t.id === "main")
      ?.clips as VisualTrackClip[];
    expect(clips[0]?.note).toBeUndefined();
  });
});

describe("removeTrackGap", () => {
  it("closes the selected track gap without moving other tracks or overlays", () => {
    const result = removeTrackGap(project, "main", 0, 4);
    const main = result.tracks?.find((track) => track.id === "main");
    const music = result.tracks?.find((track) => track.id === "music");

    expect(main?.clips.map((clip) => clip.start)).toEqual([0, 2]);
    expect(music?.clips[0]?.start).toBe(2);
    expect(result.overlays[0]?.start).toBe(1);
    expect(project.tracks?.[0]?.clips[0]?.start).toBe(4);
  });

  it("keeps newly inserted gap media in chronological track order", () => {
    const result = addVisualClip(project, "main", {
      id: "gap-image",
      type: "image",
      src: "gap.jpg",
      start: 0,
      duration: 4,
    });
    const main = result.tracks?.find((track) => track.id === "main");

    expect(main?.clips.map((clip) => clip.id)).toEqual([
      "gap-image",
      "image-1",
      "image-2",
    ]);
  });

  it("ripple-deletes a clip only on its own track", () => {
    const result = rippleDeleteClip(project, "main", "image-1");
    const main = result.tracks?.find((track) => track.id === "main");
    const music = result.tracks?.find((track) => track.id === "music");

    expect(main?.clips.map((clip) => [clip.id, clip.start])).toEqual([
      ["image-2", 4],
    ]);
    expect(music?.clips[0]?.start).toBe(2);
  });

  it("ripple-deletes text only within the selected caption layer", () => {
    const withCaptions: VideoProject = {
      ...project,
      overlays: [
        { ...project.overlays[0], layer: 0 },
        {
          ...project.overlays[0],
          id: "next-title",
          start: 3,
          end: 5,
          layer: 0,
        },
        {
          ...project.overlays[0],
          id: "other-layer",
          start: 3,
          end: 5,
          layer: 1,
        },
      ],
    };

    const result = rippleDeleteOverlay(withCaptions, "title");

    expect(
      result.overlays.map((overlay) => [
        overlay.id,
        overlay.start,
        overlay.end,
      ]),
    ).toEqual([
      ["next-title", 1, 3],
      ["other-layer", 3, 5],
    ]);
  });
});

describe("local visual effects", () => {
  it("stores a movable mosaic region on only the selected visual clip", () => {
    const result = setClipMosaic(project, "main", "image-1", {
      pattern: "hexagon",
      shape: "rounded",
      cx: 0.35,
      cy: 0.6,
      rx: 0.2,
      ry: 0.25,
      amount: 0.7,
      opacity: 0.8,
    });
    const clips = result.tracks?.find((track) => track.id === "main")?.clips;

    expect((clips?.[0] as VisualTrackClip | undefined)?.mosaic).toMatchObject({
      pattern: "hexagon",
      shape: "rounded",
      cx: 0.35,
      opacity: 0.8,
    });
    expect((clips?.[1] as VisualTrackClip | undefined)?.mosaic).toBeUndefined();
  });

  it("stores and clears a per-clip magnifying lens", () => {
    const withLens = setClipMagnifier(project, "main", "image-2", {
      shape: "circle",
      cx: 0.5,
      cy: 0.5,
      rx: 0.22,
      ry: 0.22,
      opacity: 1,
      zoom: 2.5,
      borderWidth: 0.012,
      borderColor: "#ffffff",
    });
    const cleared = setClipMagnifier(withLens, "main", "image-2", undefined);
    const withLensClips = withLens.tracks?.find(
      (track) => track.id === "main",
    )?.clips;
    const clearedClips = cleared.tracks?.find(
      (track) => track.id === "main",
    )?.clips;

    expect(
      (withLensClips?.[1] as VisualTrackClip | undefined)?.magnifier?.zoom,
    ).toBe(2.5);
    expect(
      (clearedClips?.[1] as VisualTrackClip | undefined)?.magnifier,
    ).toBeUndefined();
  });
});
