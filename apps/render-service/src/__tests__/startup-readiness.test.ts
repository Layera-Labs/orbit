// @vitest-environment node
//
// The schema comes up at STARTUP, or the process does not start.
//
// Every Pg store creates its own tables from its constructor and awaits that
// promise inside each method. That works, and it puts the failure in the wrong
// place: a wrong DATABASE_URL, a revoked password or a schema that cannot be
// created surfaced as a 500 on whoever clicked first — long after the deploy
// that caused it reported success, and with an error naming a query rather than
// the configuration.
//
// What is covered here is the readiness contract: that a bad database resolves
// to a failure naming every store that could not come up, and that `/health`
// says so. `main.ts` turns that into `process.exit(1)` before it listens, which
// is three lines and is NOT covered — the service has no TypeScript runner in
// its dev dependencies, so spawning it would mean a compile step inside the
// test. Worth knowing rather than assuming.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.mock('@orbit/video/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/video/node')>();
  return { ...actual, renderProject: async () => {} };
});

type Readiness = { ok: boolean; errors: string[] };

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
  delete process.env.DATABASE_URL;
  vi.resetModules();
});

/** Port 1 on loopback refuses immediately, so this fails fast and honestly. */
const UNREACHABLE = 'postgres://orbit:orbit@127.0.0.1:1/nope';

async function start(): Promise<{ base: string; ready: Promise<Readiness> }> {
  vi.resetModules();
  const { createServer } = await import('../server.js');
  const app = createServer();
  server = app.listen(0);
  await new Promise((r) => server!.once('listening', r));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    ready: app.locals.ready as Promise<Readiness>,
  };
}

describe('with no database', () => {
  it('is ready immediately, because there is nothing to wait for', async () => {
    const { base, ready } = await start();
    expect(await ready).toEqual({ ok: true, errors: [] });
    const health = (await (await fetch(`${base}/health`)).json()) as { schema: string };
    expect(health.schema).toBe('ready');
  });
});

describe('with a database it cannot reach', () => {
  it('reports a failure rather than resolving ok', async () => {
    process.env.DATABASE_URL = UNREACHABLE;
    const { ready } = await start();
    const outcome = await ready;
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.length).toBeGreaterThan(0);
  });

  /*
   * Every store that failed, not just the first. One unreachable database
   * produces several of these, and reporting a single one reads as a problem
   * with that one table — which sends whoever is on call looking in exactly
   * the wrong place.
   */
  it('names each store that could not come up', async () => {
    process.env.DATABASE_URL = UNREACHABLE;
    const { ready } = await start();
    const { errors } = await ready;
    const named = errors.map((e) => e.split(':')[0]).sort();
    expect(named).toContain('ledger_entries');
    expect(named).toContain('users');
    expect(named).toContain('projects');
  });

  /*
   * `ok` stays true and `schema` goes to `failed`. They answer different
   * questions: `ok` is "is this process alive", which a load balancer needs
   * during a rolling deploy, and `schema` is "did the tables come up", which is
   * what you look at when requests fail and the process plainly is running.
   */
  it('says so on /health without claiming the process is dead', async () => {
    process.env.DATABASE_URL = UNREACHABLE;
    const { base, ready } = await start();
    await ready;
    const health = (await (await fetch(`${base}/health`)).json()) as {
      ok: boolean;
      schema: string;
    };
    expect(health.ok).toBe(true);
    expect(health.schema).toBe('failed');
  });
});
