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
});
