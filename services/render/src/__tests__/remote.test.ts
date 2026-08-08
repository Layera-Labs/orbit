// @vitest-environment node
//
// The SSRF fix.
//
// This was not a theoretical finding. Before it, one unauthenticated POST to
// /v1/render naming `http://127.0.0.1:<port>/…` made the service fetch that
// URL and hand the response back to the caller encoded as an MP4 — verified
// against a local server that logged the hit. On a cloud box the same request
// reads the instance metadata endpoint.
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RemoteSrcError, fetchRemoteTo, isBlockedAddress } from '../remote.js';

const dest = async () => join(await mkdtemp(join(tmpdir(), 'orbit-remote-')), 'f.bin');

/** A fetch that never touches the network, so these are fast and offline. */
const stub =
  (
    routes: Record<
      string,
      { status?: number; body?: string; headers?: Record<string, string> }
    >,
  ): typeof fetch =>
  async (input) => {
    const url = String(input);
    const r = routes[url];
    if (!r) throw new Error(`unexpected fetch: ${url}`);
    return new Response(r.status && r.status >= 300 && r.status < 400 ? null : (r.body ?? 'ok'), {
      status: r.status ?? 200,
      headers: r.headers,
    });
  };

describe('isBlockedAddress', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['0.0.0.0', 'unspecified'],
    ['10.1.2.3', 'RFC1918'],
    ['172.16.0.1', 'RFC1918'],
    ['172.31.255.255', 'RFC1918'],
    ['192.168.1.1', 'RFC1918'],
    ['169.254.169.254', 'cloud metadata'],
    ['100.64.0.1', 'CGNAT'],
    ['224.0.0.1', 'multicast'],
    ['::1', 'v6 loopback'],
    ['fe80::1', 'v6 link-local'],
    ['fc00::1', 'v6 unique-local'],
    ['ff02::1', 'v6 multicast'],
    // Loopback wearing a v6 hat. Checking the string form alone misses it.
    ['::ffff:127.0.0.1', 'v4-mapped loopback'],
  ])('blocks %s (%s)', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([['8.8.8.8'], ['1.1.1.1'], ['172.32.0.1'], ['2606:4700::1111']])(
    'allows the public address %s',
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    },
  );

  /* 172.15 and 172.32 sit either side of the private block. Getting the bounds
     wrong in the safe direction blocks real CDNs; the other way is a hole. */
  it('gets the edges of 172.16/12 right', () => {
    expect(isBlockedAddress('172.15.255.255')).toBe(false);
    expect(isBlockedAddress('172.16.0.0')).toBe(true);
    expect(isBlockedAddress('172.31.255.255')).toBe(true);
    expect(isBlockedAddress('172.32.0.0')).toBe(false);
  });

  it('refuses anything that is not an address at all', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
    expect(isBlockedAddress('')).toBe(true);
  });
});

describe('fetchRemoteTo', () => {
  it('refuses a literal loopback url', async () => {
    await expect(
      fetchRemoteTo('http://127.0.0.1:9912/internal', await dest(), { maxBytes: 1000 }),
    ).rejects.toThrow(RemoteSrcError);
  });

  it('refuses the cloud metadata address', async () => {
    await expect(
      fetchRemoteTo('http://169.254.169.254/latest/meta-data/', await dest(), {
        maxBytes: 1000,
      }),
    ).rejects.toThrow(/private address/);
  });

  it('refuses a non-http protocol', async () => {
    await expect(
      fetchRemoteTo('file:///etc/passwd', await dest(), { maxBytes: 1000 }),
    ).rejects.toThrow(/only http/);
  });

  /* `http://user:pass@host/` would hand credentials to whatever it resolves to,
     and is a classic way to make a url look like it points somewhere else. */
  it('refuses credentials embedded in the url', async () => {
    await expect(
      fetchRemoteTo('http://user:pw@example.com/a.png', await dest(), { maxBytes: 1000 }),
    ).rejects.toThrow(/credentials/);
  });

  /*
   * THE one that matters most. A public url that 302s to the metadata service
   * is how this class of bug survives a naive fix: checking only the url as
   * typed, then letting fetch follow redirects, blocks nothing.
   */
  it('refuses a public url that redirects into private space', async () => {
    const path = await dest();
    await expect(
      fetchRemoteTo('https://example.com/a.png', path, {
        maxBytes: 1000,
        fetchImpl: stub({
          'https://example.com/a.png': {
            status: 302,
            headers: { location: 'http://169.254.169.254/latest/meta-data/' },
          },
        }),
      }),
    ).rejects.toThrow(/private address/);
  });

  it('stops a redirect loop rather than following it forever', async () => {
    await expect(
      fetchRemoteTo('https://example.com/1', await dest(), {
        maxBytes: 1000,
        maxRedirects: 2,
        fetchImpl: stub({
          'https://example.com/1': { status: 302, headers: { location: '/2' } },
          'https://example.com/2': { status: 302, headers: { location: '/1' } },
        }),
      }),
    ).rejects.toThrow(/too many redirects/);
  });

  it('downloads a public url to disk', async () => {
    const path = await dest();
    await fetchRemoteTo('https://example.com/a.png', path, {
      maxBytes: 1000,
      fetchImpl: stub({ 'https://example.com/a.png': { body: 'PNGDATA' } }),
    });
    expect(await readFile(path, 'utf8')).toBe('PNGDATA');
  });

  /* A declared length is a hint, not a promise — the byte count is what stops
     a client pointing the box at an endless stream. */
  it('refuses a body that outgrows the cap even with no content-length', async () => {
    await expect(
      fetchRemoteTo('https://example.com/big', await dest(), {
        maxBytes: 4,
        fetchImpl: stub({ 'https://example.com/big': { body: 'far too much data' } }),
      }),
    ).rejects.toThrow(/larger than/);
  });

  it('refuses early on a content-length over the cap', async () => {
    await expect(
      fetchRemoteTo('https://example.com/big', await dest(), {
        maxBytes: 4,
        fetchImpl: stub({
          'https://example.com/big': { body: 'x', headers: { 'content-length': '999999' } },
        }),
      }),
    ).rejects.toThrow(/larger than/);
  });
});
