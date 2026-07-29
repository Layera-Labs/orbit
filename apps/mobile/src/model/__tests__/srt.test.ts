import { describe, expect, it } from "vitest";
import { captionFileName, hasCaptionText, srtTime, toSRT } from "../editor-ops";
import type { TextOverlay, VideoProject } from "../types";

const overlay = (text: string, start: number, end: number, id = `o-${text}`): TextOverlay => ({
  id,
  type: "text",
  text,
  start,
  end,
  x: 0.5,
  y: 0.8,
  fontSize: 60,
  color: "#ffffff",
});

const project = (overlays: TextOverlay[]): VideoProject => ({
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

/** Read the file back the way a player does, so a malformed cue fails here. */
function parseSRT(text: string) {
  return text
    .trim()
    .split(/\n\n+/)
    .map((b) => {
      const [index, times, ...rest] = b.split("\n");
      const m = times?.match(
        /^(\d{2,}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2,}):(\d{2}):(\d{2}),(\d{3})$/,
      );
      if (!m) throw new Error(`bad timing line: ${JSON.stringify(times)}`);
      const at = (h: string, mm: string, s: string, ms: string) =>
        Number(h) * 3600 + Number(mm) * 60 + Number(s) + Number(ms) / 1000;
      return {
        index: Number(index),
        start: at(m[1], m[2], m[3], m[4]),
        end: at(m[5], m[6], m[7], m[8]),
        text: rest.join("\n"),
      };
    });
}

describe("toSRT", () => {
  it("numbers cues from one and reads back as valid SRT", () => {
    expect(parseSRT(toSRT(project([overlay("Hello", 0, 1.5), overlay("World", 2, 3)])))).toEqual([
      { index: 1, start: 0, end: 1.5, text: "Hello" },
      { index: 2, start: 2, end: 3, text: "World" },
    ]);
  });

  /* Overlays are stored in LAYER order, so array order runs backwards in time
     as soon as a caption is added above an earlier one. */
  it("writes cues in time order, not array order", () => {
    const out = toSRT(project([overlay("second", 5, 6), overlay("first", 1, 2)]));
    expect(parseSRT(out).map((c) => c.text)).toEqual(["first", "second"]);
  });

  /* A blank line is what ENDS a cue — text carrying one shifts every caption
     after it by one. */
  it("survives text containing a blank line", () => {
    const cues = parseSRT(toSRT(project([overlay("top\n\nbottom", 0, 1), overlay("after", 2, 3)])));
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe("top\nbottom");
  });

  it("drops empty and zero-length cues", () => {
    const out = toSRT(project([overlay("", 0, 1), overlay("zero", 3, 3), overlay("real", 7, 8)]));
    expect(parseSRT(out).map((c) => c.text)).toEqual(["real"]);
  });

  it("is empty when there is nothing to write", () => {
    expect(toSRT(project([]))).toBe("");
    expect(hasCaptionText(project([]))).toBe(false);
    expect(hasCaptionText(project([overlay("x", 0, 1)]))).toBe(true);
  });

  /* Rounding the parts separately turns 59.9996s into 00:00:60,000, which is
     not a time and which every parser rejects. */
  it("carries a rounded millisecond into the next second", () => {
    expect(srtTime(59.9996)).toBe("00:01:00,000");
  });

  it("makes a safe filename out of a typed project name", () => {
    expect(captionFileName("Summer trip")).toBe("Summer trip.srt");
    expect(captionFileName("../../etc/passwd")).toBe("etc passwd.srt");
    expect(captionFileName("")).toBe("captions.srt");
  });
});

/*
 * The mirror, checked.
 *
 * `toSRT` exists TWICE — here in `editor-ops.ts`, and in
 * `packages/video/src/srt.ts` which the web app imports — because mobile
 * installs outside the pnpm workspace. Compare the OUTPUT, not the source:
 * anything that changes in one and not the other fails here, so the same
 * project cannot start producing two different subtitle files.
 */
describe("mobile mirrors packages/video", () => {
  it("writes byte-identical files for the same overlays", async () => {
    const shared = await import("../../../../../packages/video/src/srt");

    const cases: TextOverlay[][] = [
      [],
      [overlay("one", 0, 1), overlay("two", 1.5, 2.25)],
      // out of order, blank-line text, empty, zero-length, sub-millisecond
      [
        overlay("later", 59.9996, 61.0004),
        overlay("top\n\nbottom", 2, 3),
        overlay("", 4, 5),
        overlay("zero", 6, 6),
        overlay("hand written", 0.5, 1, "mine"),
        overlay("machine heard", 1, 1.5, "caption-0"),
      ],
      [overlay("a", 0, 5), overlay("b", 2, 6)],
    ];

    for (const overlays of cases) {
      const p = project(overlays);
      expect(toSRT(p)).toBe(shared.toSRT(p as never));
      expect(hasCaptionText(p)).toBe(shared.hasCaptionText(p as never));
    }
  });

  it("agrees on filenames, including the unsafe ones", async () => {
    const shared = await import("../../../../../packages/video/src/srt");
    for (const name of ["Summer trip", "../../etc/passwd", "", "a/b\\c:d*e?f", "x".repeat(300)])
      expect(captionFileName(name)).toBe(shared.captionFileName(name));
  });
});
