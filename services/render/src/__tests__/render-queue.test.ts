// @vitest-environment node
//
// Admission control on /v1/render.
//
// This is tested over real HTTP rather than by calling a helper, because the
// thing being defended is a property of the ROUTE under load — how many encodes
// run at once and what an overflowing queue tells the caller. `renderProject` is
// stubbed with a delay so the test never touches ffmpeg.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { bearer, guestToken } from './guest.js';

/** Highest number of stubbed renders observed in flight at the same moment. */
let inFlight = 0;
let peak = 0;

vi.mock('@orbit/video/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/video/node')>();
  return {
    ...actual,
    renderProject: async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 120));
      inFlight -= 1;
    },
  };
});

process.env.ORBIT_MAX_CONCURRENT_RENDERS = '2';
process.env.ORBIT_MAX_QUEUED_RENDERS = '1';

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

const post = () =>
  fetch(`${base}/v1/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({
      project: {
        id: 'p',
        schemaVersion: 2,
        width: 64,
        height: 64,
        fps: 30,
        background: { type: 'color', color: '#000' },
        clips: [],
        overlays: [],
        audio: [],
      },
    }),
  });

describe('render admission control', () => {
  it('never runs more encodes at once than the cap, and sheds the rest', async () => {
    // Two run, one waits, the remaining three have nowhere to go.
    const results = await Promise.all(Array.from({ length: 6 }, post));
    const codes = results.map((r) => r.status);

    expect(peak).toBeLessThanOrEqual(2);
    expect(codes.filter((c) => c === 200).length).toBe(3);
    expect(codes.filter((c) => c === 503).length).toBe(3);

    const shed = results.find((r) => r.status === 503)!;
    // Shedding must say what happened. A bare 503 reads as "the service is
    // broken" when the honest answer is "come back in a moment".
    expect(((await shed.json()) as { error: string }).error).toMatch(/busy/i);
  });

  it('recovers once the queue drains', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { url: string }).url).toMatch(/^\/files\/.+\.mp4$/);
  });
});
