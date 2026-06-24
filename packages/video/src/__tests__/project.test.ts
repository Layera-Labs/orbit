import { describe, expect, it } from 'vitest';
import { createProject, projectDuration } from '../project';

describe('createProject', () => {
  it('fills defaults', () => {
    const p = createProject({ width: 1080, height: 1920 });
    expect(p.schemaVersion).toBe(1);
    expect(p.fps).toBe(30);
    expect(p.background).toEqual({ type: 'color', color: '#000000' });
    expect(p.clips).toEqual([]);
  });
});

describe('projectDuration', () => {
  it('is the latest end across clips, overlays and audio', () => {
    const p = createProject({
      width: 100,
      height: 100,
      clips: [{ id: 'c', type: 'video', src: 'a.mp4', start: 0, duration: 5 }],
      overlays: [{ id: 'o', type: 'text', text: 'hi', start: 1, end: 8, x: 0.5, y: 0.8, fontSize: 40, color: '#fff' }],
      audio: [{ id: 'm', src: 'm.mp3', start: 0, duration: 6 }],
    });
    expect(projectDuration(p)).toBe(8); // overlay ends latest
  });
});
