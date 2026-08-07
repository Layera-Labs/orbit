/**
 * `createProject` must carry every field of the type it accepts.
 *
 * It takes a `Partial<VideoProject>` and dropped two of them — `tracks` and
 * `frame` — silently. A caller building a multi-track project got back one with
 * no clips and no audio, and that failure is unusually hard to spot: the render
 * SUCCEEDS. It produces the right duration, with the overlays drawn over the
 * background, and no picture and no sound. Nothing throws, and the result is
 * plausible enough to be blamed on the media.
 *
 * Found by the Phase 0 pipeline spike. Every caller that predates `tracks`
 * passes `clips`, so nothing in the repo had ever reached the gap.
 */
import { describe, expect, it } from 'vitest';
import { createProject } from '../project';
import { OVERLAP_SCHEMA } from '../migrate-overlap';
import type { Track, VideoProject } from '../types';

const tracks: Track[] = [
  {
    id: 'v',
    kind: 'visual',
    clips: [{ id: 'c', type: 'image', src: 'a.png', start: 0, duration: 4 }],
  },
  {
    id: 'a',
    kind: 'audio',
    clips: [{ id: 'vo', src: 'vo.mp3', start: 0, duration: 4 }],
  },
];

describe('createProject carries what it is given', () => {
  it('keeps tracks', () => {
    const p = createProject({ width: 1080, height: 1920, tracks });
    expect(p.tracks).toEqual(tracks);
  });

  it('keeps a canvas frame', () => {
    const frame = { color: '#ffffff', width: 0.02 };
    const p = createProject({ width: 1080, height: 1920, frame });
    expect(p.frame).toEqual(frame);
  });

  /*
   * The regression in the exact shape it took: a multi-track project whose
   * clips and audio live in `tracks` came back with both arrays empty and no
   * `tracks` at all — so it rendered as overlays over a background.
   */
  it('does not silently produce an empty project from a multi-track one', () => {
    const p = createProject({ width: 1080, height: 1920, tracks });
    const clips = p.tracks?.flatMap((t) => t.clips) ?? [];
    expect(clips.length).toBeGreaterThan(0);
    expect(p.tracks?.some((t) => t.kind === 'audio' && t.clips.length > 0)).toBe(true);
  });
});

describe('the schema version it stamps', () => {
  /*
   * A project born WITH tracks cannot need the overlap migration — it has no
   * transitions to reinterpret — so it is born current. Stamping it 1 would
   * invite a migration pass over a document that must not change.
   */
  it('is current for a project born with tracks', () => {
    expect(createProject({ width: 1080, height: 1920, tracks }).schemaVersion).toBe(OVERLAP_SCHEMA);
  });

  /* And unchanged for every caller that predates them. */
  it('stays 1 for a legacy single-track project', () => {
    const p = createProject({
      width: 1080,
      height: 1920,
      clips: [{ id: 'c', type: 'image', src: 'a.png', start: 0, duration: 4 }],
    });
    expect(p.schemaVersion).toBe(1);
  });

  it('respects one the caller states', () => {
    const p = createProject({ width: 1080, height: 1920, tracks, schemaVersion: 2 });
    expect(p.schemaVersion).toBe(2);
  });

  it('stays 1 for an empty tracks array, which is not a multi-track project', () => {
    expect(createProject({ width: 1080, height: 1920, tracks: [] }).schemaVersion).toBe(1);
  });
});

describe('nothing else moved', () => {
  it('omits tracks and frame entirely when not given, rather than writing undefined', () => {
    const p = createProject({ width: 1080, height: 1920 }) as VideoProject;
    expect('tracks' in p).toBe(false);
    expect('frame' in p).toBe(false);
  });

  it('still defaults the way it always did', () => {
    const p = createProject({ width: 640, height: 480 });
    expect(p).toMatchObject({
      id: 'project',
      fps: 30,
      background: { type: 'color', color: '#000000' },
      clips: [],
      overlays: [],
      audio: [],
    });
  });
});
