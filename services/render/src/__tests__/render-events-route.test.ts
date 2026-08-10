// @vitest-environment node
//
// The two routes on the wire.
//
// A unit test of the ticket proves the signature; only a real request proves
// that the stream is reachable without an `Authorization` header — which is the
// entire reason the ticket exists, since `EventSource` cannot send one.
// `renderProject` is stubbed so ffmpeg is never involved.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { bearer, guestToken } from './guest.js';

const ENCODE_MS = 150;

vi.mock('@layera-labs/orbit-video/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@layera-labs/orbit-video/node')>();
  return {
    ...actual,
    renderProject: async () => {
      await new Promise((r) => setTimeout(r, ENCODE_MS));
    },
  };
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

afterAll(() => server.close());

const project = {
  id: 'p',
  width: 64,
  height: 64,
  fps: 30,
  background: { type: 'color', color: '#000' },
  clips: [],
  overlays: [],
  audio: [],
};

async function startJob(headers = auth): Promise<string> {
  const res = await fetch(`${base}/v1/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ project, async: true }),
  });
  expect(res.status).toBe(202);
  return (await res.json()).id;
}

/** Read the stream until it ends, or until `stop` says enough. */
async function drain(url: string, stop?: (body: string) => boolean): Promise<string> {
  const res = await fetch(url);
  expect(res.status).toBe(200);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let body = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    body += dec.decode(value, { stream: true });
    if (stop?.(body)) {
      await reader.cancel();
      break;
    }
  }
  return body;
}

const events = (body: string): Record<string, unknown>[] =>
  body
    .split('\n\n')
    .filter((b) => b.startsWith('data: '))
    .map((b) => JSON.parse(b.slice(6)));

describe('GET /v1/render/:id/ticket', () => {
  it('needs the real credentials', async () => {
    const id = await startJob();
    const res = await fetch(`${base}/v1/render/${id}/ticket`);
    expect(res.status).toBe(401);
  });

  it('hands back a url the client can hand straight to EventSource', async () => {
    const id = await startJob();
    const res = await fetch(`${base}/v1/render/${id}/ticket`, { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eventsUrl).toContain(`/v1/render/${id}/events?ticket=`);
    expect(body.expiresInMs).toBeGreaterThan(0);
  });

  /* Same rule and same answer as the status route: not yours is not found. */
  it('does not mint a ticket for somebody else’s job', async () => {
    const id = await startJob();
    const other = bearer(await guestToken(base));
    const res = await fetch(`${base}/v1/render/${id}/ticket`, { headers: other });
    expect(res.status).toBe(404);
  });

  it('is 404 for a job that does not exist', async () => {
    const res = await fetch(`${base}/v1/render/nope/ticket`, { headers: auth });
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/render/:id/events', () => {
  const ticketFor = async (id: string, headers = auth) =>
    (await (await fetch(`${base}/v1/render/${id}/ticket`, { headers })).json()).eventsUrl;

  /*
   * The whole point. No Authorization header anywhere in this request, because
   * `EventSource` cannot send one.
   */
  it('streams to a request carrying no credentials but the ticket', async () => {
    const id = await startJob();
    const body = await drain(base + (await ticketFor(id)));
    const seen = events(body);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].jobId).toBe(id);
  });

  /*
   * The mismatch this whole change is about: the server calls it `running` and
   * the client waits for `processing`, and it says `error` where the client
   * waits for `failed`. A stream that ends is the proof they now agree.
   */
  it('ends the stream on a terminal status the client recognises', async () => {
    const id = await startJob();
    const body = await drain(base + (await ticketFor(id)));
    const seen = events(body);
    const last = seen[seen.length - 1];
    // The stream CLOSED, which only happens on a status `isTerminal` accepts.
    expect(['done', 'failed']).toContain(last.status);
    expect(last.progress).toBe(1);
  });

  it('reports the statuses on the way, in the client’s vocabulary', async () => {
    const id = await startJob();
    const body = await drain(base + (await ticketFor(id)));
    for (const e of events(body))
      expect(['queued', 'processing', 'done', 'failed']).toContain(e.status);
    // Never the server's own words.
    expect(body).not.toContain('"status":"running"');
    expect(body).not.toContain('"status":"error"');
  });

  describe('refusals', () => {
    it('refuses a request with no ticket', async () => {
      const id = await startJob();
      const res = await fetch(`${base}/v1/render/${id}/events`);
      expect(res.status).toBe(401);
      expect((await res.json()).kind).toBe('invalid');
    });

    it('refuses a forged ticket', async () => {
      const id = await startJob();
      const res = await fetch(
        `${base}/v1/render/${id}/events?ticket=${Date.now() + 60000}.forged`,
      );
      expect(res.status).toBe(401);
    });

    /*
     * A ticket names one job. Moving it to another is the thing that would make
     * it as dangerous as the session token it replaces.
     */
    it('refuses a ticket minted for a different job', async () => {
      const a = await startJob();
      const b = await startJob();
      const url = new URL(base + (await ticketFor(a)));
      const stolen = url.searchParams.get('ticket')!;
      const res = await fetch(
        `${base}/v1/render/${b}/events?ticket=${encodeURIComponent(stolen)}`,
      );
      expect(res.status).toBe(401);
    });

    it('is 404 for a job that does not exist', async () => {
      const res = await fetch(`${base}/v1/render/nope/events?ticket=x`);
      expect(res.status).toBe(404);
    });
  });
});
