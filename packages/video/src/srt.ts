import { textOverlaysOf, type TextOverlay, type VideoProject } from "./types.js";

/**
 * The captions, as a subtitle file.
 *
 * A finished video and a `.srt` beside it is what a platform actually wants:
 * YouTube and Vimeo take the file directly, and burned-in captions cannot be
 * turned off, translated, or read by a screen reader. The overlays already
 * carry the text and the timings, so the file is a projection of the project
 * rather than anything new to author.
 *
 * EVERY text overlay travels, not only the machine-written ones. The
 * `caption-` prefix exists so a second transcription run knows what it may
 * replace — it is bookkeeping, not a category the user ever chose. A line
 * someone typed over their own footage is exactly as much a subtitle as a line
 * a model heard, and silently dropping it from the file would be the worse
 * surprise by far.
 *
 * `apps/mobile` cannot import this package (it installs standalone, outside the
 * pnpm workspace), so it mirrors this in `src/model/editor-ops.ts` and
 * `src/model/__tests__/srt.test.ts` compares the two outputs — a mirrored
 * implementation that nothing compares is a copy waiting to drift.
 */

/** `HH:MM:SS,mmm` — comma before the milliseconds. A period is WebVTT. */
export function srtTime(seconds: number): string {
  // Round to milliseconds ONCE, in integer space. Rounding the parts
  // separately lets 59.9996s print as 00:00:60,000, which no parser accepts.
  const total = Math.max(0, Math.round(seconds * 1000));
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60_000) % 60;
  const h = Math.floor(total / 3_600_000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(h)}:${p2(m)}:${p2(s)},${String(ms).padStart(3, "0")}`;
}

/**
 * SRT has no escaping and no quoting: a BLANK LINE is what ends a cue. So text
 * carrying one would split a caption into a cue plus a fragment that the parser
 * reads as the next cue's index, and every caption after it shifts. Interior
 * line breaks are fine and meaningful — they are how a two-line caption is
 * written — so keep those and collapse only the empty ones.
 */
function cueText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n");
}

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/**
 * The overlays that can become cues, in the order they play.
 *
 * Sorted by time, not by array order: overlays are stored in layer order so a
 * caption added later can sit above an earlier one, and writing the file in
 * that order would hand a player a transcript that jumps around.
 *
 * Overlapping cues are left overlapping. SRT permits them, players differ on
 * what they do, and quietly retiming captions someone placed deliberately is a
 * worse outcome than a player stacking two lines.
 */
export function captionCues(overlays: readonly TextOverlay[]): Cue[] {
  return overlays
    .map((o) => ({
      start: Math.max(0, o.start),
      end: Math.max(0, o.end),
      text: cueText(o.text ?? ""),
    }))
    // A cue with no text is not a subtitle, and one that ends before it starts
    // (or lasts zero time) is rejected outright by some parsers and silently
    // dropped by the rest.
    .filter((c) => c.text !== "" && c.end > c.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

/** The whole file. Empty string when there is nothing to write. */
export function toSRT(p: VideoProject): string {
  const cues = captionCues(textOverlaysOf(p.overlays ?? []));
  if (!cues.length) return "";
  return (
    cues
      .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}`)
      .join("\n\n") + "\n"
  );
}

/** Is there anything a subtitle file could contain? */
export function hasCaptionText(p: VideoProject): boolean {
  return captionCues(textOverlaysOf(p.overlays ?? [])).length > 0;
}

/**
 * A filename the OS will accept from a project title someone typed.
 *
 * Path separators are the part that matters — a name containing `/` is a
 * directory traversal on one platform and simply unwritable on another.
 */
export function captionFileName(projectName: string): string {
  const base = (projectName || "")
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    // A leading dot makes a hidden file, and a name that is nothing but dots
    // is a directory reference rather than a file.
    .replace(/^[. ]+/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 60)
    .trim();
  return `${base || "captions"}.srt`;
}
