// @vitest-environment node
//
// The sync routes over real HTTP, because the decisions being tested are about
// WHO may call them, and that lives in the route rather than the store.
//
// Runs without a database too: with none configured the routes must answer 503
// "not configured" rather than 500, and that is worth pinning on its own — it
// is the shape every other optional feature here uses.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { bearer, guestToken } from './guest.js';

const DB = process.env.TEST_DATABASE_URL;

let server: Server;
let base: string;
let guest: Record<string, string>;
/*
 * Registered ONCE, not per test. `register` is rate-limited to 5 per minute
 * per IP on purpose (it grants free credits), and a test that makes a fresh
 * account for every case trips our own defence and fails for a reason that has
 * nothing to do with sync.
 */
let alice: Record<string, string>;
let bob: Record<string, string>;

beforeAll(async () => {
  if (DB) process.env.DATABASE_URL = DB;
  const { createServer } = await import('../server.js');
  server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  guest = bearer(await guestToken(base));
  if (DB) {
    alice = await member(`sync${process.pid}a@test.local`);
    bob = await member(`sync${process.pid}b@test.local`);
  }
});

afterAll(() => {
  server.close();
});

/** Register a real account and return its Authorization header. */
async function member(email: string): Promise<Record<string, string>> {
  const res = await fetch(`${base}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const data = (await res.json()) as { token?: string; error?: string };
  if (!data.token) throw new Error(`register failed: ${data.error}`);
  return bearer(data.token);
}

const put = (auth: Record<string, string>, id: string, body: unknown) =>
  fetch(`${base}/v1/projects/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });

describe('who may sync', () => {
  it('refuses with no token at all', async () => {
    const res = await fetch(`${base}/v1/projects`);
    expect([401, 503]).toContain(res.status);
  });

  /*
   * The decision worth pinning. A guest token is a REAL identity and these
   * routes would work for one — but a guest has no password, so the account
   * cannot outlive a reinstall. Offering "your work follows you" to someone
   * whose identity dies with the app is a promise we know is false, so it is
   * refused with a reason the UI can act on.
   */
  it.skipIf(!DB)('refuses a guest, and says why', async () => {
    const res = await fetch(`${base}/v1/projects`, { headers: guest });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { kind: string }).kind).toBe('guest');
  });

  it.skipIf(DB)('reports itself unconfigured without a database', async () => {
    const res = await fetch(`${base}/v1/projects`, { headers: guest });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { kind: string }).kind).toBe('sync-unconfigured');
  });
});

describe.skipIf(!DB)('syncing', () => {
  const doc = (name: string, updatedAt: number) => ({
    kind: 'video',
    name,
    updatedAt,
    data: { clips: [name] },
  });

  it('round-trips a project', async () => {
    const me = alice;
    expect((await put(me, 'x1', doc('mine', 1000))).status).toBe(200);

    const got = await (await fetch(`${base}/v1/projects/x1`, { headers: me })).json();
    expect((got as { name: string }).name).toBe('mine');

    const list = (await (await fetch(`${base}/v1/projects`, { headers: me })).json()) as {
      projects: { id: string }[];
      mediaDurable: boolean;
    };
    expect(list.projects.map((p) => p.id)).toContain('x1');
    // Reported, not assumed — the client has to warn when footage will not travel.
    expect(typeof list.mediaDurable).toBe('boolean');
  });

  /* 409 must carry the winner. "No" alone would make the client silently drop
     the edit the user just made. */
  it('answers a stale write with the copy it would have overwritten', async () => {
    const me = bob;
    await put(me, 'x2', doc('newer', 5000));
    const res = await put(me, 'x2', doc('older', 4000));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { current: { name: string; updatedAt: number } };
    expect(body.current.name).toBe('newer');
    expect(body.current.updatedAt).toBe(5000);
  });

  it('keeps one account out of another\'s projects', async () => {
    const a = alice;
    const b = bob;
    await put(a, 'shared-id', doc('a-doc', 1000));
    expect((await fetch(`${base}/v1/projects/shared-id`, { headers: b })).status).toBe(404);
    // And B storing the same id must not disturb A's copy.
    await put(b, 'shared-id', doc('b-doc', 2000));
    const aGot = (await (
      await fetch(`${base}/v1/projects/shared-id`, { headers: a })
    ).json()) as { name: string };
    expect(aGot.name).toBe('a-doc');
  });

  it('rejects a body with no timestamp rather than inventing one', async () => {
    const me = alice;
    const res = await fetch(`${base}/v1/projects/x3`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...me },
      body: JSON.stringify({ kind: 'video', name: 'no ts', data: {} }),
    });
    expect(res.status).toBe(400);
  });

  it('propagates a delete as a tombstone the next pull can see', async () => {
    const me = bob;
    await put(me, 'x4', doc('doomed', 1000));
    expect((await fetch(`${base}/v1/projects/x4`, { method: 'DELETE', headers: me })).status).toBe(200);
    expect((await fetch(`${base}/v1/projects/x4`, { headers: me })).status).toBe(404);
    const list = (await (await fetch(`${base}/v1/projects`, { headers: me })).json()) as {
      projects: { id: string; deleted: boolean }[];
    };
    expect(list.projects.find((p) => p.id === 'x4')?.deleted).toBe(true);
  });
});
