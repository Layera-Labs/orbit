import { describe, expect, it } from 'vitest';
import { buildProjectFromSpec, generateVideoSpec } from '../agent';

/** Fake Anthropic client that returns a single forced tool call. */
function toolClient(name: string, input: unknown) {
  return { messages: { create: async () => ({ content: [{ type: 'tool_use', name, input }] }) } };
}

describe('generateVideoSpec', () => {
  it('returns the template + filled input from the tool call (no API key)', async () => {
    const spec = await generateVideoSpec('a sad shayari about the moon', {
      client: toolClient('lyric_video', { lines: ['raat', 'chand', 'tanhai'] }),
    });
    expect(spec.template).toBe('lyric_video');
    expect(spec.input.lines).toEqual(['raat', 'chand', 'tanhai']);
  });

  it('throws when the model returns no tool call', async () => {
    const client = { messages: { create: async () => ({ content: [{ type: 'text', text: 'hi' }] }) } };
    await expect(generateVideoSpec('x', { client })).rejects.toThrow(/template/);
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
    expect(project.overlays[0].text).toContain('Be water');
    expect(project.overlays[1].text).toContain('Bruce Lee');
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
