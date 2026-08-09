// @vitest-environment node
//
// Every line this service writes can be joined to the request that caused it.
//
// Before this the access log said a POST returned 500 and a separate error line
// said what broke, and nothing connected them: joining meant guessing from
// timestamps on a box serving several requests at once. There were also three
// formats in play — prose with an `[orbit]` prefix, hand-built JSON keyed
// `event`, and hand-built JSON keyed `evt` — so a pipeline could parse some of
// it and an operator could follow none of it.
//
// What is asserted here is the property, not the format: an id exists, the
// client is given it, it appears on the request line, and it is not taken from
// anything the caller sends.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.mock('@layera-labs/video/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@layera-labs/video/node')>();
  return { ...actual, renderProject: async () => {} };
});

let server: Server;
let base: string;

/** Every JSON line written while `fn` ran. */
async function captured(fn: () => Promise<void>): Promise<Record<string, unknown>[]> {
  const lines: Record<string, unknown>[] = [];
  const take = (...args: unknown[]) => {
    try {
      lines.push(JSON.parse(String(args[0])) as Record<string, unknown>);
    } catch {
      // A non-JSON line is itself a finding, but it is not this test's subject.
    }
  };
  const spies = (['log', 'warn', 'error'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(take as never),
  );
  try {
    await fn();
  } finally {
    for (const s of spies) s.mockRestore();
  }
  return lines;
}

beforeAll(async () => {
  const { createServer } = await import('../server.js');
  server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

describe('the request id', () => {
  it('comes back in a header, so a user can quote the request that failed', async () => {
    const res = await fetch(`${base}/v1/credits`);
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('appears on the access line', async () => {
    let rid: string | null = null;
    const lines = await captured(async () => {
      const res = await fetch(`${base}/v1/credits`);
      rid = res.headers.get('x-request-id');
      // The line is written on `finish`, which can land after fetch resolves.
      await new Promise((r) => setTimeout(r, 30));
    });
    const request = lines.find((l) => l.event === 'request');
    expect(request).toBeTruthy();
    expect(request!.rid).toBe(rid);
    expect(request!.path).toBe('/v1/credits');
  });

  it('is different for every request', async () => {
    const a = (await fetch(`${base}/v1/credits`)).headers.get('x-request-id');
    const b = (await fetch(`${base}/v1/credits`)).headers.get('x-request-id');
    expect(a).not.toBe(b);
  });

  /*
   * NOT taken from the caller. Honouring an inbound `X-Request-Id` would let a
   * caller write chosen text into the logs and give two unrelated requests the
   * same id. A gateway wanting end-to-end correlation can log the id this
   * service RETURNS — that direction needs no trust.
   */
  it('ignores an id the caller supplies', async () => {
    const res = await fetch(`${base}/v1/credits`, {
      headers: { 'x-request-id': 'chosen-by-the-caller' },
    });
    expect(res.headers.get('x-request-id')).not.toBe('chosen-by-the-caller');
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('every line is structured the same way', () => {
  it('carries t, level and event', async () => {
    const lines = await captured(async () => {
      await fetch(`${base}/v1/credits`);
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(typeof l.t).toBe('string');
      expect(['info', 'warn', 'error']).toContain(l.level);
      expect(typeof l.event).toBe('string');
    }
  });

  /*
   * A field named `event` must not be able to displace the event. It is the key
   * every query filters on, and a caller-supplied field quietly overwriting it
   * is exactly the sort of thing found during an incident rather than before.
   */
  it('does not let a field overwrite the event', async () => {
    const { logInfo } = await import('../logging.js');
    const lines = await captured(async () => {
      logInfo('real-event', { event: 'impostor', level: 'nonsense' });
    });
    expect(lines[0].event).toBe('real-event');
    expect(lines[0].level).toBe('info');
  });

  /*
   * A stack is the useful half of an error and it is multi-line, which is what
   * breaks a line-oriented pipeline. It goes in a field, where JSON escapes it,
   * rather than being concatenated into a message that spans fifteen lines and
   * carries its `rid` on only the first.
   */
  it('puts an error stack in a field rather than across lines', async () => {
    const { errFields } = await import('../logging.js');
    const f = errFields(new Error('boom'));
    expect(f.err).toBe('boom');
    expect(String(f.stack)).toContain('Error: boom');
    expect(JSON.stringify(f).split('\n')).toHaveLength(1);
  });
});

describe('health is not logged', () => {
  /* It would otherwise be most of the log: every 30s, forever, per container. */
  it('writes no request line for /health', async () => {
    const lines = await captured(async () => {
      await fetch(`${base}/health`);
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(lines.filter((l) => l.event === 'request')).toHaveLength(0);
  });
});
