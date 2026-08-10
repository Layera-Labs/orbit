// @vitest-environment node
//
// The SSE half of the export contract: the vocabulary adapter, the stream
// ticket, and the route that puts them together.
//
// `ExportJobPoller` in `@layera-labs/orbit-core` has been written against this endpoint
// since before it existed, and the two halves did NOT agree — which is the
// point of most of what is asserted here.
import { describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isTerminal, toExportJob } from '../export-job';
import {
  TICKET_TTL_MS,
  mintStreamTicket,
  verifyStreamTicket,
} from '../stream-ticket';
import { openSse } from '../sse';
import type { Job } from '../jobs';

const job = (over: Partial<Job> = {}): Job => ({
  id: 'r_1',
  status: 'queued',
  createdAt: 0,
  ...over,
});

describe('toExportJob', () => {
  /*
   * The bug this file exists for. The client stops on `done`, `failed` or
   * `cancelled`; the server says `error`. Unmapped, a failed render leaves the
   * stream open and the polling fallback polling forever.
   */
  it('translates the statuses the client actually waits for', () => {
    expect(toExportJob(job({ status: 'queued' })).status).toBe('queued');
    expect(toExportJob(job({ status: 'running' })).status).toBe('processing');
    expect(toExportJob(job({ status: 'done' })).status).toBe('done');
    expect(toExportJob(job({ status: 'error' })).status).toBe('failed');
  });

  it('agrees with the client about which statuses are final', () => {
    expect(isTerminal(toExportJob(job({ status: 'error' })).status)).toBe(true);
    expect(isTerminal(toExportJob(job({ status: 'done' })).status)).toBe(true);
    expect(isTerminal(toExportJob(job({ status: 'running' })).status)).toBe(false);
    expect(isTerminal(toExportJob(job({ status: 'queued' })).status)).toBe(false);
  });

  it('renames the id to what the client reads', () => {
    expect(toExportJob(job({ id: 'r_9' })).jobId).toBe('r_9');
  });

  /* A finished job showing 0.87 forever is worse than a bar that never moved. */
  it('pins a finished job to full progress and an unmeasured one to zero', () => {
    expect(toExportJob(job({ status: 'done', progress: 0.87 })).progress).toBe(1);
    expect(toExportJob(job({ status: 'running' })).progress).toBe(0);
    expect(toExportJob(job({ status: 'running', progress: 0.4 })).progress).toBe(0.4);
  });

  it('turns a message into the structured error the client expects', () => {
    const e = toExportJob(job({ status: 'error', error: 'ffmpeg exited 1' })).error!;
    expect(e.message).toBe('ffmpeg exited 1');
    expect(e.code).toBe('render_failed');
  });

  /*
   * `retryable` is only claimed where it is true. A missing upload really is
   * recoverable and both clients already know how; an unparseable transition
   * will fail identically every time, and saying otherwise invites a client to
   * burn a render slot proving it.
   */
  it('marks a missing upload retryable and a broken project not', () => {
    expect(
      toExportJob(job({ status: 'error', error: 'missing_uploads: a.mp4' })).error!.retryable,
    ).toBe(true);
    expect(
      toExportJob(job({ status: 'error', error: 'No such filter: revealdown' })).error!
        .retryable,
    ).toBe(false);
  });

  it('carries no error object when nothing failed', () => {
    expect(toExportJob(job({ status: 'done', url: '/files/out.mp4' })).error).toBeUndefined();
    expect(toExportJob(job({ status: 'done', url: '/files/out.mp4' })).url).toBe(
      '/files/out.mp4',
    );
  });
});

describe('stream tickets', () => {
  const SECRET = 'test-secret';

  it('round-trips for the job and account it was minted for', () => {
    const t = mintStreamTicket(SECRET, 'r_1', 'acct_a');
    expect(verifyStreamTicket(SECRET, t, 'r_1', 'acct_a')).toEqual({ ok: true });
  });

  /* One job. A leaked ticket costs the progress of a render whose id the
     holder already had, and nothing else. */
  it('is useless for another job or another account', () => {
    const t = mintStreamTicket(SECRET, 'r_1', 'acct_a');
    expect(verifyStreamTicket(SECRET, t, 'r_2', 'acct_a')).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(verifyStreamTicket(SECRET, t, 'r_1', 'acct_b')).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('expires', () => {
    const t = mintStreamTicket(SECRET, 'r_1', 'acct_a', 1_000);
    expect(verifyStreamTicket(SECRET, t, 'r_1', 'acct_a', 1_000 + TICKET_TTL_MS - 1).ok).toBe(
      true,
    );
    expect(verifyStreamTicket(SECRET, t, 'r_1', 'acct_a', 1_000 + TICKET_TTL_MS)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('is worthless under a different secret', () => {
    const t = mintStreamTicket(SECRET, 'r_1', 'acct_a');
    expect(verifyStreamTicket('other', t, 'r_1', 'acct_a').ok).toBe(false);
  });

  /*
   * A forged ticket reads as invalid whatever its expiry claims. Answering
   * "expired" would confirm the rest of it was well-formed, which is a small
   * oracle and free to avoid.
   */
  it('does not tell a forger that their expiry was plausible', () => {
    const future = Date.now() + 60_000;
    expect(verifyStreamTicket(SECRET, `${future}.notasignature`, 'r_1', 'a')).toEqual({
      ok: false,
      reason: 'invalid',
    });
    const past = Date.now() - 60_000;
    // Already expired AND forged: still "invalid", never "expired".
    expect(verifyStreamTicket(SECRET, `${past}.notasignature`, 'r_1', 'a')).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('refuses junk without throwing', () => {
    for (const bad of ['', '.', 'nodot', 'abc.def', '.sig'])
      expect(verifyStreamTicket(SECRET, bad, 'r_1', 'a').ok).toBe(false);
  });
});

/**
 * The wire format, over a real socket.
 *
 * A test that inspects a mock `Response` would pass against a stream nginx
 * buffers into uselessness, so this reads actual bytes off an actual
 * connection.
 */
describe('openSse', () => {
  const serve = async (handler: (stream: ReturnType<typeof openSse>) => void) => {
    const server = createServer((_req, res) => {
      handler(openSse(res as never, 50));
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    return { server, url: `http://127.0.0.1:${port}/` };
  };

  it('sends the headers a proxy needs to leave it alone', async () => {
    const { server, url } = await serve((s) => s.close());
    const res = await fetch(url);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    // nginx buffers a proxied response by default: without this the client sees
    // nothing for the whole render and then everything at once.
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    expect(res.headers.get('cache-control')).toContain('no-transform');
    await res.text();
    server.close();
  });

  it('frames events so the client can parse them', async () => {
    const { server, url } = await serve((s) => {
      s.send({ jobId: 'r_1', progress: 0.5 });
      s.close();
    });
    const body = await (await fetch(url)).text();
    expect(body).toContain('data: {"jobId":"r_1","progress":0.5}\n\n');
    server.close();
  });

  /*
   * A newline in the payload would end the event early and split it over two
   * messages the client then fails to parse. JSON escapes them — which is why
   * `send` serialises rather than accepting a formatted string.
   */
  it('does not let a newline in the data break the framing', async () => {
    const { server, url } = await serve((s) => {
      s.send({ message: 'line one\nline two' });
      s.close();
    });
    const body = await (await fetch(url)).text();
    const events = body.split('\n\n').filter((b) => b.startsWith('data: '));
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].slice(6)).message).toBe('line one\nline two');
    server.close();
  });

  /* An idle connection is one something in the middle will close. */
  it('heartbeats, and the beats are invisible to the client', async () => {
    const { server, url } = await serve((s) => {
      setTimeout(() => s.close(), 160);
    });
    const body = await (await fetch(url)).text();
    expect(body.match(/: ping/g)!.length).toBeGreaterThan(1);
    // Comment lines carry no `data:`, so `onmessage` never fires for them.
    expect(body).not.toContain('data:');
    server.close();
  });

  it('stops sending, and runs its cleanup, once the client has gone', async () => {
    const cleanup = vi.fn();
    let stream!: ReturnType<typeof openSse>;
    const { server, url } = await serve((s) => {
      stream = s;
      s.onClose(cleanup);
    });
    const ac = new AbortController();
    await fetch(url, { signal: ac.signal }).then((r) => r.body?.cancel());
    ac.abort();

    await vi.waitFor(() => expect(cleanup).toHaveBeenCalled());
    expect(stream.send({ late: true })).toBe(false);
    server.close();
  });
});
