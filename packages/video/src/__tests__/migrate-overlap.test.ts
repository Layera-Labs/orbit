/**
 * The migration onto overlapping transitions.
 *
 * The most carefully tested thing in this change, because it is the one that
 * touches documents people already have: it moves every clip on the main track,
 * and then has to move the captions, music and picture-in-picture that were
 * placed against them by the same amount, or the mix slides off the picture.
 * Getting that wrong is not a rendering glitch, it is someone's edit coming
 * back wrong.
 */
import { describe, expect, it } from 'vitest';
import type { AudioTrack, VideoProject, VisualTrack } from '../types';
import { migrateTransitionOverlap, OVERLAP_SCHEMA } from '../migrate-overlap';
import { projectDuration } from '../project';
import { resolveTransitions } from '../xfade';

const vclip = (
  id: string,
  start: number,
  duration: number,
  transitionIn?: { type: 'fade' | 'cut'; duration: number },
) =>
  ({
    id,
    type: 'video' as const,
    src: `${id}.mp4`,
    start,
    duration,
    ...(transitionIn ? { transitionIn } : {}),
  });

/**
 * Three main clips joined by two 1s fades, plus everything that has to travel
 * with them: a PiP over clip 2, a caption over clip 3 and a music cue.
 */
function fixture(): VideoProject {
  return {
    id: 'p',
    schemaVersion: 2,
    width: 1080,
    height: 1920,
    fps: 30,
    background: { type: 'color', color: '#000' },
    clips: [],
    overlays: [
      { id: 'cap1', type: 'text', text: 'one', start: 0.5, end: 3, x: 0.5, y: 0.8, fontSize: 48, color: '#fff' },
      { id: 'cap3', type: 'text', text: 'three', start: 9, end: 11, x: 0.5, y: 0.8, fontSize: 48, color: '#fff' },
    ],
    audio: [],
    tracks: [
      {
        id: 'main',
        kind: 'visual',
        clips: [
          vclip('a', 0, 4),
          vclip('b', 4, 4, { type: 'fade', duration: 1 }),
          vclip('c', 8, 4, { type: 'fade', duration: 1 }),
        ],
      },
      { id: 'pip', kind: 'visual', clips: [vclip('p1', 5, 2)] },
      {
        id: 'aud',
        kind: 'audio',
        clips: [
          { id: 'm1', src: 'm.mp3', start: 0, duration: 12 },
          { id: 'm2', src: 'sting.mp3', start: 9, duration: 1 },
        ],
      },
    ],
  };
}

const main = (p: VideoProject) => (p.tracks![0] as VisualTrack).clips;
const pip = (p: VideoProject) => (p.tracks![1] as VisualTrack).clips;
const aud = (p: VideoProject) => (p.tracks![2] as AudioTrack).clips;

describe('migrateTransitionOverlap', () => {
  it('lays each transitioned clip back over the one before it', () => {
    const m = migrateTransitionOverlap(fixture());
    expect(main(m).map((c) => c.start)).toEqual([0, 3, 6]);
  });

  it('shortens the PICTURE by exactly the sum of its transitions', () => {
    const end = (p: VideoProject) => {
      const cs = main(p);
      return Math.max(...cs.map((c) => c.start + c.duration));
    };
    expect(end(fixture())).toBe(12);
    expect(end(migrateTransitionOverlap(fixture()))).toBe(10); // two 1s fades
  });

  it('does not retime the music to match, and the project length says so', () => {
    /*
     * A real consequence, stated rather than hidden: the fixture's music runs
     * 0–12 and still does, so the project is still 12s long with two seconds of
     * music over the background at the end. Silently trimming a track the user
     * placed would be worse than leaving them a tail they can see and trim.
     */
    expect(projectDuration(fixture())).toBe(12);
    expect(projectDuration(migrateTransitionOverlap(fixture()))).toBe(12);
    expect(aud(migrateTransitionOverlap(fixture()))[0].duration).toBe(12);
  });

  it('produces a layout the resolver reads back as real crossfades', () => {
    // The round trip is the point: what the migration writes into `start` has
    // to be what `resolveTransitions` — and therefore the export — reads out.
    const r = resolveTransitions(main(migrateTransitionOverlap(fixture())));
    expect(r.edges).toEqual([]);
    expect(r.boundaries.map((b) => [b.prevId, b.nextId, b.overlap, b.at])).toEqual([
      ['a', 'b', 1, 3],
      ['b', 'c', 1, 6],
    ]);
  });

  it('keeps a picture-in-picture over the clip it was placed on', () => {
    // p1 sat at 5, one second into clip b (which began at 4). b now begins at
    // 3, so p1 must begin at 4 — still one second in.
    const m = migrateTransitionOverlap(fixture());
    expect(pip(m)[0].start).toBe(4);
    expect(main(m)[1].start).toBe(3);
  });

  it('keeps a caption over the clip it was placed on, at its own length', () => {
    const m = migrateTransitionOverlap(fixture());
    const cap3 = m.overlays.find((o) => o.id === 'cap3')!;
    // cap3 sat at 9, one second into clip c (8). c now starts at 6, so 7.
    expect(cap3.start).toBe(7);
    // Its LENGTH is untouched — the migration has no business retiming a
    // caption that happens to span a transition.
    expect(cap3.end - cap3.start).toBe(2);
  });

  it('leaves anything before the first transition exactly where it was', () => {
    const m = migrateTransitionOverlap(fixture());
    expect(m.overlays.find((o) => o.id === 'cap1')!.start).toBe(0.5);
    expect(aud(m)[0].start).toBe(0);
    expect(main(m)[0].start).toBe(0);
  });

  it('moves a music cue by the shift accumulated where IT sits', () => {
    // The sting at 9 sits after both transitions, so it comes back 2s.
    expect(aud(migrateTransitionOverlap(fixture()))[1].start).toBe(7);
  });

  it('cannot run twice', () => {
    const once = migrateTransitionOverlap(fixture());
    expect(once.schemaVersion).toBe(OVERLAP_SCHEMA);
    // Running again would pull everything back a second time.
    expect(migrateTransitionOverlap(once)).toBe(once);
  });

  it('is identity-cheap for a project with no transitions', () => {
    const plain: VideoProject = {
      ...fixture(),
      tracks: [
        { id: 'main', kind: 'visual', clips: [vclip('a', 0, 4), vclip('b', 4, 4)] },
      ],
    };
    const m = migrateTransitionOverlap(plain);
    expect(m.tracks).toBe(plain.tracks);
    expect(m.overlays).toBe(plain.overlays);
    expect(m.schemaVersion).toBe(OVERLAP_SCHEMA);
  });

  it('ignores a cut, which is the absence of a transition', () => {
    const cut: VideoProject = {
      ...fixture(),
      overlays: [],
      tracks: [
        {
          id: 'main',
          kind: 'visual',
          clips: [vclip('a', 0, 4), vclip('b', 4, 4, { type: 'cut', duration: 1 })],
        },
      ],
    };
    expect(main(migrateTransitionOverlap(cut)).map((c) => c.start)).toEqual([0, 4]);
  });

  it('clamps a transition that would swallow half a clip', () => {
    // b is 2s long, so at most 1s of it may be spent transitioning — the stored
    // 2s request is honoured only as far as it can be.
    const greedy: VideoProject = {
      ...fixture(),
      overlays: [],
      tracks: [
        {
          id: 'main',
          kind: 'visual',
          clips: [vclip('a', 0, 4), vclip('b', 4, 2, { type: 'fade', duration: 2 })],
        },
      ],
    };
    expect(main(migrateTransitionOverlap(greedy)).map((c) => c.start)).toEqual([0, 3]);
  });
});
