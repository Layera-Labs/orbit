/**
 * The whole generation, with every provider faked.
 *
 * What is worth proving here is the SEQUENCING and the money: that the order
 * which the design forces is the order that runs, that a retry does not pay
 * twice, and that the one optional step degrades instead of throwing four
 * fifths of a paid-for job away.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Asset, AssetProvider } from '@layera-labs/orbit-shared';
import { generate, mapLimit } from '../generate.ts';
import { InMemoryStepLog } from '../steps.ts';
import type { Format } from '../format.ts';
import { composeStory, type ComposeInput } from '../compose.ts';
import type { ScenePlan } from '../scene-plan.ts';
import type { GenerateDeps } from '../generate.ts';

const example: ScenePlan = {
  topic: 'Doors',
  format: 'test',
  aspect: '9:16',
  scenes: [
    { narration: 'One two three four.', visual: 'a red door' },
    { narration: 'Five six seven eight.', visual: 'a blue door' },
  ],
};

const format: Format = {
  id: 'test',
  title: 'Test',
  description: '',
  brief: {
    instructions: 'Be brief.',
    scenes: { min: 1, max: 5 },
    narrationWords: { min: 1, max: 20 },
    onScreenWords: { min: 1, max: 8 },
    example,
  },
  validate: () => undefined,
  /*
   * A REAL compose, recording what it was handed.
   *
   * It used to throw `not used`, and the whole suite passed — which is exactly
   * how `generate` came to call `composeStory` unconditionally while the
   * planner prompted and validated against `req.format`. Every archetype but
   * the default was planned, validated and then silently discarded, and the one
   * test that could have caught it was asserting the opposite.
   */
  compose: (input) => {
    composed.push(input);
    // Delegates to the story composition so the tests below can keep asserting
    // on a real project, while still proving the RUNNER dispatched here.
    return composeStory(input);
  },
};

/** Every `ComposeInput` the runner has handed a format, newest last. */
const composed: ComposeInput[] = [];

const asset = (id: string): Asset => ({
  id,
  type: 'image',
  src: `https://cdn/${id}.jpg`,
  width: 1080,
  height: 1920,
});

function deps(over: Partial<GenerateDeps> = {}) {
  const calls: string[] = [];
  const provider: AssetProvider = {
    id: 'fake',
    search: async (q) => {
      calls.push(`search:${q}`);
      return [asset(q.replace(/\W+/g, '-'))];
    },
    getById: async () => asset('x'),
  };
  const base: GenerateDeps = {
    brain: {
      complete: async () => {
        calls.push('brain');
        return JSON.stringify(example);
      },
    },
    voice: {
      speak: async (text) => {
        calls.push(`speak:${text.slice(0, 3)}`);
        return { src: `vo-${text.length}.mp3`, durationSec: text.length / 4 };
      },
      align: async (src) => {
        calls.push(`align:${src}`);
        return [{ text: 'one', start: 0, end: 1, words: [{ text: 'one', start: 0, end: 1 }] }];
      },
    },
    provider,
    store: { fetch: async (u) => `upload:${u.slice(-10)}` },
    render: async () => {
      calls.push('render');
      return 'https://out/final.mp4';
    },
    log: new InMemoryStepLog(),
    ...over,
  };
  return { deps: base, calls };
}

const req = { topic: 'doors', format, aspect: '9:16' as const };

describe('generate', () => {
  it('runs the forced order and hands back a rendered url', async () => {
    const { deps: d, calls } = deps();
    const out = await generate(d, 'g1', req);

    expect(out.url).toBe('https://out/final.mp4');
    const order = calls.map((c) => c.split(':')[0]);
    expect(order.indexOf('brain')).toBeLessThan(order.indexOf('speak'));
    expect(order.indexOf('speak')).toBeLessThan(order.indexOf('search'));
    expect(order.lastIndexOf('search')).toBeLessThan(order.indexOf('render'));
  });

  /* The regression `createProject` once caused: a project with no media in it
     still renders, as captions over a background, and looks like bad media. */
  it('composes a project that actually contains its media', async () => {
    const { deps: d } = deps();
    const out = await generate(d, 'g1', req);
    expect(out.project.tracks?.length).toBe(2);
    expect(out.project.tracks!.flatMap((t) => t.clips)).toHaveLength(4);
    expect(out.project.overlays.length).toBeGreaterThan(0);
  });

  /* Measured, never estimated: the timeline is laid out from what the voice
     actually took. */
  it('lays the timeline out from the measured durations', async () => {
    const { deps: d } = deps();
    const out = await generate(d, 'g1', req);
    const visual = out.project.tracks!.find((t) => t.kind === 'visual')!;
    const first = example.scenes[0].narration.length / 4;
    expect(visual.clips[0].duration).toBeCloseTo(first, 6);
    expect(visual.clips[1].start).toBeCloseTo(first, 6);
  });

  /* A video clip has to be at least as long as the scene it fills, and that is
     not knowable until the scene has a length. */
  it('asks for visuals long enough for the scene they fill', async () => {
    const search = vi.fn(async () => [asset('a')]);
    const { deps: d } = deps({
      provider: { id: 'f', search, getById: async () => asset('a') },
    });
    await generate(d, 'g1', req);
    expect(search).toHaveBeenCalled();
  });

  /*
   * The property the step log exists for. A render that fails must not make the
   * retry pay for the voice, the alignment and the visuals all over again.
   */
  it('does not re-pay for work a failed attempt already did', async () => {
    const log = new InMemoryStepLog();
    const first = deps({ log, render: async () => { throw new Error('ffmpeg died'); } });
    await expect(generate(first.deps, 'g1', req)).rejects.toThrow('ffmpeg died');

    const second = deps({ log });
    const out = await generate(second.deps, 'g1', req);

    expect(out.url).toBe('https://out/final.mp4');
    // The second attempt spoke to nobody but the renderer.
    expect(second.calls).toEqual(['render']);
    expect(first.calls.filter((c) => c.startsWith('speak'))).toHaveLength(2);
  });

  it('keys steps per scene, so one bad narration costs one retry', async () => {
    const log = new InMemoryStepLog();
    let fail = true;
    const speak = vi.fn(async (text: string) => {
      if (fail && text.startsWith('Five')) throw new Error('elevenlabs 500');
      return { src: `vo-${text.length}.mp3`, durationSec: 4 };
    });
    const d = deps({ log, voice: { speak } });
    await expect(generate(d.deps, 'g1', req)).rejects.toThrow('500');

    fail = false;
    await generate(deps({ log, voice: { speak } }).deps, 'g1', req);
    // Scene 0 spoke once and was remembered; scene 1 spoke twice.
    const said = speak.mock.calls.map((c) => c[0].slice(0, 4));
    expect(said.filter((t) => t === 'One ')).toHaveLength(1);
    expect(said.filter((t) => t === 'Five')).toHaveLength(2);
  });

  describe('alignment degrades', () => {
    /*
     * The only optional provider step. A key that speaks perfectly well answers
     * 401 here, because `speech_to_text` is a separate scope and off by
     * default — and failing the job would throw away a generation that has
     * already been paid for, to avoid captions that animate.
     */
    it('still produces a video when transcription fails', async () => {
      const { deps: d } = deps({
        voice: {
          speak: async (t) => ({ src: `vo-${t.length}.mp3`, durationSec: 4 }),
          align: async () => {
            throw new Error('401 missing_permissions: speech_to_text');
          },
        },
      });
      const out = await generate(d, 'g1', req);
      expect(out.url).toBe('https://out/final.mp4');
      expect(out.alignmentSkipped).toMatch(/speech_to_text/);
      // Per-scene captions rather than per-word: readable, just not animatable.
      expect(out.project.overlays).toHaveLength(2);
      expect((out.project.overlays[0] as { words?: unknown[] }).words).toBeUndefined();
    });

    it('says so when the provider cannot transcribe at all', async () => {
      const { deps: d } = deps({
        voice: { speak: async (t) => ({ src: `vo-${t.length}.mp3`, durationSec: 4 }) },
      });
      const out = await generate(d, 'g1', req);
      expect(out.alignmentSkipped).toMatch(/does not transcribe/);
    });

    it('uses the word timings when it works', async () => {
      const { deps: d } = deps();
      const out = await generate(d, 'g1', req);
      expect(out.alignmentSkipped).toBeUndefined();
      expect((out.project.overlays[0] as { words?: unknown[] }).words).toBeDefined();
    });
  });

  /*
   * Not a preference. ElevenLabs answered the Phase 0 spike with
   * `concurrent_limit_exceeded` at four, and it is a per-subscription cap
   * rather than a rate limit a retry gets around.
   */
  it('never has more provider calls in flight than the ceiling', async () => {
    let live = 0;
    let peak = 0;
    const scenes = Array.from({ length: 8 }, (_, i) => ({
      narration: `Scene number ${i} narration.`,
      visual: `subject ${i}`,
    }));
    const { deps: d } = deps({
      brain: { complete: async () => JSON.stringify({ ...example, scenes }) },
      concurrency: 3,
      voice: {
        speak: async (t) => {
          live++;
          peak = Math.max(peak, live);
          await new Promise((r) => setTimeout(r, 5));
          live--;
          return { src: `vo-${t.length}.mp3`, durationSec: 4 };
        },
      },
    });
    await generate(d, 'g1', req);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('reports which scenes had to settle for a worse picture', async () => {
    const { deps: d } = deps({
      provider: {
        id: 'f',
        // Landscape only: a 9:16 frame keeps a third of its width.
        search: async () => [{ id: 'w', type: 'image', src: 'https://cdn/w.jpg', width: 1920, height: 1080 }],
        getById: async () => asset('w'),
      },
    });
    const out = await generate(d, 'g1', req);
    expect(out.compromises).toHaveLength(2);
    expect(out.compromises[0].gave).toContain('aspect');
  });

  it('reports the step it is on as it goes', async () => {
    const seen: string[] = [];
    const { deps: d } = deps({ onStep: (s) => seen.push(s) });
    await generate(d, 'g1', req);
    expect(seen).toEqual(['plan', 'speak', 'align', 'visuals', 'compose', 'render']);
  });
});

describe('mapLimit', () => {
  it('preserves input order whatever finishes first', async () => {
    const out = await mapLimit([30, 1, 20, 2], 2, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(out).toEqual([30, 1, 20, 2]);
  });

  it('copes with an empty list and a ceiling of zero', async () => {
    expect(await mapLimit([], 3, async (x) => x)).toEqual([]);
    expect(await mapLimit([1, 2], 0, async (x) => x * 2)).toEqual([2, 4]);
  });
});

/** A provider whose results are VIDEO, so `pickAsset`'s kind filter passes. */
const videoProvider: AssetProvider = {
  id: 'fake-video',
  search: async (q) => [
    {
      id: q.replace(/\W+/g, '-'),
      type: 'video',
      src: `https://cdn/${q.replace(/\W+/g, '-')}.mp4`,
      width: 1080,
      height: 1920,
      duration: 600,
    },
  ],
  getById: async () => ({ id: 'x', type: 'video', src: 'https://cdn/x.mp4' }),
};

describe('the format decides', () => {
  it('composes with the FORMAT, not with the story', async () => {
    // The regression. Everything else in this file passed while this was false.
    composed.length = 0;
    const { deps: d } = deps();
    const seen: ComposeInput[] = [];
    const f: Format = { ...format, compose: (i) => (seen.push(i), format.compose(i)) };
    await generate(d, 'g-fmt', { ...req, format: f });
    expect(seen).toHaveLength(1);
    expect(seen[0].plan.scenes).toHaveLength(2);
  });

  it('asks for footage when the format wants it, and stills when it does not', async () => {
    for (const [visualKind, want] of [['video', 'video'], ['image', 'image']] as const) {
      composed.length = 0;
      const { deps: d } = deps({ videoProvider });
      await generate(d, `g-${visualKind}`, {
        ...req,
        format: { ...format, needs: { visualKind } },
      });
      expect(composed.at(-1)!.visuals.every((v) => v.type === want)).toBe(true);
    }
  });

  it('falls back to stills, and SAYS so, when the box has no video provider', async () => {
    /*
     * A generation that has already paid for a language model and a voice must
     * not die because the deployment has photos only — and it must not quietly
     * serve a slideshow either, which is indistinguishable from a format that
     * never wanted footage.
     */
    composed.length = 0;
    const { deps: d } = deps(); // no videoProvider
    const out = await generate(d, 'g-nofallback', {
      ...req,
      format: { ...format, needs: { visualKind: 'video' } },
    });
    expect(composed.at(-1)!.visuals.every((v) => v.type === 'image')).toBe(true);
    expect(out.visualsDowngraded).toMatch(/stock video/);
    expect(out.url).toBe('https://out/final.mp4');
  });

  it('resolves a filler long enough for the whole video', async () => {
    composed.length = 0;
    const { deps: d } = deps({ videoProvider });
    await generate(d, 'g-filler', {
      ...req,
      format: { ...format, needs: { visualKind: 'video', filler: 'abstract loop' } },
    });
    expect(composed.at(-1)!.filler).toBeTruthy();
  });

  it('loses the filler rather than the video when it cannot be found', async () => {
    composed.length = 0;
    const empty: AssetProvider = { ...videoProvider, search: async () => [] };
    const { deps: d } = deps({ videoProvider: empty });
    const out = await generate(d, 'g-nofiller', {
      ...req,
      // Stills for the scenes, so only the FILLER search comes up empty.
      format: { ...format, needs: { visualKind: 'image', filler: 'abstract loop' } },
    });
    expect(out.url).toBe('https://out/final.mp4');
    expect(out.fillerSkipped).toBeTruthy();
    expect(composed.at(-1)!.filler).toBeUndefined();
  });

  it('asks for no filler at all when the format wants none', async () => {
    composed.length = 0;
    const { deps: d, calls } = deps({ videoProvider });
    await generate(d, 'g-plain', req);
    expect(calls.some((c) => c.includes('abstract'))).toBe(false);
    expect(composed.at(-1)!.filler).toBeUndefined();
  });
});
