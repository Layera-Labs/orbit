// @vitest-environment node
//
// A box that cannot rasterize is taken out of rotation.
//
// `@resvg/resvg-js` is the only native addon here, and it is loaded into this
// process rather than spawned. So unlike ffmpeg — which fails loudly and at the
// door — a resvg that does not match the machine it is running on lets the
// service start, answer `/health`, accept uploads and render anything without
// text, and then fail every render carrying a caption. The gap between the
// deploy and the first symptom is however long it takes someone to add one.
//
// `/health` asks the question once, at the cost of a 1x1 rasterization.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

let broken = false;

vi.mock('@orbit/video/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/video/node')>();
  return {
    ...actual,
    renderProject: async () => {},
    // Stands in for the addon failing to load or refusing to render, which is
    // what an architecture mismatch looks like from here.
    rasterizeSVG: (...args: Parameters<typeof actual.rasterizeSVG>) => {
      if (broken) throw new Error('Cannot find module ... resvg.linux-x64-gnu.node');
      return actual.rasterizeSVG(...args);
    },
  };
});

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
  broken = false;
});

async function health(): Promise<{ status: number; body: Record<string, unknown> }> {
  // Reset first: the probe caches its answer for the life of the module, which
  // is right in production and would carry one test's verdict into the next.
  vi.resetModules();
  const { createServer } = await import('../server.js');
  server = createServer().listen(0);
  await new Promise((r) => server!.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const res = await fetch(`${base}/health`);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('when resvg works', () => {
  it('answers 200 and says so', async () => {
    const { status, body } = await health();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect((body.capabilities as { rasterize: boolean }).rasterize).toBe(true);
  });
});

describe('when resvg cannot rasterize', () => {
  it('answers 503, so an orchestrator stops sending work here', async () => {
    broken = true;
    const { status, body } = await health();
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
  });

  /*
   * Named, not merely flagged. `ok: false` on its own sends whoever is on call
   * looking at the queue, the database and the disk — this is the one failure
   * on this endpoint that none of those explain.
   */
  it('says what is wrong rather than only that something is', async () => {
    broken = true;
    const { body } = await health();
    expect(String(body.error)).toMatch(/resvg/i);
    expect((body.capabilities as { rasterize: boolean }).rasterize).toBe(false);
  });

  /*
   * The rest of the report survives. A box in this state is still worth asking
   * about — which build is it, is the schema up, what is the queue doing — and
   * an endpoint that collapses to an error object at the exact moment it gets
   * interesting is the wrong trade.
   */
  it('still reports everything else', async () => {
    broken = true;
    const { body } = await health();
    expect(body.service).toBe('orbit-render');
    expect(body.version).toBeTruthy();
    expect(body.schema).toBe('ready');
    expect(body.renders).toBeTruthy();
  });
});
