import { describe, expect, it, vi } from 'vitest';
import { RunwayProvider } from '../providers/runway';

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
});
