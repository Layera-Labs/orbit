import { describe, expect, it, vi } from 'vitest';
import { RunwayProvider, nearestRatio } from '../providers/runway';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

describe('RunwayProvider.generateImage', () => {
  it('submits a text_to_image task and polls until SUCCEEDED', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'task_1' })) // POST /v1/text_to_image
      .mockResolvedValueOnce(jsonResponse({ id: 'task_1', status: 'RUNNING' })) // poll 1
      .mockResolvedValueOnce(jsonResponse({ id: 'task_1', status: 'SUCCEEDED', output: ['https://r/out.png'] })); // poll 2
    const p = new RunwayProvider({ token: 't', pollMs: 1, fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await p.generateImage({ prompt: 'a cat' });
    expect(res.url).toBe('https://r/out.png');
    expect(res.meta?.provider).toBe('runway');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe('https://api.dev.runwayml.com/v1/text_to_image');
    expect((init.headers as Record<string, string>)['X-Runway-Version']).toBe('2024-11-06');
    const body = JSON.parse(init.body as string);
    expect(body.promptText).toBe('a cat');
    expect(body.model).toBe('gen4_image');
    expect(body.ratio).toBe('1920:1080');
  });

  it('throws when the task FAILED (so the service never debits)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'task_2' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'task_2', status: 'FAILED', failure: 'content moderation' }));
    const p = new RunwayProvider({ token: 't', pollMs: 1, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(p.generateImage({ prompt: 'x' })).rejects.toThrow(/FAILED/);
  });

  it('throws on an HTTP error from the submit call', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'bad token' }, false, 401));
    const p = new RunwayProvider({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(p.generateImage({ prompt: 'x' })).rejects.toThrow(/401/);
  });

  it('throws without a token', async () => {
    await expect(new RunwayProvider({}).generateImage({ prompt: 'x' })).rejects.toThrow(/token/);
  });

  it('maps the requested size to the nearest supported ratio', async () => {
    const call = async (width: number, height: number) => {
      const fetchImpl = vi.fn(async () => jsonResponse({ id: 'p', status: 'SUCCEEDED', output: ['https://x/o.png'] }));
      await new RunwayProvider({ token: 't', pollMs: 1, fetchImpl: fetchImpl as unknown as typeof fetch }).generateImage({ prompt: 'x', width, height });
      return JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).ratio;
    };
    expect(await call(1080, 1080)).toBe('1024:1024'); // square
    expect(await call(1080, 1920)).toBe('1080:1920'); // 9:16 portrait
    expect(await call(1920, 1080)).toBe('1920:1080'); // 16:9 landscape
  });
});

describe('RunwayProvider.generateVideo', () => {
  it('animates a provided image (single image_to_video task)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'v1' })) // POST /v1/image_to_video
      .mockResolvedValueOnce(jsonResponse({ id: 'v1', status: 'SUCCEEDED', output: ['https://r/vid.mp4'] })); // poll
    const p = new RunwayProvider({ token: 't', pollMs: 1, fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await p.generateVideo({ prompt: 'pan across', image: 'https://r/in.png', width: 1920, height: 1080 });
    expect(res.url).toBe('https://r/vid.mp4');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe('https://api.dev.runwayml.com/v1/image_to_video');
    const body = JSON.parse(init.body as string);
    expect(body.promptImage).toBe('https://r/in.png');
    expect(body.model).toBe('gen4_turbo');
    expect(body.ratio).toBe('1280:720'); // 16:9 → landscape video ratio
  });

  it('generates a source image first when none is provided', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'img' })) // POST /v1/text_to_image
      .mockResolvedValueOnce(jsonResponse({ id: 'img', status: 'SUCCEEDED', output: ['https://r/gen.png'] })) // poll image
      .mockResolvedValueOnce(jsonResponse({ id: 'vid' })) // POST /v1/image_to_video
      .mockResolvedValueOnce(jsonResponse({ id: 'vid', status: 'SUCCEEDED', output: ['https://r/gen.mp4'] })); // poll video
    const p = new RunwayProvider({ token: 't', pollMs: 1, fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await p.generateVideo({ prompt: 'a wave', width: 1080, height: 1920 });
    expect(res.url).toBe('https://r/gen.mp4');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(String((fetchImpl.mock.calls[0] as unknown as [string])[0])).toContain('/text_to_image');
    const videoBody = JSON.parse((fetchImpl.mock.calls[2] as unknown as [string, RequestInit])[1].body as string);
    expect(videoBody.promptImage).toBe('https://r/gen.png'); // the generated image feeds the video
    expect(videoBody.ratio).toBe('720:1280'); // 9:16 → portrait video ratio
  });

  it('also generates a sound effect when audio is requested', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'vid' })) // POST /v1/image_to_video
      .mockResolvedValueOnce(jsonResponse({ id: 'vid', status: 'SUCCEEDED', output: ['https://r/v.mp4'] })) // poll video
      .mockResolvedValueOnce(jsonResponse({ id: 'sfx' })) // POST /v1/sound_effect
      .mockResolvedValueOnce(jsonResponse({ id: 'sfx', status: 'SUCCEEDED', output: ['https://r/s.mp3'] })); // poll sfx
    const p = new RunwayProvider({ token: 't', pollMs: 1, fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await p.generateVideo({ prompt: 'rain on a window', image: 'https://r/in.png', audio: true });
    expect(res.url).toBe('https://r/v.mp4');
    expect(res.meta?.audioUrl).toBe('https://r/s.mp3');
    expect(String((fetchImpl.mock.calls[2] as unknown as [string])[0])).toContain('/sound_effect');
    const sfxBody = JSON.parse((fetchImpl.mock.calls[2] as unknown as [string, RequestInit])[1].body as string);
    expect(sfxBody.promptText).toBe('rain on a window');
    expect(sfxBody.model).toBe('eleven_text_to_sound_v2');
  });

  it('skips the sound effect when audio is not requested', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'vid' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'vid', status: 'SUCCEEDED', output: ['https://r/v.mp4'] }));
    const p = new RunwayProvider({ token: 't', pollMs: 1, fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await p.generateVideo({ prompt: 'x', image: 'https://r/in.png' });
    expect(res.meta?.audioUrl).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2); // no sound_effect call
  });
});

describe('nearestRatio', () => {
  it('picks the closest aspect and falls back on bad input', () => {
    expect(nearestRatio(1000, 1000)).toBe('1024:1024');
    expect(nearestRatio(900, 1600)).toBe('1080:1920');
    expect(nearestRatio(0, 0)).toBe('1920:1080'); // first ratio as fallback
  });
});
