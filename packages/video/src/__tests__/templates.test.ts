import { describe, expect, it } from 'vitest';
import { captionReel, lyricVideo, quoteCard } from '../templates';
import { projectDuration } from '../project';

describe('captionReel', () => {
  it('sequences captions over a video clip', () => {
    const p = captionReel({ clip: 'c.mp4', captions: ['one', 'two', 'three'], perCaption: 2 });
    expect(p.clips[0].type).toBe('video');
    expect(p.overlays).toHaveLength(3);
    expect(p.overlays[0].start).toBe(0);
    expect(p.overlays[1].start).toBe(2);
    expect(p.overlays[2].end).toBe(6);
    expect(projectDuration(p)).toBe(6);
  });
});

describe('lyricVideo', () => {
  it('is clip-less with a gradient background, timed lines and music', () => {
    const p = lyricVideo({ lines: ['a', 'b'], perLine: 3, music: 'm.mp3' });
    expect(p.clips).toHaveLength(0);
    expect(p.background.type).toBe('gradient');
    expect(p.overlays).toHaveLength(2);
    expect(p.audio[0].src).toBe('m.mp3');
    expect(projectDuration(p)).toBe(6);
  });
});

describe('quoteCard', () => {
  it('renders a quote and author over a background', () => {
    const p = quoteCard({ quote: 'Be water', author: 'Bruce Lee', duration: 5 });
    expect(p.clips).toHaveLength(0);
    expect(p.overlays[0].text).toContain('Be water');
    expect(p.overlays[1].text).toContain('Bruce Lee');
    expect(projectDuration(p)).toBe(5);
  });
});
