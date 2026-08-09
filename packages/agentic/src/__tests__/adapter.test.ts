import { describe, it, expect, vi, afterEach } from 'vitest';
import { OrbitBackendAdapter } from '../adapter';

/**
 * The adapter's `backendUrl` used to default to `https://api.orbit.ai`, a host
 * nobody runs. These pin the replacement behaviour: the misconfiguration is
 * reported where it happens, and a URL that IS given is used verbatim.
 */
describe('OrbitBackendAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses to construct without a backend URL', () => {
    // The cast is the point: JavaScript callers, and anyone who was relying on
    // the old default, reach this path with no second argument at all.
    expect(() => new (OrbitBackendAdapter as unknown as new (k: string) => unknown)('key')).toThrow(
      /backendUrl is required/,
    );
    expect(() => new OrbitBackendAdapter('key', '   ')).toThrow(/backendUrl is required/);
  });

  it('names no default host in the failure', () => {
    let message = '';
    try {
      new OrbitBackendAdapter('key', '');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toMatch(/api\.orbit\.ai/);
    expect(message).toMatch(/services\/render/);
  });

  it('posts to the URL it was given, with no double slash', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ url: 'x' }) }));
    vi.stubGlobal('fetch', fetchMock);

    // A trailing slash is the commonest way a hand-typed base URL arrives, and
    // `${base}/v1/...` would otherwise produce `//v1/generate`.
    const adapter = new OrbitBackendAdapter('key', 'https://api.example.com/');
    await adapter.generateImage({ prompt: 'a cat' } as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('https://api.example.com/v1/generate');
  });
});
