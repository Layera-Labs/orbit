import { describe, expect, it, vi } from 'vitest';
import { ElevenLabsProvider } from '../providers/elevenlabs';

/** A fetch that returns fixed MP3 bytes, capturing the request. */
function fakeFetch(bytes: Uint8Array, ok = true, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return {
      ok,
      status,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      text: async () => 'error body',
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('ElevenLabsProvider.tts', () => {
  it('POSTs to the voice endpoint and returns an audio data URI', async () => {
    const bytes = new Uint8Array([0xff, 0xf3, 0x44, 0x00, 0x01, 0x02]);
    const { impl, calls } = fakeFetch(bytes);
    const p = new ElevenLabsProvider({ apiKey: 'k', voiceId: 'voice123', fetchImpl: impl });
    const res = await p.tts({ text: 'hello world' });

    expect(calls[0].url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice123');
    expect((calls[0].init?.headers as Record<string, string>)['xi-api-key']).toBe('k');
    expect(JSON.parse(calls[0].init?.body as string)).toMatchObject({ text: 'hello world', model_id: 'eleven_multilingual_v2' });
    expect(res.url.startsWith('data:audio/mpeg;base64,')).toBe(true);
    expect(res.meta).toMatchObject({ provider: 'elevenlabs', voiceId: 'voice123', bytes: 6 });
  });

  it('lets the request override the voice', async () => {
    const { impl, calls } = fakeFetch(new Uint8Array([1, 2, 3]));
    const p = new ElevenLabsProvider({ apiKey: 'k', voiceId: 'default', fetchImpl: impl });
    await p.tts({ text: 'hi', voice: 'custom-voice' });
    expect(calls[0].url).toBe('https://api.elevenlabs.io/v1/text-to-speech/custom-voice');
  });

  it('throws without an API key', async () => {
    const p = new ElevenLabsProvider({ fetchImpl: vi.fn() as unknown as typeof fetch });
    await expect(p.tts({ text: 'hi' })).rejects.toThrow(/missing API key/);
  });

  it('throws on a non-ok response', async () => {
    const { impl } = fakeFetch(new Uint8Array(), false, 401);
    const p = new ElevenLabsProvider({ apiKey: 'k', fetchImpl: impl });
    await expect(p.tts({ text: 'hi' })).rejects.toThrow(/ElevenLabs 401/);
  });
});
