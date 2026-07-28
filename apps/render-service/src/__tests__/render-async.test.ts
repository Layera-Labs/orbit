// @vitest-environment node
//
// The asynchronous render path.
//
// Over real HTTP, because the point of the feature is what happens on the WIRE:
// that the reply arrives before the encode finishes, and that the id it hands
// back can be redeemed for the result later. A unit test of the registry would
// prove neither. `renderProject` is stubbed with a delay so ffmpeg is never
// involved.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const ENCODE_MS = 200;

vi.mock('@orbit/video', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/video')>();
  return {
    ...actual,
    renderProject: async () => {
      await new Promise((r) => setTimeout(r, ENCODE_MS));
    },
  };
});

let server: Server;
let base: string;

beforeAll(async () => {
  const { createServer } = await import('../server.js');
  server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

const project = {
  id: 'p',
  schemaVersion: 2,
  width: 64,
  height: 64,
  fps: 30,
  background: { type: 'color', color: '#000' },
  clips: [],
  overlays: [],
  audio: [],
};

const post = (body: Record<string, unknown>) =>
  fetch(`${base}/v1/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project, ...body }),
  });

async function poll(id: string, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${base}/v1/render/${id}`);
    const body = (await res.json()) as { status: string; url?: string; error?: string };
    if (body.status === 'done' || body.status === 'error') return body;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('job never settled');
}

describe('POST /v1/render { async: true }', () => {
  it('replies 202 with an id BEFORE the encode finishes', async () => {
    const started = Date.now();
    const res = await post({ async: true });
    const elapsed = Date.now() - started;

    expect(res.status).toBe(202);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toMatch(/^job_/);
    expect(body.status).toBe('queued');
    // The whole point: the reply did not wait for the render. Half the encode
    // is a generous bound that still fails if the route became synchronous.
    expect(elapsed).toBeLessThan(ENCODE_MS / 2);
  });

  it('hands back the url once the job settles', async () => {
    const { id } = (await (await post({ async: true })).json()) as { id: string };
    const done = await poll(id);
    expect(done.status).toBe('done');
    expect(done.url).toMatch(/\.mp4$/);
  });

  it('404s an unknown id — swept and never-existed are the same to a client', async () => {
    const res = await fetch(`${base}/v1/render/job_nope`);
    expect(res.status).toBe(404);
  });

  /* The regression that matters most here: both shipped clients post without
     `async`, and they must keep getting the finished url in the response. */
  it('leaves the synchronous path alone', async () => {
    const started = Date.now();
    const res = await post({});
    expect(res.status).toBe(200);
    expect((await res.json()) as { url: string }).toMatchObject({
      url: expect.stringMatching(/\.mp4$/),
    });
    expect(Date.now() - started).toBeGreaterThanOrEqual(ENCODE_MS);
  });
});

describe('GET /health', () => {
  it('reports queue depth and storage kind, and stays ok while busy', async () => {
    const inflight = post({ async: true });
    const body = (await (await fetch(`${base}/health`)).json()) as {
      ok: boolean;
      storage: string;
      renders: { capacity: number; running: number; queued: number };
    };
    expect(body.ok).toBe(true);
    expect(body.storage).toBe('local');
    expect(body.renders.capacity).toBeGreaterThan(0);
    await inflight;
  });
});
