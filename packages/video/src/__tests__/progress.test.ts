// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseEncodedSeconds } from "../render";

/**
 * ffmpeg's progress has always been forwarded and never read, so a client had
 * only four discrete stages and sat on "rendering" for the whole encode. These
 * pin the parsing, because the shape of that status line is the one thing here
 * we do not control.
 */

const line = (t: string) =>
  `frame=  123 fps= 30 q=28.0 size=    2048kB time=${t} bitrate= 800.0kbits/s speed=1.2x    `;

describe("parseEncodedSeconds", () => {
  it("reads the timestamp", () => {
    expect(parseEncodedSeconds(line("00:00:04.12"))).toBeCloseTo(4.12, 5);
    expect(parseEncodedSeconds(line("00:01:30.50"))).toBeCloseTo(90.5, 5);
    expect(parseEncodedSeconds(line("01:00:00.00"))).toBe(3600);
  });

  /*
   * ffmpeg rewrites its status line with a carriage return rather than a
   * newline, so one stdio chunk routinely carries several updates. Taking the
   * first would make the bar lag further behind the longer the encode ran.
   */
  it("takes the most recent of several updates in one chunk", () => {
    const chunk = [line("00:00:01.00"), line("00:00:02.00"), line("00:00:03.00")].join("\r");
    expect(parseEncodedSeconds(chunk)).toBeCloseTo(3, 5);
  });

  it("is null for output that carries no timestamp", () => {
    expect(parseEncodedSeconds("")).toBeNull();
    expect(parseEncodedSeconds("[libx264 @ 0x7f] using SAR=1/1")).toBeNull();
    // Early frames can report this instead of a time.
    expect(parseEncodedSeconds("frame=0 fps=0.0 time=N/A bitrate=N/A")).toBeNull();
  });

  it("survives a chunk split mid-timestamp", () => {
    // Chunk boundaries fall wherever the pipe decides, so a partial match must
    // not be read as a smaller number and drag the bar backwards.
    expect(parseEncodedSeconds("...bitrate=800 time=00:00:1")).toBeNull();
  });

  it("handles a timestamp with no fractional part", () => {
    expect(parseEncodedSeconds(line("00:00:07"))).toBe(7);
  });

  /*
   * ffmpeg emits a negative time before the first frame lands. The pattern
   * requires a digit where the sign is, so this reads as "nothing yet" rather
   * than as 0.02 seconds of progress — which is what it means.
   */
  it("ignores the negative time ffmpeg reports before the first frame", () => {
    expect(parseEncodedSeconds(line("-00:00:00.02"))).toBeNull();
  });
});
