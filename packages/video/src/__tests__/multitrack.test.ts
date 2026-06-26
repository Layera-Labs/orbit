import { describe, expect, it } from 'vitest';
import { buildFFmpegArgs } from '../ffmpeg';
import { projectDuration } from '../project';
import type { VideoProject } from '../types';

function multiTrackProject(): VideoProject {
  return {
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
          { id: 'v0', type: 'video', src: 'base.mp4', start: 0, duration: 6, trimIn: 0 },
          { id: 'v1', type: 'video', src: 'tail.mp4', start: 6, duration: 4, trimIn: 1 },
        ],
      },
      {
        id: 'overlay',
        kind: 'visual',
        clips: [
          // a picture-in-picture image from t=2 to t=5, top-right quarter
          { id: 'img', type: 'image', src: 'logo.png', start: 2, duration: 3, rect: { x: 0.55, y: 0.05, w: 0.4, h: 0.25 } },
        ],
      },
      {
        id: 'music',
        kind: 'audio',
        clips: [{ id: 'a0', src: 'music.mp3', start: 1, duration: 8, volume: 0.8 }],
      },
    ],
  };
}

describe('multi-track ffmpeg builder', () => {
  const project = multiTrackProject();
  const args = buildFFmpegArgs(project, {
    outputPath: '/tmp/out.mp4',
    baseImage: '/tmp/bg.png',
    hasAudio: () => true,
  });
  const graph = args[args.indexOf('-filter_complex') + 1];

  it('computes duration from absolute clip ends', () => {
    expect(projectDuration(project)).toBe(10); // base ends at 10
  });

  it('uses the background base image as a looped input', () => {
    expect(args).toContain('/tmp/bg.png');
    expect(graph).toContain('[0:v]scale=1080:1920');
  });

  it('time-shifts clips to their absolute start and gates with enable', () => {
    expect(graph).toContain('setpts=PTS-STARTPTS+6/TB'); // second base clip starts at 6
    expect(graph).toContain("enable='between(t,2,5)'"); // overlay image window
  });

  it('positions the PiP image at its rect (top-right quarter)', () => {
    // rect x=0.55*1080=594, y=0.05*1920=96 ; size 0.4*1080=432 x 0.25*1920=480
    expect(graph).toContain('overlay=594:96');
    expect(graph).toContain('scale=432:480');
  });

  it('delays positioned audio and mixes clip audio with the music track', () => {
    expect(graph).toContain('adelay=1000:all=1'); // music starts at 1s
    expect(graph).toContain('amix=inputs=');
  });

  it('skips audio for a source reported to have none', () => {
    const noAudio = buildFFmpegArgs(project, {
      outputPath: '/tmp/out.mp4',
      baseImage: '/tmp/bg.png',
      hasAudio: () => false,
    });
    const g = noAudio[noAudio.indexOf('-filter_complex') + 1];
    expect(g).not.toContain('amix');
    expect(g).not.toContain('adelay');
  });
});
