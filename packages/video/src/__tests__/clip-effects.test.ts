import { describe, expect, it } from 'vitest';
import { buildFFmpegArgs } from '../ffmpeg';
import { atempoChain, filterToFFmpeg, resolveFilter } from '../filters';
import { hasMotion, motionStateAt, motionToZoompan } from '../motion';
import { chromaToFFmpeg, hexToRgb } from '../cutout';
import { animatesOpacity, animatesPosition, hasKeyframes, keyframeExpr, sampleKeyframes } from '../keyframes';
import type { Keyframe, VideoProject } from '../types';

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

describe('cutout.ts', () => {
  it('parses hex (#rgb / #rrggbb) to 0..255', () => {
    expect(hexToRgb('#00d400')).toEqual([0, 212, 0]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
  });

  it('builds a colorkey filter from the key colour + tolerances', () => {
    expect(chromaToFFmpeg({ color: '#00d400', similarity: 0.3, smoothness: 0.1 }))
      .toBe('colorkey=color=0x00d400:similarity=0.3:blend=0.1');
  });

  it('no colour → empty (no-op)', () => {
    expect(chromaToFFmpeg(undefined)).toBe('');
    expect(chromaToFFmpeg({ color: '' })).toBe('');
  });
});

describe('engine applies a chroma-key cutout (rgba + colorkey)', () => {
  const project: VideoProject = {
    id: 'p', schemaVersion: 2, width: 1080, height: 1920, fps: 30,
    background: { type: 'color', color: '#000000' }, clips: [], overlays: [], audio: [],
    tracks: [
      { id: 'base', kind: 'visual', clips: [{ id: 'bg', type: 'video', src: 'bg.mp4', start: 0, duration: 2, trimIn: 0 }] },
      { id: 'ov', kind: 'visual', clips: [{ id: 'fg', type: 'video', src: 'fg.mp4', start: 0, duration: 2, trimIn: 0, cutout: { color: '#00d400' } }] },
    ],
  };
  const args = buildFFmpegArgs(project, { outputPath: '/tmp/o.mp4', baseImage: '/tmp/bg.png', hasAudio: () => true });
  const graph = args[args.indexOf('-filter_complex') + 1];

  it('forces rgba and applies colorkey on the keyed clip', () => {
    expect(graph).toContain('format=rgba,colorkey=color=0x00d400');
  });

  it('leaves the un-keyed base clip as yuv420p', () => {
    expect(graph).toContain('format=yuv420p');
  });
});

describe('keyframes.ts', () => {
  const kfs: Keyframe[] = [
    { t: 0, opacity: 0, x: 0, y: 0 },
    { t: 1, opacity: 1, x: 0.5, y: 0.25 },
  ];

  it('hasKeyframes needs ≥2', () => {
    expect(hasKeyframes(undefined)).toBe(false);
    expect(hasKeyframes([{ t: 0, opacity: 1, x: 0, y: 0 }])).toBe(false);
    expect(hasKeyframes(kfs)).toBe(true);
  });

  it('samples linearly between keyframes', () => {
    expect(sampleKeyframes(kfs, 0.5)).toEqual({ opacity: 0.5, x: 0.25, y: 0.125 });
    expect(sampleKeyframes(kfs, 0).opacity).toBe(0);
    expect(sampleKeyframes(kfs, 1).x).toBe(0.5);
  });

  it('holds flat before first / after last', () => {
    expect(sampleKeyframes(kfs, -1).opacity).toBe(0);
    expect(sampleKeyframes(kfs, 2).x).toBe(0.5);
  });

  it('detects which channels animate', () => {
    expect(animatesOpacity(kfs)).toBe(true);
    expect(animatesPosition(kfs)).toBe(true);
    expect(animatesOpacity([{ t: 0, opacity: 1, x: 0, y: 0 }, { t: 1, opacity: 1, x: 0.5, y: 0 }])).toBe(false);
    expect(animatesPosition([{ t: 0, opacity: 0, x: 0.2, y: 0 }, { t: 1, opacity: 1, x: 0.2, y: 0 }])).toBe(false);
  });

  it('builds a piecewise-linear expr scaled + offset to the timeline', () => {
    // clip start 2s, dur 4s → keyframes at t=2 and t=6 of timeline; x scaled by 1000px.
    const e = keyframeExpr(kfs, 'x', 2, 4, 't', 1000);
    expect(e).toContain('lt(t,2)'); // before first → hold
    expect(e).toContain('lt(t,6)'); // segment up to last
    expect(e).toContain('500'); // x=0.5 × 1000
  });
});

describe('engine bakes keyframes (overlay x/y expr + alpha geq)', () => {
  const project: VideoProject = {
    id: 'p', schemaVersion: 2, width: 1080, height: 1920, fps: 30,
    background: { type: 'color', color: '#000000' }, clips: [], overlays: [], audio: [],
    tracks: [
      { id: 'base', kind: 'visual', clips: [{ id: 'bg', type: 'video', src: 'bg.mp4', start: 0, duration: 4, trimIn: 0 }] },
      { id: 'ov', kind: 'visual', clips: [{
        id: 'fg', type: 'image', src: 'fg.png', start: 0, duration: 4,
        rect: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
        keyframes: [{ t: 0, opacity: 1, x: 0.1, y: 0.1 }, { t: 1, opacity: 0, x: 0.6, y: 0.6 }],
      }] },
    ],
  };
  const args = buildFFmpegArgs(project, { outputPath: '/tmp/o.mp4', baseImage: '/tmp/bg.png', hasAudio: () => true });
  const graph = args[args.indexOf('-filter_complex') + 1];

  it('animates overlay position via x/y expressions', () => {
    expect(graph).toContain("overlay='if(lt(t,");
    expect(graph).toContain('648'); // x=0.6 × 1080 at the last keyframe
  });

  it('bakes opacity into the alpha plane via geq', () => {
    expect(graph).toContain("geq=r='r(X,Y)'");
    expect(graph).toContain("a='clip(if(lt(T,");
  });
});

describe('export output: HDR10', () => {
  const project: VideoProject = {
    id: 'p', schemaVersion: 2, width: 1080, height: 1920, fps: 30,
    background: { type: 'color', color: '#000000' }, clips: [], overlays: [], audio: [],
    tracks: [{ id: 'base', kind: 'visual', clips: [{ id: 'v0', type: 'video', src: 'a.mp4', start: 0, duration: 2, trimIn: 0 }] }],
  };
  const hdr = buildFFmpegArgs(project, { outputPath: '/tmp/o.mp4', baseImage: '/tmp/bg.png', hasAudio: () => false, output: { hdr: true, bitrate: 40 } });
  const sdr = buildFFmpegArgs(project, { outputPath: '/tmp/o.mp4', baseImage: '/tmp/bg.png', hasAudio: () => false });

  it('encodes 10-bit HEVC tagged BT.2020 + PQ when hdr', () => {
    expect(hdr).toContain('libx265');
    expect(hdr).toContain('yuv420p10le');
    expect(hdr).toContain('smpte2084');
    expect(hdr).toContain('bt2020');
    expect(hdr.join(' ')).toContain('-b:v 40M');
  });

  it('stays 8-bit H.264 without hdr', () => {
    expect(sdr).toContain('libx264');
    expect(sdr).not.toContain('libx265');
    expect(sdr).toContain('yuv420p');
  });
});

describe('engine applies static opacity', () => {
  const mk = (opacity?: number): VideoProject => ({
    id: 'p', schemaVersion: 2, width: 1080, height: 1920, fps: 30,
    background: { type: 'color', color: '#000000' }, clips: [], overlays: [], audio: [],
    tracks: [{ id: 'base', kind: 'visual', clips: [{ id: 'v0', type: 'video', src: 'a.mp4', start: 0, duration: 4, trimIn: 0, opacity }] }],
  });
  const graph = (p: VideoProject) => {
    const a = buildFFmpegArgs(p, { outputPath: '/tmp/o.mp4', baseImage: '/tmp/bg.png', hasAudio: () => true });
    return a[a.indexOf('-filter_complex') + 1];
  };

  it('multiplies alpha via colorchannelmixer on an rgba clip', () => {
    const g = graph(mk(0.5));
    expect(g).toContain('format=rgba,colorchannelmixer=aa=0.5');
  });

  it('opacity of 1 (or unset) adds no alpha multiply', () => {
    expect(graph(mk(1))).not.toContain('colorchannelmixer');
    expect(graph(mk(undefined))).not.toContain('colorchannelmixer');
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
