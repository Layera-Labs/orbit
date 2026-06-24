import { describe, expect, it } from 'vitest';
import { buildFFmpegArgs, escapeDrawText } from '../ffmpeg';
import { createProject } from '../project';

function argString(project: Parameters<typeof buildFFmpegArgs>[0]) {
  return buildFFmpegArgs(project, { outputPath: 'out.mp4', fontFile: '/f.ttf' }).join(' ');
}

describe('escapeDrawText', () => {
  it('escapes ffmpeg drawtext specials', () => {
    expect(escapeDrawText("a:b'c%d")).toBe("a\\:b\\'c\\%d");
  });
});

describe('buildFFmpegArgs', () => {
  it('throws with no clips', () => {
    expect(() => buildFFmpegArgs(createProject({ width: 100, height: 100 }), { outputPath: 'o.mp4' })).toThrow(
      /no clips/,
    );
  });

  it('builds a video base + caption + music pipeline', () => {
    const p = createProject({
      width: 1080,
      height: 1920,
      fps: 30,
      clips: [{ id: 'c', type: 'video', src: 'clip.mp4', start: 0, duration: 5, trimIn: 2 }],
      overlays: [
        { id: 'o', type: 'text', text: 'hello', start: 1, end: 4, x: 0.5, y: 0.85, fontSize: 64, color: 'white', box: { color: 'black', opacity: 0.5 } },
      ],
      audio: [{ id: 'm', src: 'music.mp3', start: 0, volume: 0.8 }],
    });
    const s = argString(p);
    // inputs
    expect(s).toContain('-i clip.mp4');
    expect(s).toContain('-i music.mp3');
    // scale/crop to output res
    expect(s).toContain('scale=1080:1920:force_original_aspect_ratio=increase');
    expect(s).toContain('crop=1080:1920');
    // trim of the base clip
    expect(s).toContain('trim=start=2:duration=5');
    // caption with timing + box
    expect(s).toContain("text='hello'");
    expect(s).toContain("enable='between(t,1,4)'");
    expect(s).toContain('box=1');
    // audio mixed (music + base audio = 2 sources → amix)
    expect(s).toContain('amix=inputs=2');
    // iOS/Android-friendly encode
    expect(s).toContain('-c:v libx264');
    expect(s).toContain('-pix_fmt yuv420p');
    expect(s).toContain('-movflags +faststart');
    expect(s.trim().endsWith('out.mp4')).toBe(true);
  });

  it('loops an image base clip', () => {
    const p = createProject({
      width: 720,
      height: 720,
      clips: [{ id: 'i', type: 'image', src: 'pic.png', start: 0, duration: 3 }],
    });
    const s = argString(p);
    expect(s).toContain('-loop 1 -t 3 -i pic.png');
    // image has no audio → no audio map / aac
    expect(s).not.toContain('-c:a aac');
  });
});
