import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetIds,
  addClips,
  clipAt,
  clipsOf,
  formatTime,
  MIN_CLIP,
  moveClip,
  newProject,
  pack,
  removeClip,
  totalDuration,
  trimClip,
  type MediaAsset,
} from '../timeline';

const video = (uri: string, durationSec: number): MediaAsset => ({ uri, type: 'video', durationSec });
const image = (uri: string): MediaAsset => ({ uri, type: 'image' });

/** Source lengths as the picker reported them, for the trim clamps. */
const sources: Record<string, number> = { 'file://a.mp4': 5, 'file://b.mp4': 8 };
const lengthOf = (src: string) => sources[src];

/**
 * A two-clip project and its clip ids together.
 *
 * They have to come from ONE call: ids are minted per project, so taking them
 * from a second `seed()` names clips in a project nobody is editing, and
 * every operation quietly becomes a no-op that still returns a valid project.
 */
function seed() {
  const project = addClips(newProject(1080, 1920), [
    video('file://a.mp4', 5),
    video('file://b.mp4', 8),
  ]);
  return { project, ids: clipsOf(project).map((c) => c.id) };
}

beforeEach(__resetIds);

describe('pack', () => {
  it('lays clips end to end from zero in array order', () => {
    const packed = pack([
      { id: 'a', type: 'video', src: 'a', start: 99, duration: 2 },
      { id: 'b', type: 'video', src: 'b', start: 99, duration: 3 },
    ]);
    expect(packed.map((c) => c.start)).toEqual([0, 2]);
  });

  it('does not mutate its input', () => {
    const input = [{ id: 'a', type: 'video' as const, src: 'a', start: 99, duration: 2 }];
    pack(input);
    expect(input[0].start).toBe(99);
  });
});

describe('addClips', () => {
  it('appends packed, and gives a still a fixed length', () => {
    const p = addClips(newProject(1080, 1920), [video('file://a.mp4', 5), image('file://c.jpg')]);
    expect(clipsOf(p).map((c) => [c.start, c.duration])).toEqual([
      [0, 5],
      [5, 3],
    ]);
  });

  it('leaves the legacy single-track fields empty so the renderer reads tracks', () => {
    const p = seed().project;
    expect(p.clips).toEqual([]);
    expect(p.overlays).toEqual([]);
    expect(p.audio).toEqual([]);
    expect(p.tracks).toHaveLength(1);
  });
});

describe('clipAt', () => {
  const clips = clipsOf(seed().project);

  it('gives the end of a clip to the next one, so a cut lands on one frame', () => {
    expect(clipAt(clips, 4.999)?.src).toBe('file://a.mp4');
    expect(clipAt(clips, 5)?.src).toBe('file://b.mp4');
  });

  it('holds the last frame at and past the end of the timeline', () => {
    expect(clipAt(clips, 13)?.src).toBe('file://b.mp4');
    expect(clipAt(clips, 99)?.src).toBe('file://b.mp4');
  });

  it('answers null before zero and on an empty track', () => {
    expect(clipAt(clips, -1)).toBeNull();
    expect(clipAt([], 0)).toBeNull();
  });
});

describe('trimClip', () => {
  it('out moves only the duration', () => {
    const { project, ids } = seed();
    const [a, b] = clipsOf(trimClip(project, ids[0], 'out', -2, lengthOf));
    expect(a.duration).toBe(3);
    expect(a.trimIn).toBe(0);
    expect(b.start).toBe(3); // the track re-packed behind it
  });

  it('out cannot run past the end of the source', () => {
    const { project, ids } = seed();
    expect(clipsOf(trimClip(project, ids[0], 'out', 100, lengthOf))[0].duration).toBe(5);
  });

  it('in moves trimIn and duration in opposite directions', () => {
    const { project, ids } = seed();
    const a = clipsOf(trimClip(project, ids[0], 'in', 1.5, lengthOf))[0];
    expect(a.trimIn).toBe(1.5);
    expect(a.duration).toBe(3.5);
    // The frame under the right-hand edge did not move.
    expect(a.trimIn! + a.duration).toBe(5);
  });

  it('in cannot drag before the head of the source', () => {
    const { project, ids } = seed();
    const a = clipsOf(trimClip(project, ids[0], 'in', -10, lengthOf))[0];
    expect(a.trimIn).toBe(0);
    expect(a.duration).toBe(5);
  });

  it('neither edge can shrink a clip below the grab minimum', () => {
    const { project, ids } = seed();
    expect(clipsOf(trimClip(project, ids[0], 'out', -99, lengthOf))[0].duration).toBe(MIN_CLIP);
    expect(clipsOf(trimClip(project, ids[0], 'in', 99, lengthOf))[0].duration).toBe(MIN_CLIP);
  });

  it('lets a still be held for any length, having no source to run out of', () => {
    const p = addClips(newProject(1080, 1920), [image('file://c.jpg')]);
    const out = trimClip(p, clipsOf(p)[0].id, 'out', 60, lengthOf);
    expect(clipsOf(out)[0].duration).toBe(63);
  });

  it('treats a video of unknown length as untrimmable past where it already ends', () => {
    const p = addClips(newProject(1080, 1920), [{ uri: 'file://unknown.mp4', type: 'video' }]);
    const out = trimClip(p, clipsOf(p)[0].id, 'out', 60, lengthOf);
    expect(clipsOf(out)[0].duration).toBe(3); // its seeded length, not 63
  });
});

describe('moveClip and removeClip', () => {
  it('swaps neighbours and re-packs', () => {
    const { project, ids } = seed();
    expect(clipsOf(moveClip(project, ids[0], 1)).map((c) => [c.src, c.start])).toEqual([
      ['file://b.mp4', 0],
      ['file://a.mp4', 8],
    ]);
  });

  it('is a no-op at either end', () => {
    const { project, ids } = seed();
    expect(moveClip(project, ids[0], -1)).toBe(project);
    expect(moveClip(project, ids[1], 1)).toBe(project);
  });

  it('closes the hole a removal leaves', () => {
    const { project, ids } = seed();
    const p = removeClip(project, ids[0]);
    expect(clipsOf(p).map((c) => c.start)).toEqual([0]);
    expect(totalDuration(clipsOf(p))).toBe(8);
  });
});

describe('formatTime', () => {
  it('pads so the readout does not jump width as it counts', () => {
    expect(formatTime(0)).toBe('0:00.0');
    expect(formatTime(9.44)).toBe('0:09.4');
    expect(formatTime(75.2)).toBe('1:15.2');
  });

  it('never shows a negative time', () => {
    expect(formatTime(-3)).toBe('0:00.0');
  });
});
