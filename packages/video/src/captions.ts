import type { TextOverlay, VideoProject, WordTiming } from "./types.js";

/**
 * Auto-captions: a transcript laid out as timed overlays.
 *
 * Pure data in, pure data out — no provider, no network. Speech-to-text happens
 * on the render service (`POST /v1/transcribe`, which also groups words into
 * readable lines); this is only what the result LOOKS like on the timeline, and
 * it lives here so both clients agree on that.
 *
 * `apps/mobile` cannot import this package (it installs standalone, outside the
 * pnpm workspace), so it mirrors these functions in `src/model/editor-ops.ts`.
 * `apps/mobile/src/model/__tests__/captions.test.ts` asserts the two produce
 * identical overlays — a mirrored implementation that nothing compares is a
 * copy waiting to drift.
 */

/** How an auto-caption is recognised later, so a second run can replace it. */
export const CAPTION_ID_PREFIX = "caption-";

export interface CaptionLine {
  text: string;
  /** Seconds from the start of the transcribed audio, not the timeline. */
  start: number;
  end: number;
  /**
   * The words this line was built from, in the same audio-relative seconds.
   *
   * Optional because a server that predates it does not send one, and because
   * nothing reads it yet. It is carried rather than discarded for the reason
   * any lossy step is worth avoiding: the line's own span cannot be taken back
   * apart, so throwing the array away means a word-level effect has to pay for
   * a second transcription of audio the user already paid to transcribe once.
   */
  words?: WordTiming[];
}

/**
 * Do these words still spell this text?
 *
 * The check is EXACT rather than fuzzy, because it can be: `groupWords` builds
 * a line's text by joining its words with a single space, so a faithful array
 * reproduces the string character for character. Anything else means the
 * caption was retyped after it was transcribed, and the timings now describe
 * words that are no longer there.
 *
 * That distinction matters because the failure is silent and confident. A
 * highlighter fed a stale array does not fall over — it lights word 4 of a
 * sentence whose fourth word has been replaced, in time with audio that says
 * something else. Absent data reads as "no highlight"; wrong data reads as a
 * bug in the renderer.
 */
export function captionWordsValid(o: {
  text: string;
  words?: WordTiming[];
}): boolean {
  if (!o.words?.length) return false;
  return o.words.map((w) => w.text).join(" ") === o.text;
}

/**
 * Replace the auto-captions with a fresh set.
 *
 * REPLACE, not append. Running this twice is the normal thing to do — you
 * re-record the voiceover, or fix the trim and want the timings again — and
 * appending would stack two full transcripts with no way to tell which caption
 * came from which run. A caption edited by hand keeps the prefix and is
 * replaced too, which is why the UI says so before it runs.
 *
 * `offset` is where the transcribed clip sits on the timeline: the transcript is
 * relative to the audio, the overlays are absolute.
 */
export function setAutoCaptions(
  p: VideoProject,
  lines: CaptionLine[],
  offset = 0,
): VideoProject {
  const kept = p.overlays.filter((o) => !o.id.startsWith(CAPTION_ID_PREFIX));
  // Above everything already placed, so a caption is never hidden behind a
  // sticker or a title someone put there first.
  const layer = kept.reduce((n, o) => Math.max(n, o.layer ?? 0), 0) + 1;
  const captions: TextOverlay[] = lines.map((line, i) => ({
    id: `${CAPTION_ID_PREFIX}${i}`,
    type: "text",
    text: line.text,
    start: Math.max(0, line.start + offset),
    end: Math.max(0, line.end + offset),
    // Resolved into timeline seconds by exactly the rule the line itself uses,
    // so a word can never sit outside the caption that contains it. Omitted
    // rather than written empty: a renderer branches on whether the field is
    // there, and every project transcribed before this one has no field.
    ...(line.words?.length
      ? {
          words: line.words.map((w) => ({
            text: w.text,
            start: Math.max(0, w.start + offset),
            end: Math.max(0, w.end + offset),
          })),
        }
      : {}),
    x: 0.5,
    // Low in the frame, where captions belong — and clear of the safe area a
    // phone's own UI puts over the bottom edge.
    y: 0.82,
    fontSize: Math.round(p.height * 0.038),
    color: "#ffffff",
    align: "center",
    bold: true,
    // Captions sit over footage of unknown brightness, so they carry their own
    // legibility rather than hoping the picture behind them is dark.
    stroke: {
      color: "#000000",
      width: Math.max(2, Math.round(p.height * 0.004)),
    },
    layer,
  }));
  return { ...p, overlays: [...kept, ...captions] };
}

/** Are there auto-captions to replace or clear? */
export function hasAutoCaptions(p: VideoProject): boolean {
  return p.overlays.some((o) => o.id.startsWith(CAPTION_ID_PREFIX));
}

export function clearAutoCaptions(p: VideoProject): VideoProject {
  return {
    ...p,
    overlays: p.overlays.filter((o) => !o.id.startsWith(CAPTION_ID_PREFIX)),
  };
}
