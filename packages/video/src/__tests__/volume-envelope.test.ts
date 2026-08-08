/**
 * Fades and ducks on the same clip.
 *
 * There is ONE envelope slot per clip and a curve OVERRIDES `volume`. With the
 * envelope stored as points that made the two mutually exclusive in a way
 * nothing announced: writing a duck turned the shape into a list `fadesOf`
 * could not recognise, so the fade sliders stopped reading back and the UI fell
 * to "custom curve" on a clip whose fades the user had set moments earlier.
 * Then the next thing they touched wrote over the duck.
 *
 * The fix is to store INTENT — `{ fadeIn, fadeOut, ducks }` — and materialize
 * to points at the last moment. `fadesOf` reads a number instead of guessing at
 * a shape, and `curvePoints` is the one place the shape gets built.
 *
 * The most important test in this file is the LAST one, which is the promise
 * that nothing already stored moved.
 */
import { describe, expect, it } from 'vitest';
import { buildFFmpegArgs } from '../ffmpeg';
import { curvePoints, sampleVolume } from '../curve';
import { ducksOf, fadesOf, withDucks, withFades, withVolume } from '../audio-fade';
import type { AudioTrackClip, VideoProject, VolumeDuck, VolumePoint } from '../types';

const DUCK: VolumeDuck = { at: 4, dur: 2, depth: 0.25, source: 'manual' };

/** A ten-second music bed. */
const clip = (over: Partial<AudioTrackClip> = {}): AudioTrackClip => ({
  id: 'music',
  src: 'bed.mp3',
  start: 0,
  duration: 10,
  volume: 0.8,
  ...over,
});

describe('a clip can carry fades AND a duck', () => {
  it('reads its fades back with a duck on it — the bug this exists for', () => {
    const faded = withFades(10, { volume: 0.8, fadeIn: 1, fadeOut: 2 });
    const ducked = withDucks(clip({ ...faded }), [DUCK]);
    const back = fadesOf(clip({ ...ducked }));

    expect(back).not.toBeNull();
    expect(back!.fadeIn).toBe(1);
    expect(back!.fadeOut).toBe(2);
    expect(back!.volume).toBe(0.8);
    // And the duck is still there, so neither control erased the other.
    expect(ducksOf(clip({ ...ducked }))).toHaveLength(1);
  });

  it('keeps the duck when the fades are changed afterwards', () => {
    const ducked = withDucks(clip(), [DUCK]);
    const c = clip({ ...ducked });
    const refaded = withFades(10, { ...fadesOf(c)!, fadeIn: 3 }, ducksOf(c));
    expect(ducksOf(clip({ ...refaded }))[0]).toMatchObject({ at: 4, dur: 2 });
    expect(fadesOf(clip({ ...refaded }))!.fadeIn).toBe(3);
  });

  it('moves the plateau without rescaling the duck', () => {
    /*
     * `depth` is a FRACTION of the plateau, so the dip follows the level for
     * free. Stored as an absolute gain it would need rescaling on every volume
     * change — and a duck that was 12 dB under the music would become 12 dB
     * under silence the moment someone turned the clip down.
     */
    const c = clip({ ...withDucks(clip(), [DUCK]) });
    const louder = withVolume(c, 1.5);
    expect(louder.volume).toBe(1.5);
    expect(ducksOf(clip({ ...louder }))[0].depth).toBe(0.25);

    const pts = curvePoints(louder.volumeCurve, 10, louder.volume)!;
    // The floor of the dip is a quarter of the NEW plateau.
    expect(Math.min(...pts.map((p) => p.v))).toBeCloseTo(1.5 * 0.25, 6);
  });
});

describe('curvePoints materializes the shape', () => {
  const env = { fadeIn: 1, fadeOut: 2, ducks: [DUCK] };

  it('ramps from silence, holds, dips, recovers and ramps back to silence', () => {
    const at = (sec: number) => sampleVolume(curvePoints(env, 10, 0.8)!, sec / 10);
    expect(at(0)).toBeCloseTo(0, 6); // silent at the head
    expect(at(1)).toBeCloseTo(0.8, 6); // fade in complete
    expect(at(3)).toBeCloseTo(0.8, 6); // plateau, before the duck
    expect(at(4)).toBeCloseTo(0.8, 6); // duck begins at full level
    expect(at(4.25)).toBeCloseTo(0.2, 6); // floor after a 0.25s ramp
    expect(at(5.75)).toBeCloseTo(0.2, 6); // still down
    expect(at(6)).toBeCloseTo(0.8, 6); // recovered
    expect(at(8)).toBeCloseTo(0.8, 6); // plateau, before the fade out
    expect(at(10)).toBeCloseTo(0, 6); // silent at the tail
  });

  it('clamps a duck to the plateau rather than letting it overlap a fade', () => {
    /*
     * A duck inside a fade would make the envelope a PRODUCT of two ramps —
     * a curve no straight segment reproduces, which the export and the two
     * previews would each approximate differently. It is also not what anyone
     * means: during a fade the level is already heading to silence, and a dip
     * inside one asks for something quieter than that.
     */
    const early = curvePoints({ fadeIn: 3, ducks: [{ at: 0, dur: 2, depth: 0.5 }] }, 10, 1)!;
    // Nothing before the fade completes is below the fade's own ramp.
    expect(sampleVolume(early, 1.5 / 10)).toBeCloseTo(0.5, 6);
    // The duck itself starts no earlier than the plateau does.
    expect(Math.min(...early.filter((p) => p.t < 0.3).map((p) => p.v))).toBe(0);
  });

  it('drops a duck with no room left', () => {
    // 10s clip, 4s of fade at each end, duck asked for at 9s: nothing survives.
    const pts = curvePoints(
      { fadeIn: 4, fadeOut: 4, ducks: [{ at: 9, dur: 2, depth: 0.2 }] },
      10,
      1,
    )!;
    expect(Math.min(...pts.map((p) => p.v))).toBe(0);
    // Exactly the fade-only shape: silence, plateau, plateau, silence.
    expect(pts).toHaveLength(4);
  });

  it('lets a hand-drawn shape win outright', () => {
    // `points` exists because no combination of fields can express an arbitrary
    // curve; when one is stored it is the answer, not an input to be combined.
    const drawn: VolumePoint[] = [
      { t: 0, v: 0.1 },
      { t: 0.5, v: 0.9 },
      { t: 1, v: 0.3 },
    ];
    expect(curvePoints({ fadeIn: 2, points: drawn }, 10, 1)).toEqual(drawn);
    expect(fadesOf(clip({ volumeCurve: { points: drawn } }))).toBeNull();
  });
});

describe('the export renders it', () => {
  const project = (audio: AudioTrackClip[]): VideoProject =>
    ({
      id: 'p',
      schemaVersion: 3,
      width: 320,
      height: 240,
      fps: 30,
      background: { type: 'color', color: '#000' },
      clips: [],
      overlays: [],
      audio: [],
      tracks: [
        {
          id: 'v',
          kind: 'visual',
          clips: [{ id: 'c', type: 'image', src: 'a.png', start: 0, duration: 10 }],
        },
        { id: 'a', kind: 'audio', clips: audio },
      ],
    }) as unknown as VideoProject;

  const graph = (p: VideoProject) => {
    const args = buildFFmpegArgs(p, { outputPath: '/tmp/o.mp4', baseImage: '/tmp/b.png' });
    return args[args.indexOf('-filter_complex') + 1];
  };

  it('emits a per-frame expression against the clip PLATEAU, not unity', () => {
    const c = clip({ ...withDucks(clip(), [DUCK]) });
    const g = graph(project([c]));
    expect(g).toContain(':eval=frame');
    // 0.8 is the plateau and 0.2 the floor. Materializing against 1 instead
    // would render the whole bed at unity with a dip to 0.25.
    expect(g).toContain('0.8');
    expect(g).toContain('0.2');
  });

  it('honours an envelope on the LEGACY audio path too', () => {
    /*
     * All three templates write their music into `project.audio`, which emitted
     * a bare `volume=<n>` — so a template's bed was the one audio in the
     * product that could not be faded or ducked, and nobody decided that.
     */
    const legacy: VideoProject = {
      ...project([]),
      tracks: undefined,
      clips: [{ id: 'c', type: 'image', src: 'a.png', duration: 10 }],
      audio: [
        { id: 'm', src: 'bed.mp3', start: 0, duration: 10, volume: 0.8, volumeCurve: { fadeIn: 1 } },
      ],
    } as unknown as VideoProject;
    const args = buildFFmpegArgs(legacy, { outputPath: '/tmp/o.mp4', baseImage: '/tmp/b.png' });
    const g = args[args.indexOf('-filter_complex') + 1];
    expect(g).toContain(':eval=frame');
  });
});

describe('nothing already stored moved', () => {
  it('still writes a bare point list when there is no duck', () => {
    /*
     * The promise that makes this shape change safe. Every fade-only clip —
     * which is every clip in every project written before today — keeps the
     * array form, so its document is unchanged and a renderer that predates
     * the structured form renders exactly what it always did.
     */
    const written = withFades(10, { volume: 0.8, fadeIn: 1, fadeOut: 2 });
    expect(Array.isArray(written.volumeCurve)).toBe(true);
    expect(written.volumeCurve).toEqual([
      { t: 0, v: 0 },
      { t: 0.1, v: 0.8 },
      { t: 0.8, v: 0.8 },
      { t: 1, v: 0 },
    ]);
  });

  it('reads a legacy point list back as fades', () => {
    const legacy = clip({
      volumeCurve: [
        { t: 0, v: 0 },
        { t: 0.1, v: 0.8 },
        { t: 0.8, v: 0.8 },
        { t: 1, v: 0 },
      ],
    });
    expect(fadesOf(legacy)).toEqual({ volume: 0.8, fadeIn: 1, fadeOut: 2 });
  });

  it('still removes the curve entirely when nothing is left on it', () => {
    // A clip with no fades and no ducks carries a plain number again, so the
    // export emits `volume=<n>` rather than a one-value expression.
    expect(withFades(10, { volume: 0.5, fadeIn: 0, fadeOut: 0 }).volumeCurve).toBeUndefined();
    expect(withDucks(clip({ volume: 0.5 }), []).volumeCurve).toBeUndefined();
  });
});
