import { describe, expect, it } from 'vitest';
import { buildProjectFromSpec, generateVideoSpec, type Brain, type VideoSpec } from '../agent';
import { textOverlaysOf } from '@orbit/video';

/** A fake brain that returns a fixed spec — no LLM / key needed. */
const fakeBrain = (spec: VideoSpec): Brain => ({ plan: async () => spec });

describe('generateVideoSpec', () => {
  it('delegates to the brain (no key needed)', async () => {
    const spec = await generateVideoSpec(
      'a sad shayari about the moon',
      fakeBrain({ template: 'lyric_video', input: { lines: ['raat', 'chand', 'tanhai'] } }),
    );
    expect(spec.template).toBe('lyric_video');
    expect(spec.input.lines).toEqual(['raat', 'chand', 'tanhai']);
  });
});

describe('buildProjectFromSpec', () => {
  it('builds a clip-less lyric video from a spec + music', () => {
    const project = buildProjectFromSpec(
      { template: 'lyric_video', input: { lines: ['a', 'b'], backgroundFrom: '#000', backgroundTo: '#fff' } },
      { music: 'm.mp3' },
    );
    expect(project.clips).toHaveLength(0);
    expect(project.overlays).toHaveLength(2);
    expect(project.background).toEqual({ type: 'gradient', from: '#000', to: '#fff' });
    expect(project.audio[0].src).toBe('m.mp3');
  });

  it('builds a quote card with no media', () => {
    const project = buildProjectFromSpec({ template: 'quote_card', input: { quote: 'Be water', author: 'Bruce Lee' } });
    // Narrowed, not cast: `Overlay` is a union, and a template that started
    // emitting something other than a caption should fail here.
    const captions = textOverlaysOf(project.overlays);
    expect(captions).toHaveLength(2);
    expect(captions[0].text).toContain('Be water');
    expect(captions[1].text).toContain('Bruce Lee');
  });

  it('renders a lyric video silently when no music is supplied', () => {
    const p = buildProjectFromSpec({ template: 'lyric_video', input: { lines: ['a', 'b'] } }, {});
    expect(p.clips).toHaveLength(0);
    expect(p.overlays).toHaveLength(2);
    expect(p.audio).toHaveLength(0);
  });

  it('validates required fields and media', () => {
    expect(() => buildProjectFromSpec({ template: 'lyric_video', input: {} }, { music: 'm.mp3' })).toThrow(/lines/);
    expect(() => buildProjectFromSpec({ template: 'caption_reel', input: { captions: ['x'] } }, {})).toThrow(/clip/);
  });
});
