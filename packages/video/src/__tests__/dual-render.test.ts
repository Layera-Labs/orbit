/**
 * The dual-render invariant, enforced with numbers.
 *
 * `frameStateAt` (browser canvas preview) and `buildMultiTrackArgs` (ffmpeg
 * export) describe the same frame to two different renderers. Comments and good
 * intentions do not keep them in step — this does: build the REAL filtergraph,
 * parse the numbers back out of it, and assert they equal what the preview's
 * draw list reports at the matching timestamp.
 *
 * When this fails, the preview and the exported MP4 have diverged. Fix the
 * divergence; do not relax the assertion.
 */
import { describe, expect, it } from 'vitest';
import type { VideoProject, VisualTrack } from '../types';
import { buildFFmpegArgs } from '../ffmpeg';
import { frameStateAt } from '../frame';
import { resolveFilter } from '../filters';
import { fadeFactorAt, projectFadeMap } from '../transitions';

/**
 * Two visual clips on the main track — the second is a PiP with a colour grade,
 * blur, static opacity and a fade-in — plus a text overlay.
 */
function fixture(): VideoProject {
  return {
    id: 'p',
    schemaVersion: 2,
    width: 1080,
    height: 1920,
    fps: 30,
    background: { type: 'color', color: '#101010' },
    clips: [],
    overlays: [
      {
        id: 'cap',
        type: 'text',
        text: 'Hello',
        start: 1,
        end: 5,
        x: 0.5,
        y: 0.8,
        fontSize: 64,
        color: '#ffffff',
      },
    ],
    audio: [],
    tracks: [
      {
        id: 'main',
        kind: 'visual',
        clips: [
          { id: 'a', type: 'video', src: 'a.mp4', start: 0, duration: 6, trimIn: 2 },
          {
            id: 'b',
            type: 'video',
            src: 'b.mp4',
            start: 6,
            duration: 4,
            trimIn: 0,
            transitionIn: { type: 'fade', duration: 1 },
          },
        ],
      },
      {
        id: 'pip',
        kind: 'visual',
        clips: [
          {
            id: 'c',
            type: 'video',
            src: 'c.mp4',
            start: 1,
            duration: 5,
            // Chosen so w/h land on ODD pixels before rounding (1080×0.375=405,
            // 1920×0.1505≈289). H.264 needs even dimensions, so `even()` must
            // bump both — a fixture on already-even numbers would let a plain
            // `Math.round` regression slip through this whole file.
            rect: { x: 0.1, y: 0.2, w: 0.375, h: 0.1505 },
            filter: { preset: 'vivid' },
            blur: 0.25,
            opacity: 0.6,
            speed: 2,
          },
        ],
      },
    ],
  };
}

const project = fixture();
const args = buildFFmpegArgs(project, {
  outputPath: '/tmp/out.mp4',
  baseImage: '/tmp/bg.png',
  overlayImages: { cap: '/tmp/cap.png' },
  hasAudio: () => false,
});
const graph = args[args.indexOf('-filter_complex') + 1];

/** All `overlay=X:Y:enable='between(t,S,E)'` occurrences, in graph order. */
function overlays() {
  return [
    ...graph.matchAll(
      /overlay=(-?[\d.]+):(-?[\d.]+):enable='between\(t,([\d.]+),([\d.]+)\)'/g,
    ),
  ].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    start: Number(m[3]),
    end: Number(m[4]),
  }));
}

function opsAt(t: number) {
  return frameStateAt(project, t);
}

describe('preview draw list matches the exported filtergraph', () => {
  it('places every clip on the pixel the export overlays it at', () => {
    const fromGraph = overlays();
    // main a, main b, pip c — the three visual clips, in composite order.
    expect(fromGraph.length).toBeGreaterThanOrEqual(3);

    // At t=3 all of a and c are live; check each against its graph entry.
    const ops = opsAt(3).filter((o) => o.kind === 'clip');
    const a = ops.find((o) => o.id === 'a')!;
    const c = ops.find((o) => o.id === 'c')!;

    const ga = fromGraph.find((g) => g.start === 0 && g.end === 6)!;
    const gc = fromGraph.find((g) => g.start === 1 && g.end === 6)!;

    expect([a.dst.x, a.dst.y]).toEqual([ga.x, ga.y]);
    expect([c.dst.x, c.dst.y]).toEqual([gc.x, gc.y]);
  });

  it('sizes the PiP box exactly as scale/crop does', () => {
    // `scale=rw:rh:force_original_aspect_ratio=increase,crop=rw:rh`
    const sizes = [...graph.matchAll(/scale=(\d+):(\d+):force_original_aspect_ratio=increase/g)]
      .map((m) => `${m[1]}x${m[2]}`);
    const c = opsAt(3).find((o) => o.id === 'c')!;
    expect(sizes).toContain(`${c.dst.w}x${c.dst.h}`);
  });

  it('emits only the clips whose enable window is open', () => {
    const live = (t: number) =>
      opsAt(t)
        .filter((o) => o.kind === 'clip')
        .map((o) => o.id)
        .sort();
    // Graph windows: a [0,6], c [1,6], b [6,10].
    expect(live(0.5)).toEqual(['a']);
    expect(live(3)).toEqual(['a', 'c']);
    expect(live(8)).toEqual(['b']);
  });

  it('grades with the same eq parameters', () => {
    const eq = graph.match(/eq=brightness=(-?[\d.]+):contrast=([\d.]+):saturation=([\d.]+)/)!;
    const c = opsAt(3).find((o) => o.id === 'c')!;
    expect(c.filter.brightness).toBe(Number(eq[1]));
    expect(c.filter.contrast).toBe(Number(eq[2]));
    expect(c.filter.saturation).toBe(Number(eq[3]));
    // …and the preview agrees with the shared resolver, not a local copy.
    expect(c.filter).toEqual(resolveFilter({ preset: 'vivid' }));
  });

  it('blurs at the same sigma', () => {
    const sigma = Number(graph.match(/gblur=sigma=([\d.]+)/)![1]);
    const c = opsAt(3).find((o) => o.id === 'c')!;
    expect(c.blurSigma).toBe(sigma);
  });

  it('carries the same static opacity', () => {
    const aa = Number(graph.match(/colorchannelmixer=aa=([\d.]+)/)![1]);
    const c = opsAt(3).find((o) => o.id === 'c')!;
    expect(c.alpha).toBeCloseTo(aa, 6);
  });

  it('reads the source at the time the trim/setpts pair would', () => {
    // clip c: trimIn 0, speed 2 → at t=3 (2s in) the source is at 4s.
    const c = opsAt(3).find((o) => o.id === 'c')!;
    expect(c.srcTime).toBeCloseTo(4, 6);
    expect(graph).toContain('trim=start=0:duration=10'); // duration 5 × speed 2
    // clip a: trimIn 2, speed 1 → at t=3 the source is at 5s.
    expect(opsAt(3).find((o) => o.id === 'a')!.srcTime).toBeCloseTo(5, 6);
    expect(graph).toContain('trim=start=2:duration=6');
  });

  it('fades over the window the export fades over', () => {
    const fin = graph.match(/fade=t=in:st=([\d.]+):d=([\d.]+):alpha=1/)!;
    expect(Number(fin[1])).toBe(6); // clip b starts at 6
    expect(Number(fin[2])).toBe(1);

    const fades = projectFadeMap(project);
    // Midway through b's 1s fade-in the preview must be at half alpha.
    expect(fadeFactorAt(fades.get('b'), 6, 10, 6.5)).toBeCloseTo(0.5, 6);
    expect(opsAt(6.5).find((o) => o.id === 'b')!.alpha).toBeCloseTo(0.5, 6);
    expect(opsAt(7.5).find((o) => o.id === 'b')!.alpha).toBe(1);
  });

  it('fades out the outgoing clip across the same boundary', () => {
    const fout = graph.match(/fade=t=out:st=([\d.]+):d=([\d.]+):alpha=1/)!;
    expect(Number(fout[1])).toBe(5); // a ends at 6, fades out over the last 1s
    expect(opsAt(5.5).find((o) => o.id === 'a')!.alpha).toBeCloseTo(0.5, 6);
  });

  it('gates the text overlay on the same window and composites it last', () => {
    expect(graph).toMatch(/enable='between\(t,1,5\)'/);
    expect(opsAt(0.5).some((o) => o.kind === 'overlay')).toBe(false);
    expect(opsAt(3).some((o) => o.kind === 'overlay')).toBe(true);
    const ops = opsAt(3);
    expect(ops[ops.length - 1].kind).toBe('overlay');
    expect(ops[0].kind).toBe('background');
  });

  it('keeps track array order as z-order, not start time', () => {
    // c starts AFTER a but sits on a higher track, so it must composite later.
    const ids = opsAt(3)
      .filter((o) => o.kind === 'clip')
      .map((o) => o.id);
    expect(ids).toEqual(['a', 'c']);
  });
});

describe('effects the canvas cannot reproduce are declared, not hidden', () => {
  /** The PiP clip, typed — `Track` is a union so `clips` needs narrowing. */
  const pipClip = (p: VideoProject) => (p.tracks![1] as VisualTrack).clips[0];

  it('flags a temperature grade', () => {
    const p = fixture();
    pipClip(p).filter = { preset: 'warm' };
    const c = frameStateAt(p, 3).find((o) => o.id === 'c')!;
    expect(c.unsupported).toContain('temperature');
  });

  it('flags a chroma key', () => {
    const p = fixture();
    pipClip(p).cutout = { color: '#00ff00', similarity: 0.3, smoothness: 0.1 };
    const c = frameStateAt(p, 3).find((o) => o.id === 'c')!;
    expect(c.unsupported).toContain('cutout');
  });

  it('says nothing when everything is reproducible', () => {
    const c = frameStateAt(fixture(), 3).find((o) => o.id === 'c')!;
    expect(c.unsupported).toBeUndefined();
  });
});
