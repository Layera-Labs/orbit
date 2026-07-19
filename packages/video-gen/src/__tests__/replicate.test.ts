import { describe, expect, it, vi } from 'vitest';
import { ReplicateProvider } from '../providers/replicate';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

describe('ReplicateProvider.generateImage', () => {
  it('returns the first output URL when Prefer: wait settles succeeded', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ id: 'p1', status: 'succeeded', output: ['https://x/img.png'] }),
    );
    const p = new ReplicateProvider({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await p.generateImage({ prompt: 'a cat' });
    expect(res.url).toBe('https://x/img.png');
    expect(res.meta?.provider).toBe('replicate');
    // one POST, no polling
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('/models/black-forest-labs/flux-schnell/predictions');
    expect(JSON.parse(init.body as string).input.prompt).toBe('a cat');
  });

  it('accepts a bare string output', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'p', status: 'succeeded', output: 'https://x/y.png' }));
    const p = new ReplicateProvider({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect((await p.generateImage({ prompt: 'x' })).url).toBe('https://x/y.png');
  });

  it('polls the get URL until terminal', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'p', status: 'processing', urls: { get: 'https://x/p' } }))
      .mockResolvedValueOnce(jsonResponse({ id: 'p', status: 'succeeded', output: ['https://x/done.png'] }));
    const p = new ReplicateProvider({ token: 't', pollMs: 1, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect((await p.generateImage({ prompt: 'x' })).url).toBe('https://x/done.png');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws on a failed generation (so the service never debits)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'p', status: 'failed', error: 'nsfw' }));
    const p = new ReplicateProvider({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(p.generateImage({ prompt: 'x' })).rejects.toThrow(/failed/);
  });

  it('throws on an HTTP error', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ detail: 'bad token' }, false, 401));
    const p = new ReplicateProvider({ token: 't', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(p.generateImage({ prompt: 'x' })).rejects.toThrow(/401/);
  });

  it('throws without a token', async () => {
    const p = new ReplicateProvider({});
    await expect(p.generateImage({ prompt: 'x' })).rejects.toThrow(/token/);
  });
});
