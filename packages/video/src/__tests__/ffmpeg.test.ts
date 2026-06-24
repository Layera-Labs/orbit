import { describe, expect, it } from 'vitest';
import { buildFFmpegArgs } from '../ffmpeg';
import { createProject } from '../project';

function args(project: Parameters<typeof buildFFmpegArgs>[0], overlayImages: Record<string, string> = {}) {
  return buildFFmpegArgs(project, { outputPath: 'out.mp4', overlayImages }).join(' ');
}

describe('buildFFmpegArgs', () => {
  it('throws with no clips', () => {
    expect(() => buildFFmpegArgs(createProject({ width: 100, height: 100 }), { outputPath: 'o.mp4' })).toThrow(
      /no clips/,
    );
  });

  it('builds base + caption-overlay + music pipeline', () => {
    const p = createProject({
      width: 1080,
      height: 1920,
      fps: 30,
      clips: [{ id: 'c', type: 'video', src: 'clip.mp4', start: 0, duration: 5, trimIn: 2 }],
      overlays: [{ id: 'o', type: 'text', text: 'hello', start: 1, end: 4, x: 0.5, y: 0.85, fontSize: 64, color: 'white' }],
      audio: [{ id: 'm', src: 'music.mp3', start: 0, volume: 0.8 }],
    });
    const s = args(p, { o: '/tmp/o.png' });
    expect(s).toContain('-i clip.mp4');
    expect(s).toContain('-loop 1 -i /tmp/o.png'); // overlay composited as an image input
    expect(s).toContain('-i music.mp3');
    expect(s).toContain('scale=1080:1920:force_original_aspect_ratio=increase');
    expect(s).toContain('crop=1080:1920');
    expect(s).toContain('trim=start=2:duration=5');
    expect(s).toContain('[1:v]format=rgba');
    expect(s).toContain("overlay=0:0:enable='between(t,1,4)'");
    expect(s).toContain('amix=inputs=2'); // music + base clip audio
    expect(s).toContain('-c:v libx264');
    expect(s).toContain('-pix_fmt yuv420p');
    expect(s).toContain('-movflags +faststart');
    expect(s.trim().endsWith('out.mp4')).toBe(true);
  });

  it('skips overlays that have no rendered image', () => {
    const p = createProject({
      width: 720,
      height: 720,
      clips: [{ id: 'i', type: 'image', src: 'pic.png', start: 0, duration: 3 }],
      overlays: [{ id: 'o', type: 'text', text: 'x', start: 0, end: 2, x: 0.5, y: 0.5, fontSize: 40, color: '#fff' }],
    });
    const s = args(p, {}); // no overlay image supplied
    expect(s).not.toContain('overlay=');
    expect(s).toContain('[0:v]');
    expect(s).toContain('[v]');
  });

  it('loops an image base clip with no audio', () => {
    const p = createProject({
      width: 720,
      height: 720,
      clips: [{ id: 'i', type: 'image', src: 'pic.png', start: 0, duration: 3 }],
    });
    const s = args(p);
    expect(s).toContain('-loop 1 -t 3 -i pic.png');
    expect(s).not.toContain('-c:a aac');
  });

  it('uses a base image for clip-less projects (lyric/quote videos)', () => {
    const p = createProject({
      width: 1080,
      height: 1920,
      overlays: [{ id: 'o', type: 'text', text: 'hi', start: 0, end: 3, x: 0.5, y: 0.5, fontSize: 50, color: '#fff' }],
      audio: [{ id: 'm', src: 'm.mp3', start: 0, duration: 3 }],
    });
    const s = buildFFmpegArgs(p, { outputPath: 'out.mp4', overlayImages: { o: '/tmp/o.png' }, baseImage: '/tmp/bg.png' }).join(' ');
    expect(s).toContain('-loop 1 -t 3 -i /tmp/bg.png');
    expect(s).toContain("overlay=0:0:enable='between(t,0,3)'");
    expect(s).toContain('-i m.mp3');
  });

  it('joins multiple clips with a crossfade transition', () => {
    const p = createProject({
      width: 1080,
      height: 1920,
      fps: 30,
      clips: [
        { id: 'a', type: 'image', src: 'a.png', start: 0, duration: 3 },
        { id: 'b', type: 'image', src: 'b.png', start: 0, duration: 3 },
      ],
      transition: { type: 'fade', duration: 1 },
    });
    const s = args(p);
    expect(s).toContain('-loop 1 -t 3 -i a.png');
    expect(s).toContain('-loop 1 -t 3 -i b.png');
    expect(s).toContain('xfade=transition=fade:duration=1:offset=2'); // accDur(3) - xfade(1)
    expect(s).toContain('-t 5'); // 3 + 3 - 1
  });

  it('hard-concats clips when there is no transition', () => {
    const p = createProject({
      width: 720,
      height: 720,
      clips: [
        { id: 'a', type: 'image', src: 'a.png', start: 0, duration: 2 },
        { id: 'b', type: 'image', src: 'b.png', start: 0, duration: 2 },
      ],
    });
    const s = args(p);
    expect(s).toContain('concat=n=2:v=1:a=0');
    expect(s).not.toContain('xfade');
    expect(s).toContain('-t 4');
  });
});
