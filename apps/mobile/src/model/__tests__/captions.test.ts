import { describe, expect, it } from "vitest";
import {
  CAPTION_ID_PREFIX,
  clearAutoCaptions,
  hasAutoCaptions,
  setAutoCaptions,
} from "../editor-ops";
import type { TextOverlay, VideoProject } from "../types";

const project = (overlays: TextOverlay[] = []): VideoProject => ({
  id: "p",
  schemaVersion: 2,
  width: 1080,
  height: 1920,
  fps: 30,
  background: { type: "color", color: "#000000" },
  clips: [],
  overlays,
  audio: [],
  tracks: [],
});

const caption = (text: string, start: number, end: number) => ({ text, start, end });

const hand: TextOverlay = {
  id: "mine",
  type: "text",
  text: "Written by hand",
  start: 0,
  end: 2,
  x: 0.5,
  y: 0.5,
  fontSize: 60,
  color: "#ffffff",
};

describe("setAutoCaptions", () => {
  it("lays the transcript out in time", () => {
    const p = setAutoCaptions(project(), [caption("one", 0, 1), caption("two", 1, 2)]);
    expect(p.overlays.map((o) => [o.text, o.start, o.end])).toEqual([
      ["one", 0, 1],
      ["two", 1, 2],
    ]);
  });

  /* The transcript is relative to the audio; the timeline is not. */
  it("offsets by where the transcribed clip sits", () => {
    const p = setAutoCaptions(project(), [caption("late", 0, 1)], 4.5);
    expect(p.overlays[0].start).toBe(4.5);
    expect(p.overlays[0].end).toBe(5.5);
  });

  /* Running it twice is the NORMAL case — re-record, re-trim, re-caption — and
     appending would stack two transcripts with no way to tell them apart. */
  it("replaces a previous run rather than stacking on it", () => {
    const once = setAutoCaptions(project(), [caption("old", 0, 1), caption("older", 1, 2)]);
    const twice = setAutoCaptions(once, [caption("new", 0, 1)]);
    expect(twice.overlays).toHaveLength(1);
    expect(twice.overlays[0].text).toBe("new");
  });

  it("leaves a caption someone wrote by hand alone", () => {
    const p = setAutoCaptions(project([hand]), [caption("auto", 0, 1)]);
    expect(p.overlays.map((o) => o.id)).toEqual(["mine", `${CAPTION_ID_PREFIX}0`]);
    expect(clearAutoCaptions(p).overlays).toEqual([hand]);
  });

  /* Over footage of unknown brightness, a caption has to carry its own
     legibility rather than hope the picture behind it is dark. */
  it("gives every caption an outline and sits it low in the frame", () => {
    const [c] = setAutoCaptions(project(), [caption("x", 0, 1)]).overlays;
    expect(c.stroke?.width).toBeGreaterThan(0);
    expect(c.y).toBeGreaterThan(0.7);
  });

  it("puts captions above whatever is already there", () => {
    const p = setAutoCaptions(project([{ ...hand, layer: 7 }]), [caption("x", 0, 1)]);
    expect(p.overlays.find((o) => o.id.startsWith(CAPTION_ID_PREFIX))?.layer).toBe(8);
  });

  it("reports whether there is anything to replace", () => {
    expect(hasAutoCaptions(project([hand]))).toBe(false);
    expect(hasAutoCaptions(setAutoCaptions(project(), [caption("x", 0, 1)]))).toBe(true);
  });

  it("clears to nothing for an empty transcript", () => {
    const once = setAutoCaptions(project(), [caption("x", 0, 1)]);
    expect(setAutoCaptions(once, []).overlays).toEqual([]);
  });
});
