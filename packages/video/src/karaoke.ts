/**
 * Word-by-word captions: slicing a plate into the windows one word is lit for.
 *
 * ## Why a caption becomes several plates
 *
 * A plate is rasterized ONCE and composited for its whole window — that is what
 * makes it cheap and what makes the preview and the export agree, because both
 * consume the same SVG. A highlight that moves from word to word is the one
 * thing that model cannot express: the picture changes over time.
 *
 * So a karaoke caption is sliced into N plates, one per word window, each drawn
 * only while its word is being spoken. Nothing else about the plate path
 * changes: the fade, the slide, the motion, the keyframes and the anchor are
 * still computed from the OVERLAY's window, and only `enable=` narrows to the
 * slice. That is why this module returns segments carrying their overlay rather
 * than rewritten overlays — a segment is *when to show* a plate, never *what
 * the plate is*.
 *
 * ## Both surfaces slice here, or they do not agree
 *
 * `render.ts` rasterizes one PNG per segment and `ffmpeg.ts` wires one input
 * per segment; `frame.ts` asks which word is lit at `t`. All three read this
 * file, so a boundary can only move in one place. Two copies of "which word is
 * lit at 3.2s" is exactly the divergence the dual-render rule exists to stop,
 * and it would show up as a highlight one word ahead in the file and not in the
 * preview — the kind nobody notices until a customer does.
 */
import { captionWordsValid } from "./captions";
import type { Overlay, PlateOverlay, TextOverlay, WordTiming } from "./types";
import { plateOverlaysOf } from "./types";

/**
 * The most word-windows one caption may be sliced into.
 *
 * Each segment is a full-frame PNG on disk and a separate ffmpeg input with its
 * own decoder, so the cost is real and it is per word. Ordinary captions are a
 * line or two — five to ten words — and nothing legitimate approaches this. A
 * document that does is either malformed or is not a caption, and a render that
 * dies having opened four hundred inputs is a worse answer than one that draws
 * the caption without the highlight.
 *
 * Exceeding it is therefore a DEGRADE, not an error: the caption still renders,
 * just statically. `karaokeWords` is where that decision is made, once.
 */
export const MAX_WORD_SEGMENTS = 64;

/** No word is lit — the caption is on screen but nothing is being spoken yet. */
export const NO_WORD = -1;

export interface PlateSegment {
  /**
   * What `overlayImages` is keyed by.
   *
   * A plate with no highlight keeps the OVERLAY'S OWN ID, unchanged. That is
   * deliberate and it is what makes this change backward compatible: every
   * existing caller builds `overlayImages` keyed by overlay id, and every
   * project without word timings still produces exactly one segment with
   * exactly the key it produced before.
   */
  key: string;
  overlay: PlateOverlay;
  /** When this slice is on screen. Never outside the overlay's own window. */
  start: number;
  end: number;
  /** Index into `overlay.words`, or `NO_WORD`. */
  activeWord: number;
}

/**
 * The word timings this caption can actually be lit by, or null.
 *
 * Four things have to hold, and each rules out a real document:
 *
 * - It is text. A shape has no words.
 * - It asks for a highlight. The timings ride along on auto-captions whether or
 *   not anyone wants the effect, so the STYLE is what opts in.
 * - `captionWordsValid`. The words must still spell the text; retyping a
 *   caption leaves an array describing something nobody is saying, and a stale
 *   array is worse than an absent one because it lights the wrong word
 *   confidently.
 * - It is not absurdly long. See `MAX_WORD_SEGMENTS`.
 */
export function karaokeWords(o: PlateOverlay): WordTiming[] | null {
  if (o.type !== "text") return null;
  const t = o as TextOverlay;
  if (!t.highlight) return null;
  if (!captionWordsValid(t)) return null;
  if (t.words!.length > MAX_WORD_SEGMENTS) return null;
  return t.words!;
}

/**
 * Slice one plate into its word windows, tiling `[start, end)` with no gaps.
 *
 * Tiling matters. A word stays lit until the NEXT word begins rather than until
 * its own `end`, so the pauses between words hold the last word rather than
 * going dark — speech has gaps everywhere and honouring them literally makes
 * the highlight flicker several times a second. Before the first word nothing
 * is lit, because the caption is on screen ahead of the voice reaching it.
 *
 * Returns a single un-lit segment for anything that is not a karaoke caption,
 * so every caller has one shape to handle.
 */
export function segmentsOf(o: PlateOverlay): PlateSegment[] {
  const whole: PlateSegment = {
    key: o.id,
    overlay: o,
    start: o.start,
    end: o.end,
    activeWord: NO_WORD,
  };
  const words = karaokeWords(o);
  if (!words || o.end <= o.start) return [whole];

  /*
   * Clamped into the window and keyed by ORIGINAL index, because that index is
   * what addresses the word in the text — `captionWordsValid` guarantees
   * `words[i]` is the i-th space-separated token, and the renderer relies on
   * it. Sorting or filtering without carrying the index along would light a
   * different word than the one being spoken.
   */
  const lit = words
    .map((w, i) => ({ i, start: Math.max(o.start, w.start) }))
    .filter((w) => w.start < o.end)
    .sort((a, b) => a.start - b.start);

  if (!lit.length) return [whole];

  const out: PlateSegment[] = [];
  const push = (start: number, end: number, activeWord: number) => {
    // A zero-length slice is a PNG nobody sees and an ffmpeg input nobody
    // reads. Two words sharing a start produce one; so does a word starting
    // exactly at the caption's end.
    if (end > start) {
      out.push({
        key: `${o.id}#${out.length}`,
        overlay: o,
        start,
        end,
        activeWord,
      });
    }
  };

  push(o.start, lit[0].start, NO_WORD);
  lit.forEach((w, k) => push(w.start, k + 1 < lit.length ? lit[k + 1].start : o.end, w.i));

  // Every path above can be emptied by clamping; the caption must still draw.
  return out.length ? out : [whole];
}

/** Every plate in the project, sliced. Layer order is left to the caller. */
export function plateSegmentsOf(overlays: readonly Overlay[]): PlateSegment[] {
  return plateOverlaysOf(overlays).flatMap(segmentsOf);
}

/**
 * Which word is lit at `t`, for the preview.
 *
 * Derived from the same slicing the export uses rather than from a second
 * search over `words`, which is the whole point: one boundary, read two ways.
 */
export function activeWordAt(o: PlateOverlay, t: number): number {
  for (const s of segmentsOf(o)) {
    if (t >= s.start && t < s.end) return s.activeWord;
  }
  // `segmentsOf` tiles a half-open range, so the very last instant of the
  // caption falls outside every slice. It belongs to the final one.
  const last = segmentsOf(o).at(-1);
  return t >= o.end && last ? last.activeWord : NO_WORD;
}
