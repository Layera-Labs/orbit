// @vitest-environment node
//
// The generation endpoint, end to end over real HTTP, with every vendor faked.
//
// The LLM, the voice and the stock search are all stubbed at the module
// boundary — there are no keys here — but the ROUTE, the queue, the worker, the
// step log, the format lookup and the composition are all the real ones. What
// this proves is the assembly: that a topic posted to a socket comes back as a
// finished job with a url on it.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { bearer, guestToken } from './guest.js';

vi.mock('@orbit/video/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/video/node')>();
  return { ...actual, renderProject: async () => undefined };
});

/* The language model: answers with the story format's own worked example. */
vi.mock('../brain.js', async () => {
  const { story } = await import('@orbit/formats');
  return {
    brainFromEnv: () => ({
      complete: async () => JSON.stringify({ ...story.brief.example, topic: 'Faked' }),
    }),
    openAiCompatibleBrain: () => {
      throw new Error('not used');
    },
  };
});

/* The voice: no ElevenLabs, no ffprobe — a src and a measured-looking length. */
vi.mock('../generation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../generation.js')>();
  return {
    ...actual,
    ElevenLabsVoice: class {
      async speak(text: string) {
        return { src: `upload:vo-${text.length}.mp3`, durationSec: 3.5 };
      }
      async align() {
        throw new Error('401 missing_permissions: speech_to_text');
      }
    },
  };
});

/* The stock search: one usable vertical image per query. */
vi.mock('../stock-provider.js', () => ({
  openverseOrPexels: () => ({
    id: 'fake',
    search: async (q: string) => [
      { id: q, type: 'image', src: `https://cdn/${encodeURIComponent(q)}.jpg`, width: 1080, height: 1920 },
    ],
    getById: async () => ({ id: 'x', type: 'image', src: 'https://cdn/x.jpg', width: 1080, height: 1920 }),
  }),
}));

/* The download: no network, a token straight back. */
vi.mock('../asset-store.js', () => ({
  MediaDirAssetStore: class {
    async fetch(url: string) {
      return `upload:${encodeURIComponent(url).slice(-24)}`;
    }
  },
}));

let server: Server;
let base: string;
let auth: Record<string, string>;

beforeAll(async () => {
  process.env.ORBIT_LLM_BASE_URL = 'https://llm.test/v1';
  process.env.ORBIT_LLM_MODEL = 'test-model';
  process.env.ORBIT_LLM_API_KEY = 'sk-test';
  process.env.ELEVENLABS_API_KEY = 'el-test';
  const { createServer } = await import('../server.js');
  server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  auth = bearer(await guestToken(base));
});

afterAll(() => server.close());

const post = (body: unknown, headers = auth) =>
  fetch(`${base}/v1/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

/**
 * Poll until the job leaves `queued`/`running`.
 *
 * At 250ms, not as fast as possible. The status route is rate limited like
 * every other read, and a tight loop trips it — which is worth knowing about a
 * real client too: poll at about a second, or watch the stream.
 */
async function settle(id: string, ms = 20_000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const res = await fetch(`${base}/v1/generate/${id}`, { headers: auth });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    const job = await res.json();
    if (job.status === 'done' || job.status === 'error') return job;
    if (Date.now() > deadline) throw new Error(`stuck in ${job.status} at ${job.step}: ${job.error ?? ''}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

describe('POST /v1/generate', () => {
  it('needs credentials', async () => {
    expect((await post({ topic: 'x' }, {})).status).toBe(401);
  });

  it('accepts a topic and hands back a job id', async () => {
    const res = await post({ topic: 'why the sky is blue' });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.id).toMatch(/^gen_/);
    expect(body.status).toBe('queued');
  });

  describe('bad requests', () => {
    it('needs a topic', async () => {
      expect((await post({})).status).toBe(400);
      expect((await post({ topic: '   ' })).status).toBe(400);
    });

    /* A topic reaches an LLM prompt and a stock query; it is a line, not a novel. */
    it('bounds the topic', async () => {
      expect((await post({ topic: 'x'.repeat(5000) })).status).toBe(400);
    });

    it('refuses an aspect the engine has no frame size for', async () => {
      expect((await post({ topic: 'x', aspect: 'vertical' })).status).toBe(400);
    });

    /*
     * Resolved at the route, not on the worker. Later it becomes a job that
     * accepts, queues, and then fails for a reason nobody sees until they poll.
     */
    it('refuses an unknown format up front', async () => {
      // A name no archetype will ever take. It used to be 'listicle', which
      // held right up until the countdown format shipped — a negative test
      // aimed at something on the roadmap expires without saying so, and this
      // is the second one in this repo to do exactly that.
      const res = await post({ topic: 'x', format: 'not-a-format' });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/no such format/);
    });
  });
});

describe('the whole flow', () => {
  it('turns a topic into a rendered video', async () => {
    const { id } = await (await post({ topic: 'why the sky is blue' })).json();
    const job = await settle(id);

    expect(job.status).toBe('done');
    expect(job.result.url).toBeTruthy();
    expect(job.result.durationSec).toBeGreaterThan(0);
    expect(job.finishedAt).toBeGreaterThan(0);
  }, 20_000);

  /*
   * The one optional provider step. A key that speaks perfectly well answers
   * 401 here, and the job has to finish anyway — failing it would throw away a
   * generation that has already been paid for, to avoid captions that animate.
   */
  it('finishes even though transcription was refused', async () => {
    const { id } = await (await post({ topic: 'cats' })).json();
    const job = await settle(id);
    expect(job.status).toBe('done');
    expect(job.result.alignmentSkipped).toMatch(/speech_to_text/);
  }, 20_000);

  /*
   * Asserted on the finished row rather than by racing the worker. Sampling
   * mid-flight is a timing test — with fakes the whole pipeline can pass
   * between two polls — and what the column actually promises is that the job
   * records where it got to.
   */
  it('records the step it reached', async () => {
    const { id } = await (await post({ topic: 'doors' })).json();
    const job = await settle(id);
    expect(job.status).toBe('done');
    expect(job.step).toBe('render');
  }, 25_000);

  /* Not yours is not found, exactly as for a render. */
  it('does not show a generation to another account', async () => {
    const { id } = await (await post({ topic: 'private' })).json();
    const other = bearer(await guestToken(base));
    expect((await fetch(`${base}/v1/generate/${id}`, { headers: other })).status).toBe(404);
  });

  it('is 404 for a generation that does not exist', async () => {
    expect((await fetch(`${base}/v1/generate/nope`, { headers: auth })).status).toBe(404);
  });
});
