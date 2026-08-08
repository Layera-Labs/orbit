// @vitest-environment node
//
// The fetched-asset cache. Real files in a real temp directory; only the
// network is faked, because that is the one part a test must not do.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { MediaDirAssetStore, extensionFor } from '../asset-store';
import { makeResolveSrc } from '../resolve';

const reply = (body: string, type = 'image/jpeg', headers: Record<string, string> = {}) =>
  new Response(Buffer.from(body), { status: 200, headers: { 'content-type': type, ...headers } });

describe('MediaDirAssetStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'orbit-assets-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const storeWith = (fetchImpl: typeof fetch, maxBytes?: number) =>
    new MediaDirAssetStore({ mediaDir: dir, fetchImpl, maxBytes });

  it('downloads once and names the file by its content hash', async () => {
    const store = storeWith(vi.fn(async () => reply('pixels')) as unknown as typeof fetch);
    const token = await store.fetch('https://cdn/a.jpg');

    const hash = createHash('sha256').update(Buffer.from('pixels')).digest('hex');
    expect(token).toBe(`upload:${hash}.jpg`);
    expect(await readFile(join(dir, `${hash}.jpg`), 'utf8')).toBe('pixels');
  });

  /* The whole point of hashing: one file, however many urls served it. */
  it('stores identical bytes from two different urls once', async () => {
    const store = storeWith(vi.fn(async () => reply('same')) as unknown as typeof fetch);
    const a = await store.fetch('https://cdn/one.jpg');
    const b = await store.fetch('https://cdn/two.jpg');

    expect(a).toBe(b);
    expect(await readdir(dir)).toHaveLength(1);
  });

  it('does not re-download a url it has already fetched', async () => {
    const net = vi.fn(async () => reply('pixels'));
    const store = storeWith(net as unknown as typeof fetch);
    await store.fetch('https://cdn/a.jpg');
    await store.fetch('https://cdn/a.jpg');
    expect(net).toHaveBeenCalledTimes(1);
  });

  /*
   * The token has to survive the security boundary every other media reference
   * goes through, or the render fails at the last step with an invalid
   * reference — which is exactly the sort of thing that only shows up on a real
   * export.
   */
  it('produces a token the render path resolves inside the media dir', async () => {
    const store = storeWith(vi.fn(async () => reply('pixels')) as unknown as typeof fetch);
    const token = await store.fetch('https://cdn/a.jpg');
    const resolved = makeResolveSrc(dir)(token);
    expect(resolved.startsWith(dir)).toBe(true);
    expect(await readFile(resolved, 'utf8')).toBe('pixels');
  });

  it('leaves no partial files behind', async () => {
    const store = storeWith(vi.fn(async () => reply('pixels')) as unknown as typeof fetch);
    await store.fetch('https://cdn/a.jpg');
    expect((await readdir(dir)).some((f) => f.endsWith('.part'))).toBe(false);
  });

  /*
   * Two urls, identical bytes, at once. The temp name derives from the CONTENT
   * hash, so before this had a counter in it both writes went to the same path
   * in the same process and interleaved — and identical bytes is not an edge
   * case here, it is the case this class exists to collapse.
   */
  it('survives concurrent fetches of identical content', async () => {
    const body = 'x'.repeat(200_000);
    const store = storeWith(vi.fn(async () => reply(body)) as unknown as typeof fetch);
    const [a, b] = await Promise.all([
      store.fetch('https://cdn/one.jpg'),
      store.fetch('https://cdn/two.jpg'),
    ]);

    expect(a).toBe(b);
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(await readFile(join(dir, files[0]), 'utf8')).toBe(body);
  });

  describe('refusals', () => {
    /*
     * A server-side fetch of an address we did not choose. The provider is
     * configurable, so a `file://` in a compromised response must not become an
     * arbitrary read.
     */
    it('refuses a non-http url', async () => {
      const net = vi.fn(async () => reply('x'));
      const store = storeWith(net as unknown as typeof fetch);
      await expect(store.fetch('file:///etc/passwd')).rejects.toThrow(/non-http/);
      expect(net).not.toHaveBeenCalled();
    });

    it('refuses something that is not a url at all', async () => {
      const store = storeWith(vi.fn(async () => reply('x')) as unknown as typeof fetch);
      await expect(store.fetch('not a url')).rejects.toThrow(/not a url/);
    });

    it('reports a failed fetch with its status', async () => {
      const store = storeWith(
        vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch,
      );
      await expect(store.fetch('https://cdn/gone.jpg')).rejects.toThrow(/404/);
    });

    /* Believed when present, so a gigabyte is not downloaded to be rejected. */
    it('refuses an oversized asset on its declared length, without reading it', async () => {
      const net = vi.fn(async () =>
        reply('small', 'video/mp4', { 'content-length': '999999999' }),
      );
      const store = storeWith(net as unknown as typeof fetch, 1024);
      await expect(store.fetch('https://cdn/huge.mp4')).rejects.toThrow(/over the 1024 limit/);
    });

    /* And checked again after, because content-length is a claim. */
    it('refuses an asset that lied about its length', async () => {
      const store = storeWith(
        vi.fn(async () => reply('x'.repeat(5000))) as unknown as typeof fetch,
        1024,
      );
      await expect(store.fetch('https://cdn/liar.jpg')).rejects.toThrow(/over the 1024 limit/);
      expect(await readdir(dir)).toHaveLength(0);
    });
  });
});

describe('extensionFor', () => {
  it('prefers the content type', () => {
    expect(extensionFor('video/mp4', '/whatever')).toBe('.mp4');
    expect(extensionFor('image/jpeg; charset=binary', '/x.png')).toBe('.jpg');
  });

  /* A CDN url often ends in an opaque id or a query rather than a suffix. */
  it('falls back to the url when the type is unhelpful', () => {
    expect(extensionFor('application/octet-stream', '/files/clip.mp4')).toBe('.mp4');
    expect(extensionFor(null, '/photo.JPG')).toBe('.jpg');
  });

  /* A wrong extension is worse than none; ffmpeg probes content regardless. */
  it('gives up rather than guessing', () => {
    expect(extensionFor('application/octet-stream', '/opaque/9f3a2b')).toBe('.bin');
    expect(extensionFor(null, '/thing.exe')).toBe('.bin');
  });
});
