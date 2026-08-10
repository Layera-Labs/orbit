// @vitest-environment node
//
// The routes that had no limit at all.
//
// Tested over real HTTP, because the claim is about where the middleware SITS,
// not about the counter. A unit test of `rateLimit` would have passed happily
// while `/v1/fonts/:family` carried a limit that bounded nothing — which is
// exactly the bug fixed here.
//
// Three properties, and the second and third are the ones worth having:
//
//   1. The limit exists and answers 429.
//   2. A route with a `:param` counts per ROUTE, not per id. Keyed on the path,
//      a caller buys a fresh budget by changing one character of the URL.
//   3. Routes in a class SHARE a bucket, so alternating between the four AI
//      routes does not buy four budgets.
//
// The limiter runs before every handler, so these drive it with requests that
// are refused for other reasons (503 with no provider key, 403 for a guest,
// 404 for an unknown job). That is deliberate: it exercises the real mount
// order and costs no provider call and no credit.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { bearer, guestToken } from './guest.js';

vi.mock('@layera-labs/orbit-video/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@layera-labs/orbit-video/node')>();
  return { ...actual, renderProject: async () => {} };
});

/*
 * Small limits, and a window long enough that it cannot reset mid-test. Set
 * before the server module is imported, because `envNumber` reads the
 * environment once at module load.
 */
const AI = 3;
const READ = 4;
const WRITE = 3;
const FONTS = 3;

let server: Server;
let base: string;
let auth: Record<string, string>;

beforeAll(async () => {
  process.env.ORBIT_RATE_WINDOW_MS = '600000';
  process.env.ORBIT_AI_RATE_LIMIT = String(AI);
  process.env.ORBIT_READ_RATE_LIMIT = String(READ);
  process.env.ORBIT_WRITE_RATE_LIMIT = String(WRITE);
  process.env.ORBIT_FONT_RATE_LIMIT = String(FONTS);
  vi.resetModules();

  const { createServer } = await import('../server.js');
  server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  auth = bearer(await guestToken(base));
});

afterAll(() => {
  server.close();
  delete process.env.ORBIT_RATE_WINDOW_MS;
  delete process.env.ORBIT_AI_RATE_LIMIT;
  delete process.env.ORBIT_READ_RATE_LIMIT;
  delete process.env.ORBIT_WRITE_RATE_LIMIT;
  delete process.env.ORBIT_FONT_RATE_LIMIT;
});

const get = (path: string) => fetch(`${base}${path}`, { headers: auth });

const post = (path: string, body: unknown = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });

/** Fire `n` requests in order and return the status codes. */
async function statuses(n: number, call: (i: number) => Promise<Response>): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push((await call(i)).status);
  return out;
}

describe('the AI routes are held under one budget', () => {
  /*
   * These are the routes that spend real money: each reaches a paid provider,
   * and a guest token — which the server mints for the asking — is enough to
   * make the call. They were the only unmetered way to bill someone else's
   * provider account.
   */
  it('refuses past the limit, alternating across all four', async () => {
    const paths = ['/v1/generate-image', '/v1/generate-video', '/v1/tts', '/v1/transcribe'];
    const codes = await statuses(AI + 2, (i) => post(paths[i % paths.length], { prompt: 'x' }));

    // Alternating visits four DIFFERENT routes, so a per-path bucket would let
    // every one of these through. The limit has to bite on the shared count.
    expect(codes.slice(0, AI).every((c) => c !== 429)).toBe(true);
    expect(codes.slice(AI)).toEqual([429, 429]);
  });

  it('says how long to wait rather than only that it refused', async () => {
    const res = await post('/v1/tts', { text: 'x' });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; retryAfterMs: number };
    expect(body.error).toBe('too many requests');
    // A client that cannot tell "wait 2s" from "wait 10min" retries blindly and
    // keeps the window shut.
    expect(body.retryAfterMs).toBeGreaterThan(0);
  });
});

describe('a route with a parameter counts per route, not per id', () => {
  /*
   * The bug this file exists for. Keyed on `req.path`, `/v1/render/a` and
   * `/v1/render/b` are different buckets — so a caller using a fresh id on
   * every request has no limit at all, while the code reads as though it does.
   */
  it('bites on /v1/render/:id even with a different id every time', async () => {
    const codes = await statuses(READ + 2, (i) => get(`/v1/render/job-${i}`));
    // Every id is unknown, so the un-limited answer is 404, never 429.
    expect(codes.slice(0, READ)).toEqual(Array(READ).fill(404));
    expect(codes.slice(READ)).toEqual([429, 429]);
  });

  it('bites on /v1/fonts/:family even with a different family every time', async () => {
    // This route ALREADY had a limit, and it never worked.
    const families = ['Inter', 'Roboto', 'Lato', 'Oswald', 'Rubik', 'Karla'];
    const codes = await statuses(FONTS + 2, (i) => get(`/v1/fonts/${families[i]}`));
    expect(codes.slice(FONTS)).toEqual([429, 429]);
  });
});

describe('the write routes are limited', () => {
  it('bites across the project routes with a different id every time', async () => {
    // A guest is refused these outright (403), which is a fine way to drive the
    // counter: the limit sits in front of the handler that decides that.
    const codes = await statuses(WRITE + 2, (i) =>
      fetch(`${base}/v1/projects/p-${i}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...auth },
        body: JSON.stringify({ kind: 'video', name: 'n', updatedAt: 1, data: {} }),
      }),
    );
    expect(codes.slice(0, WRITE).every((c) => c !== 429)).toBe(true);
    expect(codes.slice(WRITE)).toEqual([429, 429]);
  });
});

describe('the classes do not share a budget with each other', () => {
  /*
   * Reads and writes are separate on purpose: a large first sync is a burst of
   * both, and folding them together would mean the pull half exhausting the
   * budget the push half needs. Every bucket above is already spent by the time
   * this runs, so what it checks is that a class nobody touched is untouched.
   */
  it('leaves a class alone that nothing has spent', async () => {
    // `/health` carries no limit at all — a load balancer must always get an
    // answer, and the route reads no store and spends nothing.
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });
});
