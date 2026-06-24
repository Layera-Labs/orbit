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
});
