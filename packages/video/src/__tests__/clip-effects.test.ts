import { describe, expect, it } from 'vitest';
import { buildFFmpegArgs } from '../ffmpeg';
import { atempoChain, filterToFFmpeg, resolveFilter } from '../filters';
import { hasMotion, motionStateAt, motionToZoompan } from '../motion';
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

describe('motion.ts', () => {
  it('none / zero intensity → no motion, identity state', () => {
    expect(hasMotion(undefined)).toBe(false);
    expect(hasMotion({ type: 'none' })).toBe(false);
    expect(hasMotion({ type: 'zoomIn', intensity: 0 })).toBe(false);
    expect(motionStateAt({ type: 'zoomIn' }, 0)).toEqual({ scale: 1, tx: 0, ty: 0 });
  });

  it('zoomIn scale grows from 1 over progress', () => {
    expect(motionStateAt({ type: 'zoomIn', intensity: 1 }, 0).scale).toBeCloseTo(1);
    expect(motionStateAt({ type: 'zoomIn', intensity: 1 }, 1).scale).toBeCloseTo(1.3); // 1 + ZOOM_DELTA
  });

  it('zoomOut scale shrinks toward 1', () => {
    expect(motionStateAt({ type: 'zoomOut', intensity: 1 }, 0).scale).toBeCloseTo(1.3);
    expect(motionStateAt({ type: 'zoomOut', intensity: 1 }, 1).scale).toBeCloseTo(1);
  });

  it('pan presets keep a constant base zoom and slide horizontally', () => {
    const a = motionStateAt({ type: 'panRight', intensity: 1 }, 0);
    const b = motionStateAt({ type: 'panRight', intensity: 1 }, 1);
    expect(a.scale).toBeCloseTo(b.scale); // constant zoom
    expect(a.tx).not.toBeCloseTo(b.tx); // pans
  });

  it('zoompan filter uses output-frame on counter and given size/fps', () => {
    const zp = motionToZoompan({ type: 'zoomIn', intensity: 1 }, 60, 1080, 1920, 30);
    expect(zp).toContain('zoompan=');
    expect(zp).toContain('on/59'); // frames-1
    expect(zp).toContain('d=1:s=1080x1920:fps=30');
  });

  it('zoompan is empty for no-op motion', () => {
    expect(motionToZoompan({ type: 'none' }, 60, 1080, 1920, 30)).toBe('');
  });
});

describe('engine applies per-clip motion (zoompan + re-anchored PTS)', () => {
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
          { id: 'a', type: 'video', src: 'a.mp4', start: 0, duration: 2, trimIn: 0 },
          { id: 'b', type: 'video', src: 'b.mp4', start: 2, duration: 2, trimIn: 0, motion: { type: 'zoomIn', intensity: 1 } },
        ],
      },
    ],
  };
  const args = buildFFmpegArgs(project, { outputPath: '/tmp/o.mp4', baseImage: '/tmp/bg.png', hasAudio: () => true });
  const graph = args[args.indexOf('-filter_complex') + 1];

  it('injects zoompan for the clip with motion only', () => {
    expect(graph).toContain('zoompan=');
    expect((graph.match(/zoompan=/g) ?? []).length).toBe(1);
  });

  it('re-anchors the clip PTS to its timeline start after zoompan', () => {
    expect(graph).toContain('setpts=PTS-STARTPTS+2/TB'); // clip b starts at t=2
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
