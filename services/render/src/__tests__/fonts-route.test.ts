// @vitest-environment node
//
// `GET /v1/fonts/:family` — the bytes the web preview embeds.
//
// Tested over real HTTP rather than against `resolveFonts` directly, because
// the interesting claims are about the ROUTE: that a family name off a URL path
// cannot become a filesystem path, that an unauthenticated caller gets nothing,
// and that a family the box cannot resolve is reported rather than answered
// with something wrong. A unit test of the resolver would pass while the route
// in front of it leaked.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bearer, guestToken } from './guest.js';

vi.mock('@orbit/video/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/video/node')>();
  return { ...actual, renderProject: async () => {} };
});

const here = dirname(fileURLToPath(import.meta.url));
/** The committed fixture face, reused so this test needs no network. */
const FONT_DIR = join(here, '../../../../packages/video/src/__tests__/fixtures/fonts');

let server: Server;
let base: string;
let auth: Record<string, string>;

beforeAll(async () => {
  process.env.ORBIT_FONT_DIR = FONT_DIR;
  // The resolver must be answerable from disk alone here; a test that could
  // reach Google would pass or fail on somebody else's uptime.
  process.env.ORBIT_FONT_NETWORK = '0';
  const { createServer } = await import('../server.js');
  server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  auth = bearer(await guestToken(base));
});

afterAll(async () => {
  delete process.env.ORBIT_FONT_DIR;
  delete process.env.ORBIT_FONT_NETWORK;
  await new Promise((r) => server.close(r));
});

describe('GET /v1/fonts/:family', () => {
  it('serves a family it can resolve on disk', async () => {
    const res = await fetch(`${base}/v1/fonts/Noto%20Sans`, { headers: auth });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('font/ttf');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(1000);
    // sfnt version 0x00010000 — proof it served a font and not an error page.
    expect(new DataView(bytes.buffer).getUint32(0)).toBe(0x00010000);
  });

  it('lets the client cache it forever', async () => {
    // A family's bytes do not change under it, and the preview re-requests on
    // every editor mount; without this the font is refetched constantly.
    const res = await fetch(`${base}/v1/fonts/Noto%20Sans`, { headers: auth });
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('refuses a family name that is really a path', async () => {
    // The reason `isSafeFontFamily` exists. Express normalises some of these
    // before routing, so any of 400/404 is an acceptable refusal — what must
    // never happen is a 200 carrying a file.
    for (const family of ['../../../etc/passwd', '..%2F..%2F..%2Fetc%2Fpasswd', 'Inter%2F..%2F..%2Fetc%2Fhosts']) {
      const res = await fetch(`${base}/v1/fonts/${family}`, { headers: auth });
      expect(res.status, family).not.toBe(200);
    }
  });

  it('names the problem when the family is malformed', async () => {
    const res = await fetch(`${base}/v1/fonts/${encodeURIComponent('bad/family')}`, { headers: auth });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('bad_family');
  });

  it('404s a family this box cannot resolve, rather than substituting', async () => {
    // The export refuses to quietly swap a face; so does this.
    const res = await fetch(`${base}/v1/fonts/Definitely%20Not%20Installed`, { headers: auth });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('font_unavailable');
  });

  it('requires a token, like every other route', async () => {
    const res = await fetch(`${base}/v1/fonts/Noto%20Sans`);
    expect(res.status).toBe(401);
  });
});
