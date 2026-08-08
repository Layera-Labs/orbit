// @vitest-environment node
//
// A render service with no language model.
//
// Its own file because the gate is read when the server is CONSTRUCTED, so it
// cannot be tested beside a suite that sets the variables — and it needs
// testing, because the alternative to a named 503 is a queue filling with jobs
// that accept, wait, and then fail at the first step for a reason the caller
// never sees.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { bearer, guestToken } from './guest.js';

let server: Server;
let base: string;
let auth: Record<string, string>;

beforeAll(async () => {
  for (const key of [
    'ORBIT_LLM_BASE_URL',
    'ORBIT_LLM_MODEL',
    'ORBIT_LLM_API_KEY',
    'ELEVENLABS_API_KEY',
  ])
    delete process.env[key];

  const { createServer } = await import('../server.js');
  server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  auth = bearer(await guestToken(base));
});

afterAll(() => server.close());

describe('generation on an unconfigured box', () => {
  it('refuses by name instead of queueing work it cannot do', async () => {
    const res = await fetch(`${base}/v1/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ topic: 'why the sky is blue' }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.kind).toBe('generation-unconfigured');
    // And says which variables, so it is actionable without reading the source.
    expect(body.error).toMatch(/ORBIT_LLM/);
    expect(body.error).toMatch(/ELEVENLABS_API_KEY/);
  });

  /* Everything else on the box still works — this is a valid deployment. */
  it('still renders', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
