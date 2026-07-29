import { describe, expect, it } from "vitest";
import { captionCues, captionFileName, hasCaptionText, srtTime, toSRT } from "../srt";
import type { TextOverlay, VideoProject } from "../types";

const overlay = (text: string, start: number, end: number, extra: Partial<TextOverlay> = {}) =>
  ({
    id: `o-${text}`,
    type: "text",
    text,
    start,
    end,
    x: 0.5,
    y: 0.8,
    fontSize: 60,
    color: "#ffffff",
    ...extra,
  }) as TextOverlay;

const project = (overlays: TextOverlay[]): VideoProject =>
  ({
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
  }) as unknown as VideoProject;

/**
 * A parser, not an assertion about the exact bytes.
 *
 * Comparing the output to a hand-written string only proves the function still
 * does what it did — it cannot tell you the file is VALID. This reads the file
 * back the way a player does, so a malformed cue fails here rather than in VLC.
 */
function parseSRT(text: string) {
  const blocks = text.trim().split(/\n\n+/);
  return blocks.map((b) => {
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

describe("srtTime", () => {
  it("writes hours, minutes, seconds and milliseconds", () => {
    expect(srtTime(0)).toBe("00:00:00,000");
    expect(srtTime(1.5)).toBe("00:00:01,500");
    expect(srtTime(61.25)).toBe("00:01:01,250");
    expect(srtTime(3661.007)).toBe("01:01:01,007");
  });

  /*
   * The bug this exists to prevent: rounding the parts separately turns
   * 59.9996s into 00:00:60,000, which is not a time and which every parser
   * rejects. Round once, in integer milliseconds, then divide.
   */
  it("carries a rounded millisecond into the next second", () => {
    expect(srtTime(59.9996)).toBe("00:01:00,000");
    expect(srtTime(3599.9999)).toBe("01:00:00,000");
  });

  it("never emits a negative time", () => {
    expect(srtTime(-5)).toBe("00:00:00,000");
  });
});

describe("toSRT", () => {
  it("numbers cues from one and reads back as valid SRT", () => {
    const out = toSRT(project([overlay("Hello", 0, 1.5), overlay("World", 2, 3)]));
    expect(parseSRT(out)).toEqual([
      { index: 1, start: 0, end: 1.5, text: "Hello" },
      { index: 2, start: 2, end: 3, text: "World" },
    ]);
  });

  /*
   * Overlays are stored in LAYER order so a caption added later can sit above
   * an earlier one. Writing the file in that order hands a player a transcript
   * that jumps backwards in time.
   */
  it("writes cues in time order, not array order", () => {
    const out = toSRT(project([overlay("second", 5, 6), overlay("first", 1, 2)]));
    expect(parseSRT(out).map((c) => c.text)).toEqual(["first", "second"]);
    expect(parseSRT(out).map((c) => c.index)).toEqual([1, 2]);
  });

  /*
   * A blank line is what ENDS a cue in SRT — there is no escaping. Text
   * carrying one would split into a cue plus a fragment the parser reads as the
   * next cue's index, and every caption after it shifts.
   */
  it("survives text containing a blank line", () => {
    const out = toSRT(project([overlay("top\n\nbottom", 0, 1), overlay("after", 2, 3)]));
    const cues = parseSRT(out);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe("top\nbottom");
    expect(cues[1].text).toBe("after");
  });

  it("keeps a deliberate two-line caption on two lines", () => {
    expect(parseSRT(toSRT(project([overlay("one\ntwo", 0, 1)])))[0].text).toBe("one\ntwo");
  });

  it("normalises windows line endings", () => {
    expect(parseSRT(toSRT(project([overlay("a\r\nb", 0, 1)])))[0].text).toBe("a\nb");
  });

  /* Not subtitles: nothing to show, or no time to show it for. */
  it("drops empty and zero-length cues", () => {
    const out = toSRT(
      project([
        overlay("", 0, 1),
        overlay("   \n  ", 1, 2),
        overlay("zero", 3, 3),
        overlay("backwards", 6, 5),
        overlay("real", 7, 8),
      ]),
    );
    expect(parseSRT(out).map((c) => c.text)).toEqual(["real"]);
  });

  it("is empty when there is nothing to write", () => {
    expect(toSRT(project([]))).toBe("");
    expect(toSRT(project([overlay("", 0, 1)]))).toBe("");
    expect(hasCaptionText(project([]))).toBe(false);
    expect(hasCaptionText(project([overlay("x", 0, 1)]))).toBe(true);
  });

  /*
   * The `caption-` prefix is bookkeeping for re-transcription, not a category
   * the user picked. A line someone typed is as much a subtitle as one a model
   * heard, and dropping it from the file is the worse surprise.
   */
  it("exports hand-written overlays alongside auto-captions", () => {
    const out = toSRT(
      project([
        overlay("typed", 0, 1, { id: "mine" }),
        overlay("heard", 2, 3, { id: "caption-0" }),
      ]),
    );
    expect(parseSRT(out).map((c) => c.text)).toEqual(["typed", "heard"]);
  });

  it("ends with a newline, as a text file should", () => {
    expect(toSRT(project([overlay("x", 0, 1)])).endsWith("\n")).toBe(true);
  });

  /* SRT allows overlap, players differ, and silently retiming captions someone
     placed deliberately is worse than a player stacking two lines. */
  it("leaves overlapping cues overlapping", () => {
    const cues = captionCues([overlay("a", 0, 5), overlay("b", 2, 6)]);
    expect(cues.map((c) => [c.start, c.end])).toEqual([
      [0, 5],
      [2, 6],
    ]);
  });
});

describe("captionFileName", () => {
  it("keeps a readable name", () => {
    expect(captionFileName("Summer trip")).toBe("Summer trip.srt");
  });

  /* The part that matters: a `/` is traversal on one platform and unwritable
     on another. */
  it("strips path separators and control characters", () => {
    expect(captionFileName("a/b\\c:d*e?f")).toBe("a b c d e f.srt");
    expect(captionFileName("../../etc/passwd")).toBe("etc passwd.srt");
  });

  it("falls back rather than producing a dotfile", () => {
    expect(captionFileName("")).toBe("captions.srt");
    expect(captionFileName("///")).toBe("captions.srt");
    expect(captionFileName("  ")).toBe("captions.srt");
  });

  it("bounds the length", () => {
    expect(captionFileName("x".repeat(500)).length).toBeLessThanOrEqual(64);
  });
});
