import { describe, expect, it } from 'vitest';
import { groupWords } from '../providers/elevenlabs';

const say = (words: string[], step = 0.3, from = 0) =>
  words.map((text, i) => ({ text, start: from + i * step, end: from + i * step + 0.25 }));

/*
 * The provider returns words; captions are lines. Where those lines break is
 * the whole quality of a caption track — too long and it cannot be read at a
 * glance, too short and it flickers — so the rule is tested rather than left to
 * whatever the model's own sentence splitting happens to do.
 */
describe('groupWords', () => {
  it('keeps a short run on one line', () => {
    const lines = groupWords(say(['hello', 'there']));
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('hello there');
  });

  it('spans the line from the first word to the last', () => {
    const [line] = groupWords(say(['a', 'b', 'c']));
    expect(line.start).toBeCloseTo(0, 6);
    expect(line.end).toBeCloseTo(0.85, 6);
  });

  it('breaks before a line gets too long to read', () => {
    const lines = groupWords(say(Array.from({ length: 20 }, () => 'word'), 0.05));
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.text.length).toBeLessThanOrEqual(42);
  });

  /* The one that makes captions track speech instead of chopping it evenly. */
  it('breaks at a pause even when the line is short', () => {
    const lines = groupWords([
      ...say(['before'], 0.3, 0),
      ...say(['after'], 0.3, 3),
    ]);
    expect(lines.map((l) => l.text)).toEqual(['before', 'after']);
  });

  it('breaks a long unbroken run so no caption sits too long on screen', () => {
    // Under the char limit and with no pauses: only the time rule can split it.
    const lines = groupWords(say(['a', 'b', 'c', 'd', 'e'], 1.2));
    expect(lines.length).toBeGreaterThan(1);
  });

  it('returns nothing for silence rather than one empty caption', () => {
    expect(groupWords([])).toEqual([]);
  });

  /*
   * Grouping is the ONLY lossy step between the model and the timeline: a
   * line's span cannot be taken back apart into the words that made it. So the
   * array is kept, and a word-level effect built later costs nothing extra
   * rather than a second transcription of audio already paid for once.
   */
  describe('keeps the words it grouped', () => {
    it('gives each line exactly the words it was built from', () => {
      const lines = groupWords([...say(['before'], 0.3, 0), ...say(['after'], 0.3, 3)]);
      expect(lines.map((l) => l.words.map((w) => w.text))).toEqual([['before'], ['after']]);
    });

    /*
     * The property that makes `captionWordsValid` exact rather than fuzzy: the
     * text IS the words joined by one space. Break this and the validity check
     * silently starts rejecting every caption it is asked about.
     */
    it('spells each line with its own words joined by one space', () => {
      for (const l of groupWords(say(Array.from({ length: 20 }, (_, i) => `w${i}`), 0.05))) {
        expect(l.words.map((w) => w.text).join(' ')).toBe(l.text);
      }
    });

    it('spans each line from its first word to its last', () => {
      for (const l of groupWords(say(['a', 'b', 'c', 'd', 'e'], 1.2))) {
        expect(l.start).toBeCloseTo(l.words[0].start, 6);
        expect(l.end).toBeCloseTo(l.words[l.words.length - 1].end, 6);
      }
    });

    it('loses no word and repeats none', () => {
      const words = say(['one', 'two', 'three', 'four'], 1.2);
      expect(groupWords(words).flatMap((l) => l.words)).toEqual(words);
    });

    /*
     * Two lines never share one array. Today that follows from the accumulator
     * being REPLACED rather than cleared, so the `.slice()` in `flush` is not
     * what makes it true — it is what keeps it true if someone reaches for the
     * obvious tidy-up and clears in place instead. This locks the property, not
     * the implementation that currently provides it.
     */
    it('gives each line an array of its own', () => {
      const lines = groupWords([...say(['a'], 0.3, 0), ...say(['b'], 0.3, 5)]);
      expect(lines[0].words).not.toBe(lines[1].words);
      expect(lines[0].words).toHaveLength(1);
      expect(lines[1].words).toHaveLength(1);
    });
  });
});
