// @vitest-environment node
//
// The LLM brain. The network is faked — there is no key in this environment,
// and a test that called a real endpoint would be a bill rather than a test.
// What is proven is the request we send, and what we do with the several shapes
// of reply that are not a completion.
import { describe, expect, it, vi } from 'vitest';
import { brainFromEnv, openAiCompatibleBrain } from '../brain';

const ok = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const brainWith = (
  fetchImpl: typeof fetch,
  over: Partial<Parameters<typeof openAiCompatibleBrain>[0]> = {},
) =>
  openAiCompatibleBrain({
    baseUrl: 'https://llm.example/v1',
    model: 'some-model',
    apiKey: 'sk-test',
    fetchImpl,
    ...over,
  });

/**
 * A typed fetch stub.
 *
 * `stub(async () => ...)` infers a zero-argument signature, so `mock.calls[0][0]`
 * is an index into an empty tuple and fails to compile — while the test itself
 * passes, because vitest transpiles without checking.
 */
const stub = (impl: (url: string, init?: RequestInit) => Promise<Response>) => vi.fn(impl);

const bodyOf = (net: ReturnType<typeof stub>) =>
  JSON.parse((net.mock.calls[0][1] as RequestInit).body as string);

describe('openAiCompatibleBrain', () => {
  it('returns the completion', async () => {
    const net = stub(async () => ok('{"topic":"x"}'));
    const brain = brainWith(net as unknown as typeof fetch);
    expect(await brain.complete('plan a video')).toBe('{"topic":"x"}');
  });

  it('sends the prompt and the system instruction as messages', async () => {
    const net = stub(async () => ok('x'));
    await brainWith(net as unknown as typeof fetch).complete('plan a video', {
      system: 'reply with JSON',
    });
    expect(bodyOf(net).messages).toEqual([
      { role: 'system', content: 'reply with JSON' },
      { role: 'user', content: 'plan a video' },
    ]);
    expect(bodyOf(net).model).toBe('some-model');
  });

  it('omits the system message when there is none', async () => {
    const net = stub(async () => ok('x'));
    await brainWith(net as unknown as typeof fetch).complete('hello');
    expect(bodyOf(net).messages).toHaveLength(1);
  });

  it('tolerates a base url with a trailing slash', async () => {
    const net = stub(async () => ok('x'));
    await brainWith(net as unknown as typeof fetch, {
      baseUrl: 'https://llm.example/v1/',
    }).complete('hi');
    expect(net.mock.calls[0][0]).toBe('https://llm.example/v1/chat/completions');
  });

  /*
   * `response_format` is an OpenAI extension that compatible endpoints support
   * unevenly, and one that does not recognise it answers 400. Defaulting it on
   * would turn "the model said something odd" — which the planner repairs —
   * into "the generation failed", which it cannot.
   */
  it('does not ask for JSON mode unless told to', async () => {
    const net = stub(async () => ok('x'));
    await brainWith(net as unknown as typeof fetch).complete('hi');
    expect(bodyOf(net).response_format).toBeUndefined();

    const net2 = stub(async () => ok('x'));
    await brainWith(net2 as unknown as typeof fetch, { jsonMode: true }).complete('hi');
    expect(bodyOf(net2).response_format).toEqual({ type: 'json_object' });
  });

  it('leaves sampling to the endpoint unless configured', async () => {
    const net = stub(async () => ok('x'));
    await brainWith(net as unknown as typeof fetch).complete('hi');
    const b = bodyOf(net);
    expect(b.temperature).toBeUndefined();
    expect(b.max_tokens).toBeUndefined();
  });

  describe('failures', () => {
    /*
     * The body is where a provider says the useful thing — an unknown model id,
     * an exhausted quota, an unsupported field. A bare status turns all of them
     * into "the planner failed".
     */
    it('reports what the provider actually said', async () => {
      const net = stub(async () =>
          new Response(JSON.stringify({ error: { message: 'model not found: bogus' } }), {
            status: 404,
          }),
      );
      await expect(
        brainWith(net as unknown as typeof fetch).complete('hi'),
      ).rejects.toThrow(/404.*model not found: bogus/);
    });

    /*
     * An empty completion is refused, not returned. Passing "" up makes
     * `extractJson` say "the reply contained no JSON", which sends the planner
     * retrying against a prompt that was never the problem — a filter, a length
     * cap or a refusal, none of which more prompting fixes.
     */
    it('refuses an empty completion rather than passing it up', async () => {
      for (const body of [
        { choices: [{ message: { content: '' } }] },
        { choices: [{ message: { content: '   ' } }] },
        { choices: [{ message: { content: null } }] },
        { choices: [] },
        {},
      ]) {
        const net = stub(async () => new Response(JSON.stringify(body), { status: 200 }));
        await expect(
          brainWith(net as unknown as typeof fetch).complete('hi'),
        ).rejects.toThrow(/empty completion/);
      }
    });

    /*
     * A hung request would otherwise hold a generation job for as long as the
     * far end keeps the socket open, and the stale-claim sweep is measured in
     * half-hours.
     */
    it('gives up on a request that never answers', async () => {
      const net = vi.fn(
        (_u: unknown, init?: RequestInit) =>
          new Promise<Response>((_res, rej) => {
            init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
          }),
      );
      await expect(
        brainWith(net as unknown as typeof fetch, { timeoutMs: 20 }).complete('hi'),
      ).rejects.toThrow();
    });
  });
});

describe('brainFromEnv', () => {
  const full = {
    ORBIT_LLM_BASE_URL: 'https://llm.example/v1',
    ORBIT_LLM_MODEL: 'some-model',
    ORBIT_LLM_API_KEY: 'sk-test',
  };

  it('builds one when everything is set', () => {
    expect(brainFromEnv(full)).not.toBeNull();
  });

  /* A service with no planner is a valid deployment; the route says 503. */
  it('is null when nothing is configured', () => {
    expect(brainFromEnv({})).toBeNull();
  });

  it('is null when only some of it is configured', () => {
    for (const key of Object.keys(full)) {
      const partial = { ...full, [key]: undefined };
      expect(brainFromEnv(partial)).toBeNull();
    }
  });

  /*
   * Truthiness, not `??`. An empty string is what docker compose passes for an
   * unset variable and `??` does not fire on it — the exact trap that made the
   * password-reset mailer look configured on a box where it was not.
   */
  it('treats an empty variable as unset, the way compose passes one', () => {
    expect(brainFromEnv({ ...full, ORBIT_LLM_API_KEY: '' })).toBeNull();
    expect(brainFromEnv({ ...full, ORBIT_LLM_MODEL: '   ' })).toBeNull();
  });
});

/**
 * The chain, minus the network.
 *
 * Everything above tests one piece. This checks that the brain, the planner and
 * a REAL format actually compose — that what an endpoint returns survives
 * extraction, schema validation and the story archetype's own rules. Each was
 * tested against a fake of the next; nothing until now put the three together.
 */
describe('brain → planner → story', () => {
  it('turns an endpoint reply into a validated story plan', async () => {
    const { planScenes } = await import('@layera-labs/pipeline');
    const { story } = await import('@layera-labs/formats');

    // Fenced and prefaced, the way a model that ignores "JSON only" answers.
    const reply =
      "Sure — here's the plan:\n```json\n" +
      JSON.stringify({ ...story.brief.example, topic: 'Why cats purr' }) +
      '\n```';
    const net = stub(async () => ok(reply));
    const brain = brainWith(net as unknown as typeof fetch);

    const result = await planScenes(brain, {
      topic: 'why cats purr',
      format: story,
      aspect: '9:16',
    });

    expect(result.attempts).toBe(1);
    expect(result.plan.topic).toBe('Why cats purr');
    expect(result.plan.format).toBe('story');
    expect(result.plan.scenes.length).toBeGreaterThanOrEqual(4);
    // The prompt the endpoint actually received is the format's own.
    expect(bodyOf(net).messages[1].content).toContain('4 to 7 scenes');
  });

  /* And a reply that breaks the format's rules is corrected, not accepted. */
  it('sends a rule-breaking plan back with the violation', async () => {
    const { planScenes } = await import('@layera-labs/pipeline');
    const { story } = await import('@layera-labs/formats');

    const bad = {
      ...story.brief.example,
      scenes: [{ narration: 'Too short.', visual: 'a cat' }, ...story.brief.example.scenes.slice(1)],
    };
    const replies = [JSON.stringify(bad), JSON.stringify(story.brief.example)];
    let n = 0;
    const net = stub(async () => ok(replies[Math.min(n++, 1)]));

    const result = await planScenes(brainWith(net as unknown as typeof fetch), {
      topic: 'cats',
      format: story,
      aspect: '9:16',
    });
    expect(result.attempts).toBe(2);
    expect(result.rejected[0]).toMatch(/scenes\[0\]\.narration/);
    // The second request quoted the rejection back.
    expect(bodyOf2(net).messages[1].content).toMatch(/scenes\[0\]\.narration/);
  });
});

const bodyOf2 = (net: ReturnType<typeof stub>) =>
  JSON.parse((net.mock.calls[1][1] as RequestInit).body as string);
