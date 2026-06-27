import { describe, expect, it } from 'vitest';
import { buildFFmpegArgs } from '../ffmpeg';
import { atempoChain, filterToFFmpeg, resolveFilter } from '../filters';
import type { VideoProject } from '../types';

describe('filters.ts', () => {
  it('neutral filters produce no chain', () => {
    expect(filterToFFmpeg(undefined)).toBe('');
    expect(filterToFFmpeg({})).toBe('');
    expect(filterToFFmpeg({ preset: 'none' })).toBe('');
  });

  it('vivid preset → eq chain with trailing comma', () => {
    const c = filterToFFmpeg({ preset: 'vivid' });
    expect(c).toContain('eq=brightness=0.03:contrast=1.15:saturation=1.4');
    expect(c.endsWith(',')).toBe(true);
  });

  it('warm preset adds colortemperature (warmer = lower Kelvin)', () => {
    expect(filterToFFmpeg({ preset: 'warm' })).toContain('colortemperature=temperature=5625'); // 6500 - 0.35*2500
  });

  it('intensity lerps the grade toward neutral', () => {
    const half = resolveFilter({ preset: 'vivid', intensity: 0.5 });
    expect(half.saturation).toBeCloseTo(1.2); // 1 + (1.4-1)*0.5
    expect(half.contrast).toBeCloseTo(1.075); // 1 + (1.15-1)*0.5
  });

  it('explicit fields override the preset', () => {
    expect(filterToFFmpeg({ preset: 'vivid', saturation: 2 })).toContain('saturation=2');
  });

  it('atempoChain chains factors outside ffmpeg 0.5..2 range', () => {
    expect(atempoChain(1)).toBe('');
    expect(atempoChain(2)).toBe('atempo=2');
    expect(atempoChain(4)).toBe('atempo=2,atempo=2');
    expect(atempoChain(0.25)).toBe('atempo=0.5,atempo=0.5');
  });
});

describe('engine applies per-clip filter + speed', () => {
  const project: VideoProject = {
    id: 'p',
    schemaVersion: 2,
    width: 1080,
    height: 1920,
    fps: 30,
    background: { type: 'color', color: '#000000' },
    clips: [],
    overlays: [],
    audio: [],
    tracks: [
      {
        id: 'base',
        kind: 'visual',
        clips: [{ id: 'v0', type: 'video', src: 'a.mp4', start: 0, duration: 4, trimIn: 0, filter: { preset: 'vivid' }, speed: 2 }],
      },
    ],
  };
  const args = buildFFmpegArgs(project, { outputPath: '/tmp/o.mp4', baseImage: '/tmp/bg.png', hasAudio: () => true });
  const graph = args[args.indexOf('-filter_complex') + 1];

  it('injects the colour grade into the clip video chain', () => {
    expect(graph).toContain('eq=brightness=0.03:contrast=1.15:saturation=1.4');
  });

  it('applies speed via setpts division and consumes duration×speed of source', () => {
    expect(graph).toContain('trim=start=0:duration=8'); // 4 × 2
    expect(graph).toContain('setpts=(PTS-STARTPTS)/2+0/TB');
  });

  it('applies atempo to the sped-up clip audio', () => {
    expect(graph).toContain('atempo=2,adelay=');
  });
});

describe('engine applies per-clip FX (blur)', () => {
  const project: VideoProject = {
    id: 'p',
    schemaVersion: 2,
    width: 1080,
    height: 1920,
    fps: 30,
    background: { type: 'color', color: '#000000' },
    clips: [],
    overlays: [],
    audio: [],
    tracks: [
      {
        id: 'base',
        kind: 'visual',
        clips: [{ id: 'v0', type: 'video', src: 'a.mp4', start: 0, duration: 4, trimIn: 0, blur: 0.5 }],
      },
    ],
  };
  const args = buildFFmpegArgs(project, { outputPath: '/tmp/o.mp4', baseImage: '/tmp/bg.png', hasAudio: () => true });
  const graph = args[args.indexOf('-filter_complex') + 1];

  it('maps blur 0..1 to gblur sigma (×20)', () => {
    expect(graph).toContain('gblur=sigma=10'); // 0.5 × 20
  });

  it('omits gblur when blur is absent or zero', () => {
    const none: VideoProject = { ...project, tracks: [{ id: 'base', kind: 'visual', clips: [{ id: 'v0', type: 'video', src: 'a.mp4', start: 0, duration: 4, trimIn: 0 }] }] };
    const a = buildFFmpegArgs(none, { outputPath: '/tmp/o.mp4', baseImage: '/tmp/bg.png', hasAudio: () => true });
    expect(a[a.indexOf('-filter_complex') + 1]).not.toContain('gblur');
  });
});

describe('engine applies transitions (fade-through-black)', () => {
  const project: VideoProject = {
    id: 'p',
    schemaVersion: 2,
    width: 1080,
    height: 1920,
    fps: 30,
    background: { type: 'color', color: '#000000' },
    clips: [],
    overlays: [],
    audio: [],
    tracks: [
      {
        id: 'base',
        kind: 'visual',
        clips: [
          { id: 'a', type: 'video', src: 'a.mp4', start: 0, duration: 3, trimIn: 0 },
          { id: 'b', type: 'video', src: 'b.mp4', start: 3, duration: 3, trimIn: 0, transitionIn: { type: 'fade', duration: 1 } },
        ],
      },
    ],
  };
  const args = buildFFmpegArgs(project, { outputPath: '/tmp/o.mp4', baseImage: '/tmp/bg.png', hasAudio: () => true });
  const graph = args[args.indexOf('-filter_complex') + 1];

  it('fades the incoming clip in at its start', () => {
    expect(graph).toContain('fade=t=in:st=3:d=1:alpha=1');
  });
  it('fades the previous clip out into the transition', () => {
    expect(graph).toContain('fade=t=out:st=2:d=1:alpha=1'); // clip a ends at 3, fade out over last 1s
  });
  it('uses an alpha pixel format for faded clips', () => {
    expect(graph).toContain('format=yuva420p');
  });
});
