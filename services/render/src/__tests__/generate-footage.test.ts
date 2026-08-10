// @vitest-environment node
//
// Stock FOOTAGE, over real HTTP, on a box configured for it.
//
// Sibling of `generate-route.test.ts` rather than a case inside it, because the
// thing under test is decided when the server is built: the footage provider is
// constructed from the environment once, and a file can only have one of those.
// This one sets `PEXELS_API_KEY`; that one does not, and asserts the downgrade.
//
// What is faked is the same set — the LLM, the voice, the two stock searches,
// the download and the encoder — so the route, the queue, the worker, the
// format lookup, `generate` and the real `split` composition all run. The
// assertion is on the PROJECT handed to the renderer, because that is where the
// wiring becomes visible: `videoProvider` unset does not fail anything, it
// quietly changes what the clips are.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { VideoProject } from '@layera-labs/orbit-video/browser';
import { bearer, guestToken } from './guest.js';

/** Every project that reached the encoder, in order. */
const rendered: VideoProject[] = [];

vi.mock('@layera-labs/orbit-video/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@layera-labs/orbit-video/node')>();
  return {
    ...actual,
    renderProject: async (project: VideoProject) => {
      rendered.push(project);
      return undefined;
    },
  };
});

/* The language model: the split format's own worked example, always. */
vi.mock('../brain.js', async () => {
  const { split } = await import('@layera-labs/orbit-formats');
  return {
    brainFromEnv: () => ({
      complete: async () => JSON.stringify({ ...split.brief.example, topic: 'Faked' }),
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
        return { src: `upload:vo-${text.length}.mp3`, durationSec: 3.5 };
      }
      async align() {
        throw new Error('401 missing_permissions: speech_to_text');
      }
    },
  };
});

/*
 * The two stock slots, kept genuinely separate.
 *
 * The stills provider answers with images ONLY and the footage provider with
 * videos ONLY — which is not fussiness, it is the real constraint the second
 * slot exists for: `pickAsset` filters on the asset's own `type`, so a scene
 * asking for video against the stills provider gets nothing and fails. If the
 * service ever wires the wrong slot, these fakes fail the way the real ones do.
 *
 * `stockVideoProvider` is gated on the key here exactly as the real one is, so
 * "this box is configured for footage" is still a property of the environment
 * rather than something the test asserts into place.
 */
vi.mock('../stock-provider.js', () => ({
  openverseOrPexels: () => ({
    id: 'fake-stills',
    search: async (q: string) => [
      { id: q, type: 'image', src: `https://cdn/${encodeURIComponent(q)}.jpg`, width: 1080, height: 1920 },
    ],
    getById: async () => ({ id: 'x', type: 'image', src: 'https://cdn/x.jpg', width: 1080, height: 1920 }),
  }),
  stockVideoProvider: (env: NodeJS.ProcessEnv) =>
    env.PEXELS_API_KEY
      ? {
          id: 'fake-footage',
          search: async (q: string) => [
            {
              id: q,
              type: 'video',
              src: `https://cdn/${encodeURIComponent(q)}.mp4`,
              width: 1080,
              height: 1920,
              // Long enough to cover a scene AND the whole video, so the pick
              // is never a duration compromise.
              duration: 120,
            },
          ],
          getById: async () => ({ id: 'x', type: 'video', src: 'https://cdn/x.mp4', width: 1080, height: 1920, duration: 120 }),
        }
      : undefined,
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
let auth: Record<string, string>;

beforeAll(async () => {
  process.env.ORBIT_LLM_BASE_URL = 'https://llm.test/v1';
  process.env.ORBIT_LLM_MODEL = 'test-model';
  process.env.ORBIT_LLM_API_KEY = 'sk-test';
  process.env.ELEVENLABS_API_KEY = 'el-test';
  // The whole point of this file. Set BEFORE the server is built, because the
  // providers are constructed once at startup.
  process.env.PEXELS_API_KEY = 'px-test';
  const { createServer } = await import('../server.js');
  server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  auth = bearer(await guestToken(base));
});

afterAll(() => {
  server.close();
  delete process.env.PEXELS_API_KEY;
});

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
    if (Date.now() > deadline)
      throw new Error(`stuck in ${job.status} at ${job.step}: ${job.error ?? ''}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const generate = async () => {
  const res = await fetch(`${base}/v1/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ topic: 'aeroplane windows', format: 'split', aspect: '9:16' }),
  });
  const { id } = await res.json();
  return settle(id);
};

describe('a box with a stock video key', () => {
  it('says so on /health', async () => {
    const health = await (await fetch(`${base}/health`)).json();
    expect(health.capabilities.stockVideo).toBe(true);
  });

  it('fills the scenes with footage and the split with a filler clip', async () => {
    const before = rendered.length;
    const job = await generate();
    expect(job.status).toBe('done');

    // Nothing was given up, so nothing is reported as given up.
    expect(job.result.visualsDowngraded).toBeUndefined();
    expect(job.result.fillerSkipped).toBeUndefined();

    const project = rendered[before];
    expect(project).toBeTruthy();

    // Narrowed on `kind`, not just the id: an audio track's clips have no
    // `type` at all, so this is what makes the assertions below mean anything.
    type Tracks = NonNullable<VideoProject['tracks']>[number];
    const visualTrack = (id: string) =>
      (project.tracks ?? []).find(
        (t): t is Extract<Tracks, { kind: 'visual' }> => t.id === id && t.kind === 'visual',
      );

    const visual = visualTrack('visual');
    expect(visual?.clips.length).toBeGreaterThan(0);
    // The assertion the missing `videoProvider` line breaks: with the stills
    // slot serving every scene these are all `image`.
    expect(visual!.clips.map((c) => c.type)).toEqual(visual!.clips.map(() => 'video'));

    // And the reason `split` exists: the lower half is a single continuous clip.
    const filler = visualTrack('filler');
    expect(filler?.clips).toHaveLength(1);
    expect(filler!.clips[0].type).toBe('video');
  }, 25_000);
});
