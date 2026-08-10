// @vitest-environment node
//
// What a render costs, and when the credits actually move.
//
// Its own file because the price is read when the server is CONSTRUCTED, and
// because every other render suite runs at a cost of zero — where hold, settle
// and release are all no-ops and none of this is exercised at all.
//
// Two rules are being defended. Charge for OUTPUT, never for effort: a render
// that fails gives the credits back. And reserve BEFORE encoding, because the
// old shape — check the balance, charge on success — left a gap the whole
// length of an encode, through which an account could run far more renders than
// it could pay for.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { bearer, guestToken } from './guest.js';

/** Long enough that two requests genuinely overlap in the concurrency test. */
const ENCODE_MS = 300;
const FREE = 10;

/** One topic explodes, so success and failure can share a server. */
vi.mock('@layera-labs/orbit-video/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@layera-labs/orbit-video/node')>();
  return {
    ...actual,
    renderProject: async (project: { id?: string }) => {
      await new Promise((r) => setTimeout(r, ENCODE_MS));
      if (project?.id === 'EXPLODE') throw new Error('ffmpeg exited 1');
    },
  };
});

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.ORBIT_RENDER_PRICING = JSON.stringify({
    perSecond: { '480p': 0.25, '720p': 0.5, '1080p': 1, '2k': 2, '4k': 4 },
    minimum: 1,
    hdrMultiplier: 1.5,
    maxTier: '1080p',
  });
  process.env.ORBIT_FREE_CREDITS = String(FREE);
  process.env.ORBIT_SIGNUP_BONUS = '0';
  // Without this the grant route is not mounted at all, every top-up 404s, and
  // the balance assertions below quietly pass against an account that never
  // moved off the free tier.
  process.env.ORBIT_DEV_TOPUP = '1';
  const { createServer } = await import('../server.js');
  server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  delete process.env.ORBIT_RENDER_PRICING;
  delete process.env.ORBIT_DEV_TOPUP;
  delete process.env.ORBIT_FREE_CREDITS;
  server.close();
});

/**
 * A project whose length comes from a text overlay — so it has a real duration
 * to bill for while touching no media at all, and `missingUploads` has nothing
 * to reject.
 */
const projectOf = (over: Record<string, unknown> = {}) => ({
  id: 'p',
  schemaVersion: 2,
  width: 1920,
  height: 1080,
  fps: 30,
  background: { type: 'color', color: '#000' },
  clips: [],
  tracks: [],
  overlays: [
    { id: 'o1', type: 'text', text: 'hello', start: 0, end: 10, layer: 0 },
  ],
  audio: [],
  ...over,
});

const freshAccount = async () => bearer(await guestToken(base));

const balance = async (auth: Record<string, string>): Promise<number> =>
  (await (await fetch(`${base}/v1/credits`, { headers: auth })).json()).balance;

const grant = async (auth: Record<string, string>, amount: number) => {
  await fetch(`${base}/v1/credits/grant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ amount }),
  });
};

const render = (auth: Record<string, string>, body: Record<string, unknown>) =>
  fetch(`${base}/v1/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });

describe('per-second render pricing', () => {
  it('charges duration times the tier rate, once, on success', async () => {
    const auth = await freshAccount();
    await grant(auth, 90); // 100 total
    const before = await balance(auth);

    const res = await render(auth, { project: projectOf() });
    expect(res.status).toBe(200);

    // 10s of 1080p at 1 credit/s.
    expect(await balance(auth)).toBe(before - 10);
  });

  it('prices the same project higher when the export asks for more pixels', async () => {
    const auth = await freshAccount();
    await grant(auth, 990);
    const before = await balance(auth);

    // The OUTPUT override wins over the project's own canvas — it is what
    // ffmpeg actually encodes, and so what the box actually pays for.
    const res = await render(auth, {
      project: projectOf(),
      output: { width: 3840, height: 2160 },
    });
    expect(res.status).toBe(403); // 4k is over this plan's ceiling

    const ok = await render(auth, {
      project: projectOf(),
      output: { width: 1280, height: 720 },
    });
    expect(ok.status).toBe(200);
    expect(await balance(auth)).toBe(before - 5); // 10s × 0.5
  });

  it('gives the credits back when the encode fails', async () => {
    const auth = await freshAccount();
    await grant(auth, 90);
    const before = await balance(auth);

    const res = await render(auth, { project: projectOf({ id: 'EXPLODE' }) });
    expect(res.status).toBe(500);

    // Not merely "was never charged" — the hold was taken and had to be
    // released. A hold left open IS a charge.
    expect(await balance(auth)).toBe(before);
  });

  it('refuses a render it cannot pay for, and says what it would have cost', async () => {
    const auth = await freshAccount(); // FREE = 10
    const res = await render(auth, {
      project: projectOf(),
      output: { width: 1920, height: 1080 },
      // 10s HDR at 1080p = 15 credits, over the 10 this account has.
      ...{},
    });
    // Sanity: the plain version fits exactly, so make the HDR one the failure.
    expect(res.status).toBe(200);

    const auth2 = await freshAccount();
    const poor = await render(auth2, {
      project: projectOf(),
      output: { hdr: true },
    });
    expect(poor.status).toBe(402);
    const body = await poor.json();
    expect(body.code).toBe('insufficient_credits');
    expect(body.cost).toBe(15);
    expect(body.tier).toBe('1080p');
    expect(body.billedSec).toBe(10);
    expect(await balance(auth2)).toBe(10); // untouched
  });

  it('refuses a tier above the plan with 403, not 402', async () => {
    const auth = await freshAccount();
    await grant(auth, 10_000); // affluent, and still not allowed

    const res = await render(auth, {
      project: projectOf(),
      output: { width: 2560, height: 1440 },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('tier_not_allowed');
    expect(body.tier).toBe('2k');
    expect(body.maxTier).toBe('1080p');
    // Refused, not quietly downscaled, and nothing was charged for the refusal.
    expect(await balance(auth)).toBe(10_010);
  });

  /**
   * The bug the hold exists to close.
   *
   * `canAfford` then debit-on-success is a check-then-act spanning the entire
   * encode. Two renders accepted at the same instant on an account that can pay
   * for one both passed the check, both ran, and the box did two encodes of
   * work while being paid for one.
   */
  it('will not let two concurrent renders outspend one balance', async () => {
    const auth = await freshAccount(); // exactly 10 — one render's worth
    const [a, b] = await Promise.all([
      render(auth, { project: projectOf() }),
      render(auth, { project: projectOf() }),
    ]);

    const codes = [a.status, b.status].sort();
    expect(codes).toEqual([200, 402]);
    expect(await balance(auth)).toBe(0);
  });

  it('bills an audio-only export at the bottom rung, not at the canvas size', async () => {
    const auth = await freshAccount();
    await grant(auth, 90);
    const before = await balance(auth);

    // 4K canvas, but no frames are ever encoded.
    const res = await render(auth, {
      project: projectOf({ width: 3840, height: 2160 }),
      output: { audioOnly: true },
    });
    expect(res.status).toBe(200);
    // 10s × 0.25, floored at the minimum — and crucially NOT the 4k rate, and
    // not refused by the 1080p ceiling either.
    expect(await balance(auth)).toBe(before - 3);
  });
});
