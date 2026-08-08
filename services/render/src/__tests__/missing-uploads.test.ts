// @vitest-environment node
//
// A project that references media this server no longer holds.
//
// The media dir is a CACHE with a byte budget, so an `upload:` token is not a
// promise: eviction, a redeploy onto a fresh volume, or pointing the app at a
// different server all leave a client holding tokens that name nothing. Left
// to ffmpeg that surfaces as "No such file or directory" out of a half-built
// filtergraph, AFTER a render slot has been taken — and a client cannot act on
// it, so it retries the same dead tokens forever. That happened on the first
// real deployment.
//
// Over real HTTP, because the contract being tested is the wire response: the
// status, the code, and the list the client re-uploads from.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { bearer, guestToken } from './guest.js';

/** Stubbed so a passing test can never depend on ffmpeg existing. */
vi.mock('@orbit/video/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/video/node')>();
  return { ...actual, renderProject: async () => {} };
});

let server: Server;
let base: string;
let auth: Record<string, string>;

beforeAll(async () => {
  const { createServer } = await import('../server.js');
  server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  auth = bearer(await guestToken(base));
});

afterAll(() => {
  server.close();
});

const projectWith = (srcs: string[]) => ({
  id: 'p',
  schemaVersion: 2,
  width: 64,
  height: 64,
  fps: 30,
  background: { type: 'color', color: '#000' },
  clips: [],
  overlays: [],
  audio: [],
  tracks: [
    {
      id: 't',
      kind: 'visual',
      clips: srcs.map((src, i) => ({
        id: `c${i}`,
        src,
        start: i,
        duration: 1,
        trimIn: 0,
      })),
    },
  ],
});

const post = (project: unknown, extra: Record<string, unknown> = {}) =>
  fetch(`${base}/v1/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ project, ...extra }),
  });

/** Upload a real file so at least one token in a project is genuinely valid. */
async function uploadOne(): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array([1, 2, 3])]), 'a.png');
  const res = await fetch(`${base}/v1/upload`, { method: 'POST', headers: auth, body: form });
  const body = (await res.json()) as { id: string };
  return body.id;
}

describe('a render referencing media the server does not have', () => {
  it('is refused with 409 and a machine-readable code', async () => {
    const res = await post(projectWith(['upload:u_999_1.png']));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string; missing?: string[] };
    expect(body.code).toBe('missing_uploads');
  });

  it('names exactly which tokens are gone, so the client re-uploads only those', async () => {
    const good = await uploadOne();
    const res = await post(projectWith([good, 'upload:u_gone_1.png']));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { missing: string[] };
    expect(body.missing).toEqual(['upload:u_gone_1.png']);
    // The one the server DOES hold must not be in the list — re-uploading it
    // would be wasted bandwidth on every recovery.
    expect(body.missing).not.toContain(good);
  });

  it('refuses BEFORE starting work, on the async path too', async () => {
    // The whole point is that no render slot is taken and nothing is charged.
    // A 202 here would mean the failure surfaces later, as ffmpeg's stderr.
    const res = await post(projectWith(['upload:u_gone_2.png']), { async: true });
    expect(res.status).toBe(409);
  });

  it('lets a project through once its media is really there', async () => {
    const good = await uploadOne();
    const res = await post(projectWith([good]));
    expect(res.status).toBe(200);
  });

  it('leaves http(s) srcs alone — they are not this server to hold', async () => {
    /*
     * Asserted through the `missing` LIST rather than by rendering a remote
     * src, which would make the suite depend on reaching the internet and cost
     * seconds per run. Pairing the URL with a token that is genuinely gone
     * gets the 409 back without a fetch, and the list is the proof: the http
     * src is not in it, so this check never treats one as media to hold.
     */
    const res = await post(
      projectWith(['https://example.com/a.png', 'upload:u_gone_3.png']),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { missing: string[] };
    expect(body.missing).toEqual(['upload:u_gone_3.png']);
  });
});
