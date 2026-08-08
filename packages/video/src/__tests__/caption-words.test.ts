/**
 * Word timings on a caption.
 *
 * Data only: nothing renders a word timing yet. What is being fixed here is a
 * lossy step, not a missing effect — grouping words into lines throws away the
 * one thing a line cannot reconstruct, so a word-level effect built later would
 * have had to transcribe the same audio a second time to get it back.
 *
 * Two properties carry the weight:
 *
 *   1. The words are resolved onto the TIMELINE, by the same rule the line is,
 *      so a word can never sit outside the caption that contains it.
 *   2. A caption that has been retyped is detectable, so a future highlighter
 *      shows nothing rather than confidently lighting the wrong word.
 *
 * And, as ever, the last block: nothing already stored moved.
 */
import { describe, expect, it } from 'vitest';
import { captionWordsValid, setAutoCaptions } from '../captions';
import type { CaptionLine } from '../captions';
import { textOverlaysOf } from '../types';
import type { VideoProject } from '../types';

const project = (): VideoProject =>
  ({
    id: 'p',
    schemaVersion: 3,
    width: 1080,
    height: 1920,
    fps: 30,
    background: { type: 'color', color: '#000000' },
    clips: [],
    overlays: [],
    audio: [],
    tracks: [],
  }) as unknown as VideoProject;

/** A line whose text is exactly its words joined by a space — what the service sends. */
const line = (words: string[], from = 0, step = 0.4): CaptionLine => ({
  text: words.join(' '),
  start: from,
  end: from + words.length * step,
  words: words.map((text, i) => ({
    text,
    start: from + i * step,
    end: from + i * step + step * 0.8,
  })),
});

const captionsOf = (p: VideoProject) => textOverlaysOf(p.overlays);

describe('word timings reach the overlay', () => {
  it('carries them through', () => {
    const [c] = captionsOf(setAutoCaptions(project(), [line(['hello', 'there'])]));
    expect(c.words?.map((w) => w.text)).toEqual(['hello', 'there']);
  });

  /*
   * The whole point of resolving here. The transcript is relative to the clip
   * and `setAutoCaptions` is the only place that knows where that clip sits —
   * storing the words unshifted would mean every later reader had to find an
   * offset that is nowhere in the document.
   */
  it('shifts them onto the timeline by the same offset as the line', () => {
    const [c] = captionsOf(setAutoCaptions(project(), [line(['a', 'b'])], 12.5));
    expect(c.start).toBe(12.5);
    expect(c.words![0].start).toBe(12.5);
    expect(c.words![1].start).toBeCloseTo(12.9, 6);
  });

  /*
   * The invariant that matters more than the arithmetic: whatever the offset,
   * no word may fall outside the caption that contains it. A highlighter that
   * clamps its own progress would hide the breach; one that does not would run
   * a highlight past the end of a caption that is no longer on screen.
   */
  it('leaves no word outside its own caption, at any offset', () => {
    for (const offset of [0, 0.001, 3, 60, 1_000]) {
      for (const c of captionsOf(
        setAutoCaptions(project(), [line(['one', 'two', 'three'], 1.25)], offset),
      )) {
        for (const w of c.words ?? []) {
          expect(w.start).toBeGreaterThanOrEqual(c.start);
          expect(w.end).toBeLessThanOrEqual(c.end + 1e-9);
        }
      }
    }
  });

  it('keeps each line with its own words when there are several', () => {
    const p = setAutoCaptions(project(), [
      line(['first', 'line'], 0),
      line(['second', 'one'], 10),
    ]);
    expect(captionsOf(p).map((c) => c.words?.map((w) => w.text))).toEqual([
      ['first', 'line'],
      ['second', 'one'],
    ]);
  });

  it('does not alias the input, so editing the project cannot reach back into it', () => {
    const lines = [line(['a', 'b'])];
    const [c] = captionsOf(setAutoCaptions(project(), lines));
    expect(c.words).not.toBe(lines[0].words);
    expect(c.words![0]).not.toBe(lines[0].words![0]);
  });
});

describe('captionWordsValid', () => {
  /*
   * Exact rather than fuzzy, and it can be: `groupWords` builds a line's text
   * by joining its words with one space, so a faithful array reproduces the
   * string character for character.
   */
  it('accepts words that spell the text', () => {
    expect(captionWordsValid(line(['the', 'quick', 'brown', 'fox']))).toBe(true);
  });

  it('rejects a caption that was retyped after it was transcribed', () => {
    const l = line(['the', 'quick', 'brown', 'fox']);
    expect(captionWordsValid({ ...l, text: 'the quick red fox' })).toBe(false);
    // Even a pure re-ordering: word 3 would light on word 2's syllable.
    expect(captionWordsValid({ ...l, text: 'the brown quick fox' })).toBe(false);
  });

  /*
   * Absent is a legitimate state — every caption written before this field, and
   * every caption typed by hand — and must read as "no word data", never as an
   * empty transcript that a caller might treat as zero words spoken.
   */
  it('rejects absent and empty rather than treating them as agreement', () => {
    expect(captionWordsValid({ text: 'anything' })).toBe(false);
    expect(captionWordsValid({ text: '', words: [] })).toBe(false);
  });

  it('holds after the overlay has been shifted onto the timeline', () => {
    // The shift moves times, never text, so validity must survive it. If it did
    // not, the check would be useless exactly where it is used.
    const [c] = captionsOf(setAutoCaptions(project(), [line(['a', 'b', 'c'])], 7));
    expect(captionWordsValid(c)).toBe(true);
  });
});

describe('nothing already stored moved', () => {
  /*
   * The promise that makes this additive. A transcript from a server that does
   * not send words, or a caption someone typed, produces the overlay it always
   * did — with no `words` key at all, not an empty array. Renderers branch on
   * presence, so an empty array is a different document from an absent field.
   */
  it('writes no key at all when the service sends no words', () => {
    const [c] = captionsOf(
      setAutoCaptions(project(), [{ text: 'plain', start: 0, end: 1 }]),
    );
    expect('words' in c).toBe(false);
  });

  it('writes no key for an empty array either', () => {
    const [c] = captionsOf(
      setAutoCaptions(project(), [{ text: 'plain', start: 0, end: 1, words: [] }]),
    );
    expect('words' in c).toBe(false);
  });

  it('produces a byte-identical overlay to one built without the field', () => {
    const withField = setAutoCaptions(project(), [
      { text: 'plain', start: 0, end: 1, words: undefined },
    ]);
    const without = setAutoCaptions(project(), [{ text: 'plain', start: 0, end: 1 }]);
    expect(JSON.stringify(withField)).toBe(JSON.stringify(without));
  });
});
