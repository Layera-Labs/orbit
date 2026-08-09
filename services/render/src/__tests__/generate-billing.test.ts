// @vitest-environment node
//
// What a generation costs, and when.
//
// Its own file because the price is read when the server is CONSTRUCTED — and
// because this is the one path in the generation flow that nothing else
// exercises: the route suite runs at a cost of zero, where hold, settle and
// release are all no-ops.
//
// The rule being proven is the same one the render path follows: charge for
// OUTPUT, never for effort. A generation that dies halfway gives the credits
// back.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { bearer, guestToken } from './guest.js';

const COST = 25;
const FREE = 100;

vi.mock('@orbit/video/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/video/node')>();
  return { ...actual, renderProject: async () => undefined };
});

/* Fails on one topic, so success and failure share one server. */
vi.mock('../brain.js', async () => {
  const { story } = await import('@orbit/formats');
  return {
    brainFromEnv: () => ({
      complete: async (prompt: string) => {
        if (prompt.includes('EXPLODE')) throw new Error('llm 500 boom');
        return JSON.stringify(story.brief.example);
      },
    }),
    openAiCompatibleBrain: () => {
      throw new Error('not used');
    },
  };
});

vi.mock('../generation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../generation.js')>();
  return {
    ...actual,
    ElevenLabsVoice: class {
      async speak(text: string) {
        return { src: `upload:vo-${text.length}.mp3`, durationSec: 3 };
      }
    },
  };
});

vi.mock('../stock-provider.js', () => ({
  openverseOrPexels: () => ({
    id: 'fake',
    search: async (q: string) => [
      { id: q, type: 'image', src: `https://cdn/${encodeURIComponent(q)}.jpg`, width: 1080, height: 1920 },
    ],
    getById: async () => ({ id: 'x', type: 'image', src: 'https://cdn/x.jpg', width: 1080, height: 1920 }),
  }),
  /* No key here, so no footage slot — which is the case this file exercises. */
  stockVideoProvider: () => undefined,
}));

vi.mock('../asset-store.js', () => ({
  MediaDirAssetStore: class {
    async fetch(url: string) {
      return `upload:${encodeURIComponent(url).slice(-24)}`;
    }
  },
}));

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.ORBIT_GENERATION_COST = String(COST);
  process.env.ORBIT_FREE_CREDITS = String(FREE);
  process.env.ORBIT_SIGNUP_BONUS = '0';
  process.env.ORBIT_LLM_BASE_URL = 'https://llm.test/v1';
  process.env.ORBIT_LLM_MODEL = 'test-model';
  process.env.ORBIT_LLM_API_KEY = 'sk-test';
  process.env.ELEVENLABS_API_KEY = 'el-test';
  const { createServer } = await import('../server.js');
  server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  delete process.env.ORBIT_GENERATION_COST;
  server.close();
});

const freshAccount = async () => bearer(await guestToken(base));

const balance = async (auth: Record<string, string>) =>
  (await (await fetch(`${base}/v1/credits`, { headers: auth })).json()).balance;

const post = (topic: string, auth: Record<string, string>) =>
  fetch(`${base}/v1/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ topic }),
  });

async function settle(id: string, auth: Record<string, string>, ms = 20_000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const res = await fetch(`${base}/v1/generate/${id}`, { headers: auth });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    const job = await res.json();
    if (job.status === 'done' || job.status === 'error') return job;
    if (Date.now() > deadline) throw new Error(`stuck in ${job.status}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

describe('what a generation costs', () => {
  /*
   * The whole reason it is a HOLD and not a charge on completion. The credits
   * are gone while the job is queued, so a caller cannot start twenty
   * generations on a balance that covers one.
   */
  it('reserves the credits the moment the job is accepted', async () => {
    const auth = await freshAccount();
    expect(await balance(auth)).toBe(FREE);

    const { id } = await (await post('why the sky is blue', auth)).json();
    expect(await balance(auth)).toBe(FREE - COST);

    await settle(id, auth);
  }, 25_000);

  /*
   * What this does and does not prove, measured by mutation.
   *
   * It fails if the hold is closed with `release` instead of `settle` (the
   * credits come back for a video that exists), and it fails if `settle` is
   * given the wrong amount. It does NOT fail if the settle is removed
   * altogether — and that is arithmetic rather than a hole: settling at exactly
   * the held amount writes `held - actual`, which is zero, so the balance
   * cannot move either way. What the missing settle leaves behind is an open
   * hold row, which nothing outside the ledger can see. The line stops being
   * balance-neutral the day the price becomes variable, which is the reason it
   * is a settle and not a no-op.
   */
  it('charges exactly the price when a video comes out', async () => {
    const auth = await freshAccount();
    const { id } = await (await post('why cats purr', auth)).json();
    const job = await settle(id, auth);

    expect(job.status).toBe('done');
    // Settled at the held amount: the hold closes and nothing more is taken.
    expect(await balance(auth)).toBe(FREE - COST);
  }, 25_000);

  /*
   * The rule the render path already follows. A generation that failed produced
   * nothing, so it costs nothing — and without the release the credits would be
   * reserved forever against a job that is over, with the balance gone and
   * nothing in the ledger explaining why.
   */
  it('gives the credits back when the generation fails', async () => {
    const auth = await freshAccount();
    const { id } = await (await post('EXPLODE please', auth)).json();
    expect(await balance(auth)).toBe(FREE - COST);

    const job = await settle(id, auth);
    expect(job.status).toBe('error');
    expect(await balance(auth)).toBe(FREE);
  }, 25_000);

  it('refuses when the balance cannot cover it', async () => {
    const auth = await freshAccount();
    // Four fit in the free tier; the fifth does not.
    const ids: string[] = [];
    for (let i = 0; i < FREE / COST; i++) {
      const res = await post(`topic ${i}`, auth);
      expect(res.status).toBe(202);
      ids.push((await res.json()).id);
    }
    expect(await balance(auth)).toBe(0);

    const refused = await post('one too many', auth);
    expect(refused.status).toBe(402);
    expect((await refused.json()).kind).toBe('insufficient_credits');

    await Promise.all(ids.map((id) => settle(id, auth)));
  }, 40_000);
});
